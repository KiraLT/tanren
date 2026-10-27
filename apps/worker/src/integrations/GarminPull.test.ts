import { describe, expect, it } from "@effect/vitest"
import {
  SealedToken as DbSealedToken,
  GarminImportRepo,
  IntegrationRepo,
  type IntegrationRow,
  PersistenceError,
} from "@tanren/db"
import {
  DailyHealthInsert,
  type ExportFailureReason,
  ImportedActivityInsert,
  Label,
  type LocalDate,
  UserId,
  Uuid,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  Layer,
  Logger,
  Option,
  Redacted,
  Ref,
} from "effect"
import { TestClock } from "effect/testing"
import { memoryPersistence } from "../app"
import { MemoryStore } from "../repos"
import { envVars as env } from "../testing/fixtures"
import { GARMIN_PAGE_SIZE, GarminApi, GarminApiError, type GarminApiShape } from "./GarminApi"
import { GARMIN_CALL_BUDGET, GARMIN_MAX_USERS_PER_RUN, GarminPull, readCursor } from "./GarminPull"
import { TokenSeal } from "./TokenSeal"

const NOW = Date.UTC(2026, 9, 27, 10, 0)
const KEY = "pasted-personal-key-abcdef0123456789"
const JWT = "header.stored-jwt-payload.signature"
const FRESH_JWT = "header.fresh-jwt-payload.signature"

