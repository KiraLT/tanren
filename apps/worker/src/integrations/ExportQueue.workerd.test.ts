import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import {
  ActivityExportRepo,
  SealedToken as DbSealedToken,
  IntegrationRepo,
  SyncStore,
} from "@tanren/db"
import {
  ExerciseId,
  type ExportFailureReason,
  IdGenerator,
  OrderIndex,
  Reps,
  Session,
  SessionId,
  SetId,
  type SyncChange,
  UserId,
  Uuid,
  WeightKg,
  WorkoutSet,
} from "@tanren/shared"
import {
  Array as Arr,
  DateTime,
  Deferred,
  type Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Redacted,
  Ref,
} from "effect"
import { TestClock } from "effect/testing"
import { FAKE_INTEGRATION_TOKEN_KEY } from "../Config"
import { D1Layer, ExerciseRepo, Repositories, SessionRepo } from "../repos"
import { at, exercise, session } from "../sync/fixtures"
import { Sync } from "../sync/Sync"
import { countingD1 } from "../testing/countingD1"
import { ExportQueue } from "./ExportQueue"
import { StravaApi, StravaRequestFailed } from "./StravaApi"
import { TokenSeal } from "./TokenSeal"

// The export queue on a real migrated D1 (one per file: every test uses its own users and ids).
const counting = countingD1(env.DB)
const Db = Repositories.layer.pipe(Layer.provide(D1Layer(counting.db)), Layer.orDie)
const Seal = TokenSeal.layerWithKey(Redacted.make(FAKE_INTEGRATION_TOKEN_KEY))
const queueWith = (strava: Layer.Layer<StravaApi>) =>
  ExportQueue.layer.pipe(Layer.provideMerge(Layer.mergeAll(Db, Seal, strava, IdGenerator.layer)))

