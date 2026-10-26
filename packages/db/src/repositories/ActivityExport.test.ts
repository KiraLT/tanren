import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { ActivityExportId, SessionId, UserId } from "@tanren/shared"
import { DateTime, Effect, Layer, MutableRef, Option } from "effect"
import { D1Layer } from "../client"
import { TestLayer } from "../testing/fixtures"
import { ActivityExportRepo, type ExportOutcome, type NewExport } from "./ActivityExport"

const uuid = (prefix: number, n: number) =>
  `${prefix.toString().padStart(8, "0")}-0000-4000-8000-${n.toString().padStart(12, "0")}`
const userOf = (n: number) => UserId.make(uuid(90, n))
const exportId = (n: number) => ActivityExportId.make(uuid(91, n))
const time = (iso: string) => DateTime.makeUnsafe(iso)
const T0 = time("2026-10-26T10:00:00.000Z")

const fresh = (n: number, userId: UserId, overrides: Partial<NewExport> = {}): NewExport => ({
  id: exportId(n),
  userId,
  provider: "strava",
  sessionId: SessionId.make(uuid(92, n)),
  nextAttemptAt: T0,
  createdAt: T0,
  ...overrides,
})

const listAll = (userId: UserId, limit = 50) =>
  Effect.gen(function* () {
    const repo = yield* ActivityExportRepo
    return yield* repo.list(userId, "strava", limit)
  })

/** Counts statement executions (not `prepare`s: the client caches those), batch members included. */
const countingD1 = (db: D1Database) => {
  const ref = MutableRef.make(0)
  const add = (n: number) => MutableRef.update(ref, (total) => total + n)
  const forward = (target: object, prop: string | symbol): unknown => {
    const value: unknown = Reflect.get(target, prop)
    return typeof value === "function" ? value.bind(target) : value
  }
  const EXECUTE = new Set<string | symbol>(["first", "run", "all", "raw"])
  const statement = (real: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(real, {
      get: (target, prop) =>
        prop === "bind"
          ? (...values: ReadonlyArray<unknown>) => statement(target.bind(...values))
          : EXECUTE.has(prop)
            ? (...args: ReadonlyArray<unknown>) => {
                add(1)
                return Reflect.apply(Reflect.get(target, prop), target, args)
              }
            : forward(target, prop),
    })
  const counted = new Proxy(db, {
    get: (target, prop) =>
      prop === "prepare"
        ? (query: string) => statement(target.prepare(query))
        : prop === "batch"
          ? (statements: Array<D1PreparedStatement>) => {
              add(statements.length)
              return target.batch(statements)
            }
          : forward(target, prop),
  })
  return { db: counted, statements: () => MutableRef.get(ref) }
}

const counted = countingD1(env.DB)
const CountedLayer = ActivityExportRepo.layer.pipe(Layer.provide(D1Layer(counted.db)))

describe("ActivityExportRepo.enqueue", () => {
  it.effect("keeps one row for the same (user, provider, session) key", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(1)
      const first = fresh(1, user)
      yield* repo.enqueue([first])
      yield* repo.enqueue([{ ...first, id: exportId(2) }])
      const rows = yield* listAll(user)
      expect(rows.map((row) => row.id)).toEqual([first.id])
      expect(rows[0]).toMatchObject({ status: "pending", attempts: 0 })
      expect(rows[0]?.externalActivityId).toEqual(Option.none())
      expect(rows[0]?.lastError).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("inserts several rows in one batch and runs no statement for []", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(3)
      const before = counted.statements()
      yield* repo.enqueue([])
      expect(counted.statements() - before).toBe(0)
      yield* repo.enqueue([fresh(3, user), fresh(4, user)])
      expect(counted.statements() - before).toBe(2)
      expect((yield* repo.list(user, "strava", 10)).length).toBe(2)
    }).pipe(Effect.provide(CountedLayer)),
  )
})