const userId = (n: number) => UserId.make(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
const rowId = (n: number) => Uuid.make(`73000000-0000-4000-8000-${String(n).padStart(12, "0")}`)

type Call = "exchange" | "profile" | "activities" | "daily"
interface Script {
  /** Per call kind: the reason to fail with, or none. `exchange` failing also fails. */
  readonly fail?: Partial<Record<Call, ExportFailureReason>>
  /** Every activity page is full (`more: true`). */
  readonly endless?: boolean
  /** Serve these activities like Garmin: filtered to the window's dates, paged by `start`. */
  readonly catalog?: ReadonlyArray<ImportedActivityInsert>
}

const activityOn = (day: string, n: number) =>
  ImportedActivityInsert.make({
    provider: "garmin",
    externalId: `c-${day}-${n}`,
    sport: "running",
    title: Label.make("Run"),
    startedAt: DateTime.makeUnsafe(`${day}T0${n}:00:00.000Z`),
    durationSeconds: 1200,
    distanceMeters: Option.none(),
    calories: Option.none(),
    avgHeartRate: Option.none(),
    maxHeartRate: Option.none(),
  })

/** One page of `catalog` as Garmin would serve it for `window` from offset `start`. */
const catalogPage = (
  catalog: ReadonlyArray<ImportedActivityInsert>,
  window: { readonly startDate: string; readonly endDate: string },
  start: number,
) => {
  const inWindow = catalog.filter((a) => {
    const day = DateTime.formatIsoDateUtc(a.startedAt)
    return day >= window.startDate && day <= window.endDate
  })
  const items = inWindow.slice(start, start + GARMIN_PAGE_SIZE)
  return { items, more: items.length === GARMIN_PAGE_SIZE }
}

const failure = (reason: ExportFailureReason) =>
  new GarminApiError({ reason, status: Option.some(reason === "rate_limited" ? 429 : 401) })

/** A scripted `GarminApi` recording every call (kind + argument summary). */
const scripted = (script: Script, calls: Ref.Ref<ReadonlyArray<string>>) => {
  const record = (entry: string, kind: Call) =>
    Ref.update(calls, Arr.append(entry)).pipe(
      Effect.andThen(
        Option.match(Option.fromNullishOr(script.fail?.[kind]), {
          onNone: () => Effect.void,
          onSome: (reason) => Effect.fail(failure(reason)),
        }),
      ),
    )
  const api: GarminApiShape = {
    exchange: () =>
      record("exchange", "exchange").pipe(
        Effect.as({
          jwt: Redacted.make(FRESH_JWT),
          expiresAt: DateTime.makeUnsafe(NOW + 23 * 3_600_000),
        }),
      ),
    profile: () =>
      record("profile", "profile").pipe(
        Effect.as({ displayName: Option.some(Label.make("Stub")) }),
      ),
    activities: (_jwt, window, start) =>
      record(`activities ${window.startDate}..${window.endDate} @${start}`, "activities").pipe(
        Effect.as(
          Option.map(Option.fromNullishOr(script.catalog), (c) => catalogPage(c, window, start)),
        ),
        Effect.map((page) =>
          Option.getOrElse(page, () => ({
            items: [
              ImportedActivityInsert.make({
                provider: "garmin",
                externalId: `a${start}`,
                sport: "running",
                title: Label.make("Run"),
                startedAt: DateTime.makeUnsafe(NOW - 86_400_000),
                durationSeconds: 1200,
                distanceMeters: Option.some(3000),
                calories: Option.none(),
                avgHeartRate: Option.none(),
                maxHeartRate: Option.none(),
              }),
            ],
            more: script.endless === true,
          })),
        ),
      ),
    daily: (_jwt, date: LocalDate) =>
      record(`daily ${date}`, "daily").pipe(
        Effect.as(
          Option.some(
            DailyHealthInsert.make({
              provider: "garmin",
              date,
              totalCalories: Option.some(2500),
              activeCalories: Option.some(500),
              steps: Option.some(8000),
              restingHeartRate: Option.some(55),
            }),
          ),
        ),
      ),
  }
  return Layer.succeed(GarminApi, GarminApi.of(api))
}

/** A logger that records every line, so the test can prove no key or JWT reaches the log. */
const capturedLogs = () => {
  const lines = Ref.makeUnsafe<ReadonlyArray<string>>([])
  const logger = Logger.make((options) => {
    Effect.runSync(
      Ref.update(lines, Arr.append(JSON.stringify([options.message, String(options.cause)]))),
    )
  })
  return { lines: Ref.get(lines), layer: Logger.layer([logger]) }
}

interface Setup {
  readonly scope?: string
  /** Minutes from NOW until the stored JWT expires (default 12 h). */
  readonly expiresInMinutes?: number
  readonly users?: number
  /** `upsertActivities` fails like D1 when another writer took the natural key first. */
  readonly race?: boolean
}

/** The D1 error chain of a unique-index race: PersistenceError → SqlError-like → D1 error. */
const raceError = new PersistenceError({
  operation: "garminImport.upsertActivities",
  cause: new PersistenceError({
    operation: "syncStore.apply",
    cause: {
      message: "D1 batch failed",
      cause: new Error(
        "D1_ERROR: UNIQUE constraint failed: imported_activity.user_id, imported_activity.provider, imported_activity.external_id: SQLITE_CONSTRAINT",
      ),
    },
  }),
})

/** Memory persistence + seal + scripted Garmin; seeds `users` active Garmin rows. */
const setup = (script: Script, opts: Setup = {}) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW)
    const calls = yield* Ref.make<ReadonlyArray<string>>([])
    const logs = capturedLogs()
    const persistence = yield* Layer.build(memoryPersistence(MemoryStore.layer))
    const seal = TokenSeal.layerWithKey(Redacted.make(env.INTEGRATION_TOKEN_KEY))
    const baseImports = Context.get(persistence, GarminImportRepo)
    /** Every import write (one D1 `SyncStore.apply` each in production), with its row count. */
    const writes = yield* Ref.make<ReadonlyArray<string>>([])
    const counted = Layer.succeed(
      GarminImportRepo,
      GarminImportRepo.of({
        ...baseImports,
        upsertActivities: (user, rows) =>
          Ref.update(writes, Arr.append(`activities ${rows.length}`)).pipe(
            Effect.andThen(
              opts.race === true
                ? Effect.fail(raceError)
                : baseImports.upsertActivities(user, rows),
            ),
          ),
        upsertDays: (user, rows) =>
          Ref.update(writes, Arr.append(`days ${rows.length}`)).pipe(
            Effect.andThen(baseImports.upsertDays(user, rows)),
          ),
      }),
    )
    const services = Layer.mergeAll(
      Layer.succeedContext(persistence),
      counted,
      seal,
      scripted(script, calls),
    )
    const context = yield* Layer.build(
      Layer.merge(GarminPull.layer.pipe(Layer.provide(services)), services),
    )
    const sealer = Context.get(context, TokenSeal)
    const integrations = Context.get(context, IntegrationRepo)
    const imports = Context.get(context, GarminImportRepo)
    yield* Effect.forEach(Arr.range(1, opts.users ?? 1), (n) =>
      Effect.gen(function* () {
        const bound = { userId: userId(n), provider: "garmin" } as const
        const key = yield* sealer.seal(Redacted.make(KEY), { ...bound, slot: "refresh" })
        const jwt = yield* sealer.seal(Redacted.make(JWT), { ...bound, slot: "access" })
        const row: IntegrationRow = {
          id: rowId(n),
          userId: userId(n),
          provider: "garmin",
          status: "active",
          externalId: "personal",
          displayName: "Stub",
          accessToken: DbSealedToken.make(jwt),
          refreshToken: DbSealedToken.make(key),
          expiresAt: DateTime.makeUnsafe(NOW + (opts.expiresInMinutes ?? 720) * 60_000),
          scope: opts.scope ?? "",
          createdAt: DateTime.makeUnsafe(NOW - 3_600_000 + n),
          updatedAt: DateTime.makeUnsafe(NOW - 3_600_000 + n),
        }
        return yield* integrations.upsert(row)
      }),
    )
    const pull = Context.get(context, GarminPull)
    const run = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.provide(logs.layer))
    const row = (n = 1) =>
      integrations.get(userId(n), "garmin").pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.die(`no garmin row for user ${n}`),
            onSome: Effect.succeed,
          }),
        ),
      )
    return {
      calls: Ref.get(calls),
      writes: Ref.get(writes),
      logs: logs.lines,
      integrations,
      imports,
      pull,
      run,
      row,
    }
  })