const hex = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`
const user = (n: number) => UserId.make(hex(0xa000 + n))
const NOW = at("2026-10-26T12:00:00.000Z")
const setClock = (time: DateTime.Utc) => TestClock.setTime(DateTime.toEpochMillis(time))

/** How the scripted refresh answers its n-th call (0-based): after `delay`, succeed or fail. */
interface RefreshStep {
  readonly delay: Duration.Input
  readonly fail: Option.Option<ExportFailureReason>
}
const REFRESH_OK: RefreshStep = { delay: 0, fail: Option.none() }

/**
 * A scripted Strava: `create` decides each `createActivity` by the access token it receives and its
 * 0-based call number. `inCreate` completes on the first create, `inRefresh[n]` on the n-th refresh
 * (a test waits on them before moving the TestClock).
 */
const scriptedStrava = (
  create: (token: string, call: number) => Option.Option<ExportFailureReason>,
  options: {
    readonly createDelay?: Duration.Input
    readonly refresh?: (call: number) => RefreshStep
  } = {},
) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<string>>([])
    const createCount = yield* Ref.make(0)
    const refreshCount = yield* Ref.make(0)
    const inCreate = yield* Deferred.make<void>()
    const inRefresh = [yield* Deferred.make<void>(), yield* Deferred.make<void>()] as const
    const record = (line: string) => Ref.update(calls, (all) => [...all, line])
    const next = (counter: Ref.Ref<number>) => Ref.modify(counter, (n) => [n, n + 1] as const)
    const layer = Layer.succeed(
      StravaApi,
      StravaApi.of({
        exchangeCode: () => Effect.die("exchangeCode is not part of the export"),
        refresh: (refreshToken) =>
          Effect.gen(function* () {
            const n = yield* next(refreshCount)
            const step = (options.refresh ?? (() => REFRESH_OK))(n)
            const entered = Arr.get(inRefresh, n)
            if (Option.isSome(entered)) {
              yield* Deferred.succeed(entered.value, undefined)
            }
            yield* Effect.sleep(step.delay)
            yield* record(`refresh ${Redacted.value(refreshToken)}`)
            if (Option.isSome(step.fail)) {
              return yield* new StravaRequestFailed({
                reason: step.fail.value,
                status: Option.none(),
              })
            }
            return {
              accessToken: Redacted.make("access-2"),
              refreshToken: Redacted.make("refresh-2"),
              expiresAt: DateTime.add(NOW, { days: 30 }),
            }
          }),
        createActivity: (token, activity) =>
          Effect.gen(function* () {
            const n = yield* next(createCount)
            yield* Deferred.succeed(inCreate, undefined)
            yield* Effect.sleep(options.createDelay ?? 0)
            yield* record(`create ${Redacted.value(token)} ${activity.sessionId}`)
            return n
          }).pipe(
            Effect.flatMap((n) =>
              Option.match(create(Redacted.value(token), n), {
                onNone: () => Effect.succeed({ id: `strava-${activity.sessionId.slice(-4)}` }),
                onSome: (reason) =>
                  Effect.fail(new StravaRequestFailed({ reason, status: Option.none() })),
              }),
            ),
          ),
        revoke: () => Effect.void,
      }),
    )
    return { calls, layer, inCreate, inRefresh }
  })

const failing = (reason: ExportFailureReason) => scriptedStrava(() => Option.some(reason))

interface Seeded {
  readonly userId: UserId
  readonly session: Session
  readonly change: SyncChange
}

/** One finished session (3 × 5 @ 100 kg) of user `n`, plus an integration unless `none`. */
const seed = (
  n: number,
  integration: "active" | "revoked" | "none" = "active",
  expiresIn: Partial<DateTime.DateTime.PartsForMath> = { hours: 6 },
) =>
  Effect.gen(function* () {
    const userId = user(n)
    const now = yield* DateTime.now
    const squat = exercise(0xb000 + n, { userId, name: "Squat" })
    yield* (yield* ExerciseRepo).put(userId, [squat])
    const row = Session.make({
      ...session(0xc000 + n, DateTime.subtract(now, { minutes: 48 })),
      userId,
      // Completed now: the fixture's fixed `updatedAt` (T0) would make a January finish look
      // older than EXPORT_BACKFILL_HOURS and skip the export.
      updatedAt: now,
      finishedAt: Option.some(now),
    })
    const sessions = yield* SessionRepo
    yield* sessions.putSessions(userId, [row])
    yield* sessions.putSets(
      userId,
      Arr.map([0, 1, 2], (order) =>
        WorkoutSet.make({
          id: SetId.make(hex(0xd000 + n * 8 + order)),
          userId,
          createdAt: now,
          updatedAt: now,
          deletedAt: Option.none(),
          sessionId: row.id,
          exerciseId: ExerciseId.make(squat.id),
          order: OrderIndex.make(order),
          weightKg: WeightKg.make(100),
          reps: Reps.make(5),
          rpe: Option.none(),
          note: Option.none(),
          plannedSetId: Option.none(),
          loggedAt: now,
        }),
      ),
    )
    if (integration !== "none") {
      const seal = yield* TokenSeal
      yield* (yield* IntegrationRepo).upsert({
        id: Uuid.make(hex(0xe000 + n)),
        userId,
        provider: "strava",
        status: integration,
        externalId: `athlete-${n}`,
        displayName: "Athlete",
        accessToken: DbSealedToken.make(yield* seal.seal(Redacted.make("access-1"))),
        refreshToken: DbSealedToken.make(yield* seal.seal(Redacted.make("refresh-1"))),
        expiresAt: DateTime.add(now, expiresIn),
        scope: "activity:write",
        createdAt: now,
        updatedAt: now,
      })
    }
    return { userId, session: row, change: { table: "session", row } } satisfies Seeded
  })

const enqueue = ({ userId, session: row, change }: Seeded) =>
  Effect.flatMap(ExportQueue, (queue) =>
    queue.enqueueCompleted(
      userId,
      [change],
      [{ table: "session", id: row.id, updatedAt: row.updatedAt }],
    ),
  )
const drain = (userId: UserId, max = 1) =>
  Effect.flatMap(ExportQueue, (queue) => queue.drain({ userId: Option.some(userId), max }))
const rowsOf = (userId: UserId) =>
  Effect.flatMap(ActivityExportRepo, (repo) => repo.list(userId, "strava", 10))
const onlyRow = (userId: UserId) =>
  Effect.map(rowsOf(userId), (rows) => {
    expect(rows).toHaveLength(1)
    return Option.getOrThrow(Arr.head(rows))
  })
const statementsOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const before = counting.statements()
    const value = yield* effect
    return { value, statements: counting.statements() - before }
  })

describe("ExportQueue.enqueueCompleted", () => {
  it.effect("writes nothing for a user without an integration (only the integration read)", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(1, "none")
      const { statements } = yield* statementsOf(enqueue(seeded))
      expect(statements).toBe(1)
      expect(yield* rowsOf(seeded.userId)).toEqual([])
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsole))),
  )

  it.effect("writes nothing for a revoked integration", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(2, "revoked")
      const { statements } = yield* statementsOf(enqueue(seeded))
      expect(statements).toBe(1)
      expect(yield* rowsOf(seeded.userId)).toEqual([])
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsole))),
  )

  it.effect("runs no statement when the changes complete no session", () =>
    Effect.gen(function* () {
      const queue = yield* ExportQueue
      const open = { table: "session" as const, row: session(0xc0ff, NOW) }
      const { statements } = yield* statementsOf(
        queue.enqueueCompleted(
          user(3),
          [open],
          [{ table: "session", id: open.row.id, updatedAt: NOW }],
        ),
      )
      expect(statements).toBe(0)
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsole))),
  )

  it.effect("queues one pending row, due now, for a completed session", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(4)
      yield* enqueue(seeded)
      yield* enqueue(seeded) // INSERT OR IGNORE: a re-push queues nothing new
      const row = yield* onlyRow(seeded.userId)
      expect(row).toMatchObject({ status: "pending", attempts: 0, sessionId: seeded.session.id })
      expect(row.nextAttemptAt).toEqual(NOW)
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsole))),
  )
})

describe("ExportQueue.drain", () => {
  it.effect("sends a due row through the console provider within 8 statements", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(10)
      yield* enqueue(seeded)
      const { value, statements } = yield* statementsOf(drain(seeded.userId))
      console.log("ExportQueue.drain one row D1 statements", statements)
      expect(value).toBe(1)
      expect(statements).toBeLessThanOrEqual(8)
      const row = yield* onlyRow(seeded.userId)
      expect(row.status).toBe("sent")
      expect(row.externalActivityId).toEqual(
        Option.some(`console-${seeded.session.id.slice(0, 8)}`),
      )
      expect(row.lastError).toEqual(Option.none())
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsole))),
  )

  it.effect("backs off a transport failure (+1 m first) and marks the fifth failure dead", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(11)
      yield* enqueue(seeded)
      yield* drain(seeded.userId)
      const first = yield* onlyRow(seeded.userId)
      expect(first).toMatchObject({ status: "pending", attempts: 1 })
      expect(first.lastError).toEqual(Option.some("transport"))
      expect(first.nextAttemptAt).toEqual(DateTime.add(NOW, { minutes: 1 }))
      const statuses = yield* Effect.forEach([2, 3, 4, 5], () =>
        Effect.gen(function* () {
          yield* setClock((yield* onlyRow(seeded.userId)).nextAttemptAt)
          yield* drain(seeded.userId)
          const row = yield* onlyRow(seeded.userId)
          return `${row.status}:${row.attempts}`
        }),
      )
      expect(statuses).toEqual(["pending:2", "pending:3", "pending:4", "dead:5"])
    }).pipe(
      Effect.provide(Layer.unwrap(Effect.map(failing("transport"), (s) => queueWith(s.layer)))),
    ),
  )

  it.effect("fails a rejected activity at once", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(12)
      yield* enqueue(seeded)
      yield* drain(seeded.userId)
      expect(yield* onlyRow(seeded.userId)).toMatchObject({
        status: "failed",
        lastError: Option.some("rejected"),
      })
    }).pipe(
      Effect.provide(Layer.unwrap(Effect.map(failing("rejected"), (s) => queueWith(s.layer)))),
    ),
  )

  it.effect("kills the row when its session was deleted (session_missing)", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(13)
      yield* enqueue(seeded)
      const deleted = Session.make({
        ...seeded.session,
        deletedAt: Option.some(NOW),
        updatedAt: DateTime.add(seeded.session.updatedAt, { seconds: 1 }),
      })
      yield* (yield* SessionRepo).putSessions(seeded.userId, [deleted])
      yield* drain(seeded.userId)
      expect(yield* onlyRow(seeded.userId)).toMatchObject({
        status: "dead",
        lastError: Option.some("session_missing"),
      })
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsole))),
  )

  it.effect("parks an inactive app as blocked +12 h, round after round, never dead", () =>
    Effect.gen(function* () {
      yield* setClock(NOW)
      const seeded = yield* seed(14)
      yield* enqueue(seeded)
      yield* drain(seeded.userId)
      const first = yield* onlyRow(seeded.userId)
      expect(first).toMatchObject({ status: "blocked", lastError: Option.some("app_inactive") })
      expect(first.nextAttemptAt).toEqual(DateTime.add(NOW, { hours: 12 }))
      const rounds = yield* Effect.forEach([2, 3, 4, 5, 6, 7], () =>
        Effect.gen(function* () {
          yield* setClock((yield* onlyRow(seeded.userId)).nextAttemptAt)
          expect(yield* drain(seeded.userId)).toBe(1)
          const row = yield* onlyRow(seeded.userId)
          return `${row.status}:${row.attempts}`
        }),
      )
      // `Blocked` resets attempts to 0 every round: the cap can never apply.
      expect(rounds).toEqual(Arr.map(Arr.range(2, 7), () => "blocked:0"))
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsoleWith(Option.some("inactive"))))),
  )

  it.effect("refreshes a token expiring within 1 h once, storing both rotated tokens", () =>
    Effect.gen(function* () {
      const strava = yield* scriptedStrava(() => Option.none())
      yield* Effect.gen(function* () {
        yield* setClock(NOW)
        const seeded = yield* seed(15, "active", { minutes: 30 })
        yield* enqueue(seeded)
        yield* drain(seeded.userId)
        expect(yield* Ref.get(strava.calls)).toEqual([
          "refresh refresh-1",
          `create access-2 ${seeded.session.id}`,
        ])
        const stored = Option.getOrThrow(
          yield* (yield* IntegrationRepo).get(seeded.userId, "strava"),
        )
        const seal = yield* TokenSeal
        expect(Redacted.value(yield* seal.open(stored.accessToken))).toBe("access-2")
        expect(Redacted.value(yield* seal.open(stored.refreshToken))).toBe("refresh-2")
        expect(stored.expiresAt).toEqual(DateTime.add(NOW, { days: 30 }))
        expect((yield* onlyRow(seeded.userId)).status).toBe("sent")
      }).pipe(Effect.provide(queueWith(strava.layer)))
    }),
  )

  it.effect(
    "retries an unauthorized create once with a rotated token, then revokes and fails",
    () =>
      Effect.gen(function* () {
        const strava = yield* failing("unauthorized")
        yield* Effect.gen(function* () {
          yield* setClock(NOW)
          const seeded = yield* seed(16)
          yield* enqueue(seeded)
          yield* drain(seeded.userId)
          expect(yield* Ref.get(strava.calls)).toEqual([
            `create access-1 ${seeded.session.id}`,
            "refresh refresh-1",
            `create access-2 ${seeded.session.id}`,
          ])
          const stored = Option.getOrThrow(
            yield* (yield* IntegrationRepo).get(seeded.userId, "strava"),
          )
          expect(stored.status).toBe("revoked")
          expect(yield* onlyRow(seeded.userId)).toMatchObject({
            status: "failed",
            lastError: Option.some("unauthorized"),
          })
        }).pipe(Effect.provide(queueWith(strava.layer)))
      }),
  )

  it.effect("sends after an unauthorized create when the retry with the rotated token works", () =>
    Effect.gen(function* () {
      const strava = yield* scriptedStrava((token) =>
        token === "access-1" ? Option.some("unauthorized") : Option.none(),
      )
      yield* Effect.gen(function* () {
        yield* setClock(NOW)
        const seeded = yield* seed(17)
        yield* enqueue(seeded)
        yield* drain(seeded.userId)
        expect((yield* onlyRow(seeded.userId)).status).toBe("sent")
        const stored = Option.getOrThrow(
          yield* (yield* IntegrationRepo).get(seeded.userId, "strava"),
        )
        expect(stored.status).toBe("active")
      }).pipe(Effect.provide(queueWith(strava.layer)))
    }),
  )

  it.effect("drains due rows of every user with userId None", () =>
    Effect.gen(function* () {
      // Earlier than every other test's clock, so no row of another test is due yet.
      const early = at("2026-01-05T08:00:00.000Z")
      yield* setClock(early)
      const a = yield* seed(20)
      const b = yield* seed(21)
      yield* enqueue(a)
      yield* enqueue(b)
      const queue = yield* ExportQueue
      expect(yield* queue.drain({ userId: Option.none(), max: 10 })).toBe(2)
      expect((yield* onlyRow(a.userId)).status).toBe("sent")
      expect((yield* onlyRow(b.userId)).status).toBe("sent")
    }).pipe(Effect.provide(queueWith(StravaApi.layerConsole))),
  )

  it.effect("two concurrent drains attempt each row once", () =>
    Effect.gen(function* () {
      const strava = yield* scriptedStrava(() => Option.none())
      yield* Effect.gen(function* () {
        yield* setClock(at("2026-01-06T08:00:00.000Z"))
        const a = yield* seed(22)
        const b = yield* seed(23)
        yield* enqueue(a)
        yield* enqueue(b)
        const queue = yield* ExportQueue
        const counts = yield* Effect.all(
          [
            queue.drain({ userId: Option.none(), max: 10 }),
            queue.drain({ userId: Option.none(), max: 10 }),
          ],
          { concurrency: "unbounded" },
        )
        expect(counts[0] + counts[1]).toBe(2)
        const creates = Arr.filter(yield* Ref.get(strava.calls), (c) => c.startsWith("create"))
        expect(Arr.sort(creates, (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0))).toEqual(
          Arr.sort(
            [`create access-1 ${a.session.id}`, `create access-1 ${b.session.id}`],
            (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0),
          ),
        )
      }).pipe(Effect.provide(queueWith(strava.layer)))
    }),
  )
})

const withSync = (strava: Layer.Layer<StravaApi>) =>
  Sync.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        queueWith(strava),
        SyncStore.layer.pipe(Layer.provide(D1Layer(counting.db)), Layer.orDie),
      ),
    ),
  )
/** The seeded session pushed again one second newer, so the store accepts it (LWW). */
const newer = ({ session: row }: Seeded): SyncChange => ({
  table: "session",
  row: Session.make({ ...row, updatedAt: DateTime.add(row.updatedAt, { seconds: 1 }) }),
})
/** A second finished session (no sets) of the seeded user. */
const secondSession = (seeded: Seeded) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now
    const row = Session.make({
      ...seeded.session,
      id: SessionId.make(hex(0xc800 + Number.parseInt(seeded.session.id.slice(-4), 16))),
      finishedAt: Option.some(now),
    })
    yield* (yield* SessionRepo).putSessions(seeded.userId, [row])
    return { ...seeded, session: row, change: { table: "session", row } } satisfies Seeded
  })

describe("drain attempts survive the push budget and token races (REV-1)", () => {
  it.effect("a create slower than the push budget still ends sent, not running", () =>
    Effect.gen(function* () {
      const strava = yield* scriptedStrava(() => Option.none(), { createDelay: "8 seconds" })
      yield* Effect.gen(function* () {
        yield* setClock(NOW)
        const seeded = yield* seed(30)
        const { push } = yield* Sync
        const fiber = yield* Effect.forkChild(push(seeded.userId, { changes: [newer(seeded)] }))
        yield* Deferred.await(strava.inCreate)
        yield* TestClock.adjust("10 seconds")
        const result = yield* Fiber.join(fiber)
        expect(Arr.map(result.accepted, (a) => a.id)).toEqual([seeded.session.id])
        expect(yield* onlyRow(seeded.userId)).toMatchObject({ status: "sent", attempts: 1 })
      }).pipe(Effect.provide(withSync(strava.layer)))
    }),
  )

  it.effect("a refresh slower than the push budget still stores both rotated tokens", () =>
    Effect.gen(function* () {
      const strava = yield* scriptedStrava(() => Option.none(), {
        refresh: () => ({ delay: "8 seconds", fail: Option.none() }),
      })
      yield* Effect.gen(function* () {
        yield* setClock(NOW)
        const seeded = yield* seed(31, "active", { minutes: 30 })
        const { push } = yield* Sync
        const fiber = yield* Effect.forkChild(push(seeded.userId, { changes: [newer(seeded)] }))
        yield* Deferred.await(strava.inRefresh[0])
        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(fiber)
        const stored = Option.getOrThrow(
          yield* (yield* IntegrationRepo).get(seeded.userId, "strava"),
        )
        const seal = yield* TokenSeal
        expect(Redacted.value(yield* seal.open(stored.accessToken))).toBe("access-2")
        expect(Redacted.value(yield* seal.open(stored.refreshToken))).toBe("refresh-2")
        expect((yield* onlyRow(seeded.userId)).status).toBe("sent")
      }).pipe(Effect.provide(withSync(strava.layer)))
    }),
  )

  it.effect(
    "a refresh refused after another drain rotated the tokens uses them, never revokes",
    () =>
      Effect.gen(function* () {
        const strava = yield* scriptedStrava(() => Option.none(), {
          refresh: (n) =>
            n === 0
              ? { delay: "1 second", fail: Option.none() }
              : { delay: "2 seconds", fail: Option.some("rejected") },
        })
        yield* Effect.gen(function* () {
          yield* setClock(DateTime.subtract(NOW, { hours: 1 }))
          const first = yield* seed(32, "active", { minutes: 90 })
          const second = yield* secondSession(first)
          yield* enqueue(first)
          yield* enqueue(second)
          yield* setClock(NOW)
          const a = yield* Effect.forkChild(drain(first.userId))
          yield* Deferred.await(strava.inRefresh[0])
          const b = yield* Effect.forkChild(drain(first.userId))
          yield* Deferred.await(strava.inRefresh[1])
          yield* TestClock.adjust("1 second")
          expect(yield* Fiber.join(a)).toBe(1)
          yield* TestClock.adjust("5 seconds")
          expect(yield* Fiber.join(b)).toBe(1)
          const stored = Option.getOrThrow(
            yield* (yield* IntegrationRepo).get(first.userId, "strava"),
          )
          expect(stored.status).toBe("active")
          const rows = yield* rowsOf(first.userId)
          expect(Arr.map(rows, (row) => row.status)).toEqual(["sent", "sent"])
          const creates = Arr.filter(yield* Ref.get(strava.calls), (c) => c.startsWith("create"))
          expect(Arr.map(creates, (c) => c.split(" ")[1])).toEqual(["access-2", "access-2"])
        }).pipe(Effect.provide(queueWith(strava.layer)))
      }),
  )

  it.effect("after six blocked rounds two transport failures leave the row pending", () =>
    Effect.gen(function* () {
      const strava = yield* scriptedStrava((_, n) =>
        Option.some(n < 6 ? "app_inactive" : "transport"),
      )
      yield* Effect.gen(function* () {
        yield* setClock(NOW)
        const seeded = yield* seed(33)
        yield* enqueue(seeded)
        const rounds = yield* Effect.forEach(Arr.range(1, 8), () =>
          Effect.gen(function* () {
            yield* setClock((yield* onlyRow(seeded.userId)).nextAttemptAt)
            yield* drain(seeded.userId)
            const row = yield* onlyRow(seeded.userId)
            return `${row.status}:${row.attempts}`
          }),
        )
        expect(rounds).toEqual([
          ...Arr.map(Arr.range(1, 6), () => "blocked:0"),
          "pending:1",
          "pending:2",
        ])
      }).pipe(Effect.provide(queueWith(strava.layer)))
    }),
  )
})

describe("unreadable tokens of a newer row version (REV-3)", () => {
  it.effect("revokes the newer version whose tokens no longer open, not a stale one", () =>
    Effect.gen(function* () {
      const strava = yield* scriptedStrava(
        (_, n) => (n === 0 ? Option.some("unauthorized") : Option.none()),
        { createDelay: "1 second" },
      )
      yield* Effect.gen(function* () {
        yield* setClock(NOW)
        const seeded = yield* seed(34)
        yield* enqueue(seeded)
        const repo = yield* IntegrationRepo
        const before = Option.getOrThrow(yield* repo.get(seeded.userId, "strava"))
        const fiber = yield* Effect.forkChild(drain(seeded.userId))
        yield* Deferred.await(strava.inCreate)
        // Another writer stores a newer version whose tokens this key cannot open.
        yield* repo.setTokens(before.id, {
          access: DbSealedToken.make("v1.AAAAAAAAAAAAAAAA.AAAA"),
          refresh: DbSealedToken.make("v1.AAAAAAAAAAAAAAAA.AAAA"),
          expiresAt: DateTime.add(NOW, { hours: 6 }),
          updatedAt: DateTime.add(NOW, { seconds: 1 }),
        })
        yield* TestClock.adjust("1 second")
        yield* Fiber.join(fiber)
        expect(Option.getOrThrow(yield* repo.get(seeded.userId, "strava")).status).toBe("revoked")
        expect(yield* onlyRow(seeded.userId)).toMatchObject({
          status: "failed",
          lastError: Option.some("unauthorized"),
        })
      }).pipe(Effect.provide(queueWith(strava.layer)))
    }),
  )
})