describe("ActivityExportRepo.claimDue", () => {
  it.effect("claims a pending row once under two concurrent calls", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(10)
      yield* repo.enqueue([fresh(10, user)])
      const opts = { userId: Option.some(user), max: 5 }
      const [a, b] = yield* Effect.all([repo.claimDue(T0, opts), repo.claimDue(T0, opts)], {
        concurrency: 2,
      })
      expect(a.length + b.length).toBe(1)
      const claimed = [...a, ...b][0]
      expect(claimed).toMatchObject({ id: exportId(10), status: "running" })
      expect(claimed?.updatedAt).toEqual(T0)
      expect(yield* repo.claimDue(T0, opts)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("does not claim a row that is not yet due", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(11)
      yield* repo.enqueue([fresh(11, user, { nextAttemptAt: time("2026-10-26T10:05:00.000Z") })])
      const opts = { userId: Option.some(user), max: 5 }
      expect(yield* repo.claimDue(time("2026-10-26T10:04:59.000Z"), opts)).toEqual([])
      const due = yield* repo.claimDue(time("2026-10-26T10:05:00.000Z"), opts)
      expect(due.map((row) => row.id)).toEqual([exportId(11)])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("skips a blocked row that is not yet due and claims one that is", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(60)
      const retryAt = time("2026-10-26T16:00:00.000Z")
      yield* repo.enqueue([fresh(85, user)])
      yield* repo.settle(exportId(85), {
        _tag: "Blocked",
        reason: "app_inactive",
        nextAttemptAt: retryAt,
        now: T0,
      })
      const opts = { userId: Option.some(user), max: 5 }
      expect(yield* repo.claimDue(time("2026-10-26T15:59:59.000Z"), opts)).toEqual([])
      const due = yield* repo.claimDue(retryAt, opts)
      expect(due.map((row) => [row.id, row.status])).toEqual([[exportId(85), "running"]])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reclaims a running row after 10 minutes, not before", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(12)
      yield* repo.enqueue([fresh(12, user)])
      const opts = { userId: Option.some(user), max: 5 }
      expect((yield* repo.claimDue(T0, opts)).length).toBe(1)
      expect(yield* repo.claimDue(time("2026-10-26T10:09:59.000Z"), opts)).toEqual([])
      expect(yield* repo.claimDue(time("2026-10-26T10:10:00.000Z"), opts)).toEqual([])
      const later = time("2026-10-26T10:10:01.000Z")
      const [reclaimed, again] = yield* Effect.all(
        [repo.claimDue(later, opts), repo.claimDue(later, opts)],
        { concurrency: 2 },
      )
      expect(reclaimed.length + again.length).toBe(1)
      expect([...reclaimed, ...again][0]).toMatchObject({ id: exportId(12), status: "running" })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("respects max and claims the oldest due rows first", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(13)
      yield* repo.enqueue([
        fresh(13, user, { nextAttemptAt: time("2026-10-26T09:03:00.000Z") }),
        fresh(14, user, { nextAttemptAt: time("2026-10-26T09:01:00.000Z") }),
        fresh(15, user, { nextAttemptAt: time("2026-10-26T09:02:00.000Z") }),
      ])
      const claimed = yield* repo.claimDue(T0, { userId: Option.some(user), max: 2 })
      expect(claimed.map((row) => row.id)).toEqual([exportId(14), exportId(15)])
      const rest = yield* repo.claimDue(T0, { userId: Option.some(user), max: 2 })
      expect(rest.map((row) => row.id)).toEqual([exportId(13)])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("with userId Some claims only that user's rows; None claims any user's", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const mine = userOf(16)
      const theirs = userOf(17)
      yield* repo.enqueue([fresh(16, mine), fresh(17, theirs)])
      const own = yield* repo.claimDue(T0, { userId: Option.some(mine), max: 10 })
      expect(own.map((row) => row.id)).toEqual([exportId(16)])
      const any = yield* repo.claimDue(T0, { userId: Option.none(), max: 100 })
      expect(any.map((row) => row.id)).toContain(exportId(17))
      expect(any.map((row) => row.id)).not.toContain(exportId(16))
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ActivityExportRepo.settle", () => {
  const settled = (n: number, user: UserId, outcome: ExportOutcome) =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      yield* repo.enqueue([fresh(n, user)])
      yield* repo.settle(exportId(n), outcome)
      const rows = yield* repo.list(user, "strava", 5)
      return rows[0]
    })
  const later = time("2026-10-26T10:30:00.000Z")

  it.effect("Sent stores the external id and clears the error", () =>
    Effect.gen(function* () {
      const row = yield* settled(20, userOf(20), {
        _tag: "Sent",
        externalActivityId: "console-abc",
        now: later,
      })
      expect(row).toMatchObject({ status: "sent", attempts: 1 })
      expect(row?.externalActivityId).toEqual(Option.some("console-abc"))
      expect(row?.lastError).toEqual(Option.none())
      expect(row?.updatedAt).toEqual(later)
      expect(row?.nextAttemptAt).toEqual(T0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Failed and Dead store the reason", () =>
    Effect.gen(function* () {
      const failed = yield* settled(21, userOf(21), {
        _tag: "Failed",
        reason: "rejected",
        now: later,
      })
      expect(failed).toMatchObject({ status: "failed", attempts: 1 })
      expect(failed?.lastError).toEqual(Option.some("rejected"))
      const dead = yield* settled(22, userOf(22), {
        _tag: "Dead",
        reason: "session_missing",
        now: later,
      })
      expect(dead).toMatchObject({ status: "dead", attempts: 1 })
      expect(dead?.lastError).toEqual(Option.some("session_missing"))
      expect(dead?.externalActivityId).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Blocked parks the row with the reason, the retry time and one more attempt", () =>
    Effect.gen(function* () {
      const next = time("2026-10-26T16:30:00.000Z")
      const row = yield* settled(24, userOf(24), {
        _tag: "Blocked",
        reason: "app_inactive",
        nextAttemptAt: next,
        now: later,
      })
      expect(row).toMatchObject({ status: "blocked", attempts: 1 })
      expect(row?.lastError).toEqual(Option.some("app_inactive"))
      expect(row?.nextAttemptAt).toEqual(next)
      expect(row?.updatedAt).toEqual(later)
      expect(row?.externalActivityId).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Pending reschedules and counts every attempt", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(23)
      const next = time("2026-10-26T10:31:00.000Z")
      const row = yield* settled(23, user, {
        _tag: "Pending",
        reason: "transport",
        nextAttemptAt: next,
        now: later,
      })
      expect(row).toMatchObject({ status: "pending", attempts: 1 })
      expect(row?.nextAttemptAt).toEqual(next)
      expect(row?.lastError).toEqual(Option.some("transport"))
      yield* repo.settle(exportId(23), {
        _tag: "Pending",
        reason: "rate_limited",
        nextAttemptAt: time("2026-10-26T12:00:00.000Z"),
        now: later,
      })
      const again = (yield* repo.list(user, "strava", 5))[0]
      expect(again).toMatchObject({ status: "pending", attempts: 2 })
      expect(again?.lastError).toEqual(Option.some("rate_limited"))
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ActivityExportRepo.list", () => {
  it.effect("is newest first, limited, and isolated per user", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const mine = userOf(30)
      const theirs = userOf(31)
      yield* repo.enqueue([
        fresh(30, mine, { createdAt: time("2026-10-26T08:00:00.000Z") }),
        fresh(31, mine, { createdAt: time("2026-10-26T09:00:00.000Z") }),
        fresh(32, mine, { createdAt: time("2026-10-26T07:00:00.000Z") }),
        fresh(33, theirs, { createdAt: time("2026-10-26T11:00:00.000Z") }),
      ])
      const all = yield* repo.list(mine, "strava", 10)
      expect(all.map((row) => row.id)).toEqual([exportId(31), exportId(30), exportId(32)])
      const top = yield* repo.list(mine, "strava", 2)
      expect(top.map((row) => row.id)).toEqual([exportId(31), exportId(30)])
      expect((yield* repo.list(theirs, "strava", 10)).map((row) => row.id)).toEqual([exportId(33)])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ActivityExportRepo.resetToPending", () => {
  const lastTime = time("2026-10-26T11:00:00.000Z")
  const stateOf = (n: number, user: UserId, outcome: Option.Option<ExportOutcome>) =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      yield* repo.enqueue([fresh(n, user)])
      if (Option.isSome(outcome)) {
        yield* repo.settle(exportId(n), outcome.value)
      }
    })

  it.effect("resets failed and dead rows to a fresh pending one", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(40)
      yield* stateOf(40, user, Option.some({ _tag: "Failed", reason: "rejected", now: T0 }))
      yield* stateOf(41, user, Option.some({ _tag: "Dead", reason: "transport", now: T0 }))
      expect(yield* repo.resetToPending(user, exportId(40), lastTime)).toBe(true)
      expect(yield* repo.resetToPending(user, exportId(41), lastTime)).toBe(true)
      const rows = yield* repo.list(user, "strava", 5)
      expect(rows.map((row) => [row.status, row.attempts])).toEqual([
        ["pending", 0],
        ["pending", 0],
      ])
      expect(
        rows.every((row) => row.nextAttemptAt.epochMilliseconds === lastTime.epochMilliseconds),
      ).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("resets a blocked row to a fresh pending one", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(45)
      yield* stateOf(
        45,
        user,
        Option.some({ _tag: "Blocked", reason: "app_inactive", nextAttemptAt: lastTime, now: T0 }),
      )
      expect(yield* repo.resetToPending(user, exportId(45), lastTime)).toBe(true)
      const row = (yield* repo.list(user, "strava", 5))[0]
      expect(row).toMatchObject({ status: "pending", attempts: 0 })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("returns false for sent, pending, unknown and another user's rows", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(42)
      yield* stateOf(42, user, Option.some({ _tag: "Sent", externalActivityId: "x", now: T0 }))
      yield* stateOf(43, user, Option.none())
      yield* stateOf(44, userOf(43), Option.some({ _tag: "Failed", reason: "rejected", now: T0 }))
      expect(yield* repo.resetToPending(user, exportId(42), lastTime)).toBe(false)
      expect(yield* repo.resetToPending(user, exportId(43), lastTime)).toBe(false)
      expect(yield* repo.resetToPending(user, exportId(999), lastTime)).toBe(false)
      expect(yield* repo.resetToPending(user, exportId(44), lastTime)).toBe(false)
      const theirs = (yield* repo.list(userOf(43), "strava", 5))[0]
      expect(theirs?.status).toBe("failed")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ActivityExportRepo.counts", () => {
  it.effect("sums pending+running and failed+dead, and finds the newest sent", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(50)
      yield* repo.enqueue([1, 2, 3, 4, 5, 6, 7].map((n) => fresh(50 + n, user)))
      const settle = (n: number, outcome: ExportOutcome) => repo.settle(exportId(50 + n), outcome)
      // 1 and 2 stay pending; 3 becomes running; 4 failed; 5 dead; 6 and 7 sent.
      yield* repo.claimDue(T0, { userId: Option.some(user), max: 100 })
      yield* Effect.forEach([1, 2], (n) =>
        settle(n, { _tag: "Pending", reason: "transport", nextAttemptAt: T0, now: T0 }),
      )
      yield* settle(4, { _tag: "Failed", reason: "rejected", now: T0 })
      yield* settle(5, { _tag: "Dead", reason: "transport", now: T0 })
      yield* settle(6, {
        _tag: "Sent",
        externalActivityId: "a",
        now: time("2026-10-26T10:01:00.000Z"),
      })
      yield* settle(7, {
        _tag: "Sent",
        externalActivityId: "b",
        now: time("2026-10-26T10:02:00.000Z"),
      })
      // 3 stays `running` (claimed, never settled).
      const counts = yield* repo.counts(user, "strava")
      expect(counts.pending).toBe(3)
      expect(counts.failed).toBe(2)
      expect(counts.lastSentAt).toEqual(Option.some(time("2026-10-26T10:02:00.000Z")))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is zero and None for a user without exports", () =>
    Effect.gen(function* () {
      const counts = yield* (yield* ActivityExportRepo).counts(userOf(51), "strava")
      expect(counts).toEqual({ pending: 0, failed: 0, blocked: 0, lastSentAt: Option.none() })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("splits pending, failed and blocked (blocked is not failed)", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const user = userOf(53)
      yield* repo.enqueue([1, 2, 3, 4].map((n) => fresh(80 + n, user)))
      const settle = (n: number, outcome: ExportOutcome) => repo.settle(exportId(80 + n), outcome)
      // 1 stays pending; 2 failed; 3 and 4 blocked.
      yield* settle(2, { _tag: "Failed", reason: "rejected", now: T0 })
      yield* Effect.forEach([3, 4], (n) =>
        settle(n, { _tag: "Blocked", reason: "app_inactive", nextAttemptAt: T0, now: T0 }),
      )
      const counts = yield* repo.counts(user, "strava")
      expect(counts).toEqual({ pending: 1, failed: 1, blocked: 2, lastSentAt: Option.none() })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("runs exactly one statement", () =>
    Effect.gen(function* () {
      const user = userOf(52)
      const repo = yield* ActivityExportRepo
      yield* repo.enqueue([fresh(70, user)])
      const before = counted.statements()
      yield* repo.counts(user, "strava")
      expect(counted.statements() - before).toBe(1)
    }).pipe(Effect.provide(CountedLayer)),
  )
})