const storedCursor = JSON.stringify({
  activitiesSince: "2026-10-20T00:00:00.000Z",
  healthThrough: "2026-10-22",
  lastPullAt: "2026-10-23T10:00:00.000Z",
  lastError: null,
})

describe("GarminPull cursor", () => {
  it("empty or undecodable scope reads as no cursor", () => {
    expect(readCursor("")).toEqual(Option.none())
    expect(readCursor("{not json")).toEqual(Option.none())
    expect(readCursor(JSON.stringify({ activitiesSince: "yesterday" }))).toEqual(Option.none())
    expect(Option.isSome(readCursor(storedCursor))).toBe(true)
  })

  it.effect("no cursor: the first 10-day window from today − 30 d, the 7 days up to today", () =>
    Effect.gen(function* () {
      const t = yield* setup({}, { scope: "{garbage" })
      yield* t.run(t.pull.drainUser(userId(1)))
      expect(yield* t.calls).toEqual([
        "activities 2026-09-27..2026-10-06 @0",
        "daily 2026-10-21",
        "daily 2026-10-22",
        "daily 2026-10-23",
        "daily 2026-10-24",
        "daily 2026-10-25",
        "daily 2026-10-26",
        "daily 2026-10-27",
      ])
      expect(readCursor((yield* t.row()).scope)).toEqual(
        Option.some({
          // The window was read in full: the next run starts the day after it.
          activitiesSince: DateTime.makeUnsafe("2026-10-07T00:00:00.000Z"),
          healthThrough: "2026-10-26",
          lastPullAt: Option.some(DateTime.makeUnsafe(NOW)),
          lastError: Option.none(),
          lastAttemptAt: DateTime.makeUnsafe(NOW),
        }),
      )
      expect(yield* t.imports.counts(userId(1), "garmin")).toEqual({ activities: 1, days: 7 })
    }),
  )

  it.effect("a stored cursor continues from activitiesSince and the day after healthThrough", () =>
    Effect.gen(function* () {
      const t = yield* setup({}, { scope: storedCursor })
      yield* t.run(t.pull.drainUser(userId(1)))
      const calls = yield* t.calls
      expect(calls[0]).toBe("activities 2026-10-20..2026-10-27 @0")
      expect(calls.slice(1)).toEqual([
        "daily 2026-10-23",
        "daily 2026-10-24",
        "daily 2026-10-25",
        "daily 2026-10-26",
        "daily 2026-10-27",
      ])
    }),
  )
})

describe("GarminPull failures", () => {
  it.effect("a data-call 401 re-exchanges once, then a second 401 revokes the row", () =>
    Effect.gen(function* () {
      const t = yield* setup({ fail: { activities: "token_rejected" } })
      yield* t.run(t.pull.drainUser(userId(1)))
      const calls = yield* t.calls
      expect(calls.filter((c) => c === "exchange")).toHaveLength(1)
      expect(calls.filter((c) => c.startsWith("activities"))).toHaveLength(2)
      const row = yield* t.row()
      expect(row.status).toBe("revoked")
      expect(Option.flatMap(readCursor(row.scope), (c) => c.lastError)).toEqual(
        Option.some("token_rejected"),
      )
    }),
  )

  it.effect("a refused key on re-exchange revokes without a second data call", () =>
    Effect.gen(function* () {
      const t = yield* setup({ fail: { activities: "token_rejected", exchange: "token_rejected" } })
      yield* t.run(t.pull.drainUser(userId(1)))
      expect(yield* t.calls).toEqual(["activities 2026-09-27..2026-10-06 @0", "exchange"])
      expect((yield* t.row()).status).toBe("revoked")
    }),
  )

  it.effect("429 keeps the cursor, records lastError rate_limited and keeps the row active", () =>
    Effect.gen(function* () {
      const t = yield* setup({ fail: { daily: "rate_limited" } }, { scope: storedCursor })
      yield* t.run(t.pull.drainUser(userId(1)))
      const row = yield* t.row()
      expect(row.status).toBe("active")
      expect(readCursor(row.scope)).toEqual(
        Option.map(readCursor(storedCursor), (c) => ({
          ...c,
          // The attempt is stamped (cron fairness); `lastPullAt` (last success) and the data
          // window stay as stored.
          lastError: Option.some("rate_limited" as const),
          lastAttemptAt: DateTime.makeUnsafe(NOW),
        })),
      )
      // One daily call, then the user stops: no more Garmin calls this run.
      expect((yield* t.calls).filter((c) => c.startsWith("daily"))).toHaveLength(1)
    }),
  )
})

describe("GarminPull tokens and budget", () => {
  it.effect("a JWT within REFRESH_MARGIN is re-exchanged first and stored with setTokens", () =>
    Effect.gen(function* () {
      const t = yield* setup({}, { expiresInMinutes: 30 })
      const before = yield* t.row()
      yield* t.run(t.pull.drainUser(userId(1)))
      const after = yield* t.row()
      expect((yield* t.calls)[0]).toBe("exchange")
      expect(after.accessToken).not.toBe(before.accessToken)
      expect(after.refreshToken).toBe(before.refreshToken)
      expect(after.expiresAt).toEqual(DateTime.makeUnsafe(NOW + 23 * 3_600_000))
      expect(after.updatedAt).toEqual(DateTime.makeUnsafe(NOW))
    }),
  )

  it.effect("never makes more than 10 Garmin calls per user, even with a re-exchange", () =>
    Effect.gen(function* () {
      const plain = yield* setup({ endless: true })
      yield* plain.run(plain.pull.drainUser(userId(1)))
      // 2 activity pages (the cap) + 7 days.
      expect(yield* plain.calls).toHaveLength(9)

      const worst = yield* setup({ endless: true }, { expiresInMinutes: 30 })
      yield* worst.run(worst.pull.drainUser(userId(1)))
      expect((yield* worst.calls).length).toBeLessThanOrEqual(GARMIN_CALL_BUDGET)
      expect(GARMIN_CALL_BUDGET).toBe(10)
    }),
  )

  it.effect("a back-fill cut by the page cap keeps activitiesSince for the next run", () =>
    Effect.gen(function* () {
      const t = yield* setup({ endless: true }, { scope: storedCursor })
      yield* t.run(t.pull.drainUser(userId(1)))
      expect(
        Option.map(readCursor((yield* t.row()).scope), (c) =>
          DateTime.formatIso(c.activitiesSince),
        ),
      ).toEqual(Option.some("2026-10-20T00:00:00.000Z"))
    }),
  )

  it.effect("two drains of max 4 over 5 users pull every user (never-pulled first)", () =>
    Effect.gen(function* () {
      const t = yield* setup({ fail: { daily: "rate_limited" } }, { users: 5 })
      yield* t.run(t.pull.drain({ max: 4 }))
      yield* TestClock.adjust("5 minutes")
      yield* t.run(t.pull.drain({ max: 4 }))
      const pulledAt = yield* Effect.forEach(Arr.range(1, 5), (n) =>
        Effect.map(t.row(n), (r) =>
          Option.map(
            Option.flatMap(readCursor(r.scope), (c) => Option.fromNullishOr(c.lastAttemptAt)),
            DateTime.formatIso,
          ),
        ),
      )
      // Failed attempts count too: user 5 heads the second run, then the oldest pulls.
      expect(pulledAt).toEqual([
        Option.some("2026-10-27T10:05:00.000Z"),
        Option.some("2026-10-27T10:05:00.000Z"),
        Option.some("2026-10-27T10:05:00.000Z"),
        Option.some("2026-10-27T10:00:00.000Z"),
        Option.some("2026-10-27T10:05:00.000Z"),
      ])
    }),
  )

  it.effect("a unique-index race on the import key is skipped without a lastError", () =>
    Effect.gen(function* () {
      const t = yield* setup({}, { race: true, scope: storedCursor })
      yield* t.run(t.pull.drainUser(userId(1)))
      const row = yield* t.row()
      expect(row.status).toBe("active")
      expect(readCursor(row.scope)).toEqual(
        Option.map(readCursor(storedCursor), (c) => ({
          ...c,
          lastAttemptAt: DateTime.makeUnsafe(NOW),
        })),
      )
      expect((yield* t.logs).join("\n")).not.toContain("pull failed")
    }),
  )

  it.effect("drain pulls at most `max` users, oldest updatedAt first", () =>
    Effect.gen(function* () {
      const t = yield* setup({}, { users: 5 })
      expect(yield* t.run(t.pull.drain({ max: 4 }))).toBe(4)
      const pulled = yield* Effect.forEach(Arr.range(1, 5), (n) =>
        Effect.map(t.row(n), (r) => Option.isSome(readCursor(r.scope))),
      )
      expect(pulled).toEqual([true, true, true, true, false])
    }),
  )
})

describe("GarminPull log hygiene", () => {
  it.effect("no log line carries Bearer, ApiKey, the key or a JWT, on success or failure", () =>
    Effect.gen(function* () {
      const scripts: ReadonlyArray<Script> = [
        {},
        { fail: { activities: "token_rejected" } },
        { fail: { daily: "rate_limited" } },
        { fail: { activities: "transport" } },
      ]
      const lines = yield* Effect.forEach(scripts, (script) =>
        Effect.gen(function* () {
          const t = yield* setup(script, { expiresInMinutes: 30 })
          yield* t.run(t.pull.drainUser(userId(1)))
          return yield* t.logs
        }),
      )
      const all = Arr.flatten(lines).join("\n")
      expect(all).toContain("[garmin]")
      const leaked = ["Bearer", "ApiKey", KEY, JWT, FRESH_JWT, "jwt-payload"].filter((secret) =>
        all.includes(secret),
      )
      expect(leaked).toEqual([])
    }),
  )
})

describe("GarminPull back-fill at page size 50", () => {
  const firstDay = Date.UTC(2026, 8, 27)
  /** 120 activities from today − 30 d: 6 a day for the first 10 days (2 pages), then 3 a day. */
  const catalog = Arr.flatMap(Arr.range(0, 29), (i) => {
    const day = DateTime.formatIsoDateUtc(DateTime.makeUnsafe(firstDay + i * 86_400_000))
    return Arr.map(Arr.range(0, i < 10 ? 5 : 2), (n) => activityOn(day, n))
  })

  it.effect("imports 120 activities over 3 runs, the cursor advancing one window per run", () =>
    Effect.gen(function* () {
      expect(catalog).toHaveLength(120)
      expect([GARMIN_PAGE_SIZE, GARMIN_MAX_USERS_PER_RUN]).toEqual([50, 1])
      const t = yield* setup({ catalog })
      const runs = yield* Effect.forEach(Arr.range(1, 3), () =>
        Effect.gen(function* () {
          const callsBefore = (yield* t.calls).length
          const writesBefore = (yield* t.writes).length
          yield* t.run(t.pull.drain({ max: GARMIN_MAX_USERS_PER_RUN }))
          yield* TestClock.adjust("5 minutes")
          const calls = (yield* t.calls).slice(callsBefore)
          return {
            imported: (yield* t.imports.counts(userId(1), "garmin")).activities,
            since: Option.map(readCursor((yield* t.row()).scope), (c) =>
              DateTime.formatIsoDateUtc(c.activitiesSince),
            ),
            activityCalls: calls.filter((c) => c.startsWith("activities")),
            garminCalls: calls.length,
            importWrites: (yield* t.writes).slice(writesBefore),
          }
        }),
      )
      expect(runs).toEqual([
        {
          imported: 60,
          since: Option.some("2026-10-07"),
          activityCalls: [
            "activities 2026-09-27..2026-10-06 @0",
            "activities 2026-09-27..2026-10-06 @50",
          ],
          garminCalls: 9,
          importWrites: ["activities 60", "days 7"],
        },
        {
          imported: 90,
          since: Option.some("2026-10-17"),
          activityCalls: ["activities 2026-10-07..2026-10-16 @0"],
          garminCalls: 2,
          importWrites: ["activities 30", "days 1"],
        },
        {
          imported: 120,
          // The last window ended yesterday: from here on every run re-reads yesterday..today.
          since: Option.some("2026-10-26"),
          activityCalls: ["activities 2026-10-17..2026-10-26 @0"],
          garminCalls: 2,
          importWrites: ["activities 30", "days 1"],
        },
      ])
      expect(Math.max(...runs.map((r) => r.garminCalls))).toBeLessThanOrEqual(GARMIN_CALL_BUDGET)
    }),
  )
})
