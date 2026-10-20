import { describe, expect, it } from "@effect/vitest"
import { IdGenerator, ROW_TABLE, SyncChange, type SyncTable, UserId } from "@tanren/shared"
import { Array as Arr, type Context, DateTime, Effect, Layer, Option, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { seedIfEmpty } from "../store/seed"
import { CurrentUser } from "./CurrentUser"
import { LocalStore } from "./LocalStore"
import { MockSyncServer } from "./MockSyncServer"
import type { SqlDriver, StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"
import { PULL_PAGE_LIMIT, SyncEngine } from "./SyncEngine"
import { SyncTransport } from "./SyncTransport"
import { TodayRepo } from "./TodayRepo"

const OTHER_USER = UserId.make("00000000-0000-4000-8000-0000000000bb")
const EXERCISE_ID = "00000000-0000-4000-8000-0000000000e1"
const SESSION_ID = "00000000-0000-4000-8000-0000000000a1"
const SET_ID = "00000000-0000-4000-8000-0000000000c1"
const at = (minute: number) => `2026-10-20T08:${String(minute).padStart(2, "0")}:00.000Z`
const decode = Schema.decodeUnknownSync(SyncChange)

const exercise = (id: string, name: string, updatedAt: string): SyncChange =>
  decode({
    table: "exercise",
    row: {
      id,
      userId: LOCAL_USER_ID,
      name,
      aliases: [],
      muscleGroups: [],
      notes: null,
      createdAt: at(0),
      updatedAt,
      deletedAt: null,
    },
  })

const session = (updatedAt: string): SyncChange =>
  decode({
    table: "session",
    row: {
      id: SESSION_ID,
      userId: LOCAL_USER_ID,
      startedAt: at(0),
      finishedAt: null,
      plannedSessionId: null,
      notes: null,
      createdAt: at(0),
      updatedAt,
      deletedAt: null,
    },
  })

const workoutSet = (weightKg: number, updatedAt: string, userId: UserId = LOCAL_USER_ID) =>
  decode({
    table: "set",
    row: {
      id: SET_ID,
      userId,
      sessionId: SESSION_ID,
      exerciseId: EXERCISE_ID,
      order: 0,
      weightKg,
      reps: 5,
      rpe: null,
      note: null,
      plannedSetId: null,
      loggedAt: at(1),
      createdAt: at(1),
      updatedAt,
      deletedAt: null,
    },
  })

type Call =
  | { readonly kind: "push"; readonly tables: ReadonlyArray<SyncTable> }
  | { readonly kind: "pull"; readonly since: string }

/**
 * Wraps the mock transport and records every request the engine sends. `afterSend` runs once,
 * after the server answered a push and before the engine applies the answer.
 */
const recording = (
  userId: UserId,
  log: Ref.Ref<ReadonlyArray<Call>>,
  afterSend: Ref.Ref<Effect.Effect<void, StoreError>>,
) =>
  Layer.effect(
    SyncTransport,
    Effect.gen(function* () {
      const inner = yield* SyncTransport
      const record = (call: Call) => Ref.update(log, (calls) => [...calls, call])
      return SyncTransport.of({
        sendChanges: (request) =>
          record({ kind: "push", tables: request.changes.map((change) => change.table) }).pipe(
            Effect.andThen(inner.sendChanges(request)),
            Effect.tap(() =>
              Ref.getAndSet(afterSend, Effect.void).pipe(Effect.flatten, Effect.orDie),
            ),
          ),
        fetchChanges: (request) =>
          record({ kind: "pull", since: Option.getOrElse(request.since, () => "none") }).pipe(
            Effect.andThen(inner.fetchChanges(request)),
          ),
      })
    }),
  ).pipe(Layer.provide(MockSyncServer.transport(userId)))

type Device = SyncEngine | LocalStore | SqlDriver | StoreEvents | SyncTransport

/** One phone: its own in-memory database, signed in as `userId`, sharing the mock server. */
const openDevice = (userId: UserId = LOCAL_USER_ID) =>
  Effect.gen(function* () {
    const log = yield* Ref.make<ReadonlyArray<Call>>([])
    const afterSend = yield* Ref.make<Effect.Effect<void, StoreError>>(Effect.void)
    const context = yield* Layer.build(
      SyncEngine.layerNoDeps.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            LocalStore.layerNoDeps.pipe(
              Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
            ),
            recording(userId, log, afterSend),
          ),
        ),
      ),
    )
    const run = <A, E>(effect: Effect.Effect<A, E, Device>): Effect.Effect<A, E> =>
      Effect.provide(effect, context satisfies Context.Context<Device>)
    return {
      run,
      calls: Ref.get(log),
      onNextPushAnswer: (effect: Effect.Effect<void, StoreError>) => Ref.set(afterSend, effect),
    }
  })

const syncOnce = SyncEngine.use((engine) => engine.syncOnce)
const write = (changes: ReadonlyArray<SyncChange>, dirty: boolean) =>
  LocalStore.use((store) => store.write(changes, { dirty }))
const query = (sql: string) => LocalStore.use((store) => store.all({ sql, params: [] }))
const setRow = query(`SELECT "weightKg", "updatedAt", "_dirty", "_rejected" FROM "workout_set"`)
const dirtyCount = query(
  `SELECT (SELECT COUNT(*) FROM "exercise" WHERE "_dirty" = 1) + (SELECT COUNT(*) FROM "workout_session" WHERE "_dirty" = 1) + (SELECT COUNT(*) FROM "workout_set" WHERE "_dirty" = 1) AS "n"`,
).pipe(Effect.map((rows) => rows[0]?.n))
const serverPush = (changes: ReadonlyArray<SyncChange>) =>
  MockSyncServer.use((server) => server.sendChanges(LOCAL_USER_ID, { changes }))

const withServer = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(MockSyncServer.layer))

const SIGNED_IN = UserId.make("00000000-0000-4000-8000-0000000000aa")
const TABLES = Object.values(ROW_TABLE)

type Phone = Device | TodayRepo | CurrentUser | IdGenerator | DateTime.CurrentTimeZone

/**
 * A signed-out phone with Today (seed + logSet) on top of the sync stack; its transport talks to
 * the mock server as `SIGNED_IN`, the user the re-key moves the rows to.
 */
const openSignedOutPhone = Effect.gen(function* () {
  const context = yield* Layer.build(
    Layer.mergeAll(TodayRepo.layerNoDeps, SyncEngine.layerNoDeps).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          LocalStore.layerNoDeps.pipe(
            Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
          ),
          MockSyncServer.transport(SIGNED_IN),
          CurrentUser.layerTest(Option.none()),
          IdGenerator.layerTest,
          DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
        ),
      ),
    ),
  )
  return {
    run: <A, E>(effect: Effect.Effect<A, E, Phone>): Effect.Effect<A, E> =>
      Effect.provide(effect, context satisfies Context.Context<Phone>),
  }
})

const rekey = (userId: UserId) => SyncEngine.use((engine) => engine.rekeyLocalUser(userId))
const countWhere = (where: string) =>
  query(
    `SELECT ${TABLES.map((table) => `(SELECT COUNT(*) FROM "${table}" WHERE ${where})`).join(" + ")} AS "n"`,
  ).pipe(Effect.map((rows) => rows[0]?.n))
const perTable = (select: string) =>
  query(
    `SELECT ${TABLES.map((table) => `(SELECT ${select} FROM "${table}") AS "${table}"`).join(", ")}`,
  ).pipe(Effect.map((rows) => rows[0]))
const syncState = query(`SELECT "key", "value" FROM "sync_state" ORDER BY "key"`)
const snapshot = Effect.all([
  syncState,
  ...TABLES.map((table) => query(`SELECT * FROM "${table}" ORDER BY "id"`)),
])

describe("SyncEngine.syncOnce", () => {
  it.effect("pushes a logged set parents first and ends clean", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openDevice()
        yield* phone.run(
          write(
            [workoutSet(100, at(2)), session(at(1)), exercise(EXERCISE_ID, "Squat", at(0))],
            true,
          ),
        )
        const summary = yield* phone.run(syncOnce)
        expect(summary.pushed).toBe(3)
        expect(Arr.filter(yield* phone.calls, (call) => call.kind === "push")).toEqual([
          { kind: "push", tables: ["exercise", "session", "set"] },
        ])
        expect(yield* phone.run(dirtyCount)).toBe(0)
        expect((yield* MockSyncServer.use((server) => server.rows)).length).toBe(3)
      }),
    ),
  )

  it.effect("applies the server row on a conflict and clears dirty", () =>
    withServer(
      Effect.gen(function* () {
        yield* serverPush([workoutSet(110, at(5))])
        const phone = yield* openDevice()
        yield* phone.run(write([workoutSet(100, at(3))], true))
        yield* phone.run(syncOnce)
        expect(yield* phone.run(setRow)).toEqual([
          { weightKg: 110, updatedAt: at(5), _dirty: 0, _rejected: null },
        ])
      }),
    ),
  )

  it.effect("flags a rejected row and does not re-send it until edited", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openDevice()
        yield* phone.run(write([workoutSet(100, at(2), OTHER_USER)], true))
        const first = yield* phone.run(syncOnce)
        yield* phone.run(syncOnce)
        expect(first.rejected).toBe(1)
        expect(yield* phone.run(setRow)).toEqual([
          { weightKg: 100, updatedAt: at(2), _dirty: 1, _rejected: "forbidden" },
        ])
        const pushes = Arr.filter(yield* phone.calls, (call) => call.kind === "push")
        expect(pushes.length).toBe(1)
        yield* phone.run(write([workoutSet(105, at(4), OTHER_USER)], true))
        yield* phone.run(syncOnce)
        const after = Arr.filter(yield* phone.calls, (call) => call.kind === "push")
        expect(after.length).toBe(2)
      }),
    ),
  )

  it.effect("keeps a row edited while its push was in flight dirty and pushes the edit", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openDevice()
        yield* phone.run(write([workoutSet(100, at(2))], true))
        yield* phone.onNextPushAnswer(phone.run(write([workoutSet(105, at(4))], true)))
        yield* phone.run(syncOnce)
        // Without the guard, the first answer would mark the edited row clean at at(2), unsent.
        expect(Arr.filter(yield* phone.calls, (call) => call.kind === "push")).toEqual([
          { kind: "push", tables: ["set"] },
          { kind: "push", tables: ["set"] },
        ])
        expect(yield* phone.run(setRow)).toEqual([
          { weightKg: 105, updatedAt: at(4), _dirty: 0, _rejected: null },
        ])
        const server = yield* MockSyncServer.use((mock) => mock.rows)
        expect(server.map((change) => (change.table === "set" ? change.row.weightKg : 0))).toEqual([
          105,
        ])
      }),
    ),
  )

  it.effect("pulls pages until hasMore is false and stores the cursor", () =>
    withServer(
      Effect.gen(function* () {
        const total = PULL_PAGE_LIMIT * 2 + 50
        yield* serverPush(
          Arr.makeBy(total, (index) =>
            exercise(
              `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              `Exercise ${index + 1}`,
              at(1),
            ),
          ),
        )
        const phone = yield* openDevice()
        const summary = yield* phone.run(syncOnce)
        yield* phone.run(syncOnce)
        expect(summary.pulled).toBe(total)
        expect(yield* phone.run(query(`SELECT COUNT(*) AS "n" FROM "exercise"`))).toEqual([
          { n: total },
        ])
        expect(yield* phone.run(query(`SELECT "value" FROM "sync_state"`))).toEqual([
          { value: String(total) },
        ])
        expect(Arr.filter(yield* phone.calls, (call) => call.kind === "pull")).toEqual([
          { kind: "pull", since: "none" },
          { kind: "pull", since: "200" },
          { kind: "pull", since: "400" },
          { kind: "pull", since: String(total) },
        ])
      }),
    ),
  )

  it.effect("ignores an incoming row older than the local one", () =>
    withServer(
      Effect.gen(function* () {
        yield* serverPush([workoutSet(100, at(3))])
        const phone = yield* openDevice()
        yield* phone.run(write([workoutSet(120, at(5))], false))
        yield* phone.run(syncOnce)
        expect(yield* phone.run(setRow)).toEqual([
          { weightKg: 120, updatedAt: at(5), _dirty: 0, _rejected: null },
        ])
      }),
    ),
  )

  it.effect("converges two devices through the server", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openDevice()
        const laptop = yield* openDevice()
        yield* phone.run(
          write(
            [exercise(EXERCISE_ID, "Squat", at(0)), session(at(1)), workoutSet(100, at(2))],
            true,
          ),
        )
        yield* phone.run(syncOnce)
        yield* laptop.run(syncOnce)
        expect(yield* laptop.run(setRow)).toEqual(yield* phone.run(setRow))
        yield* laptop.run(write([workoutSet(102.5, at(9))], true))
        yield* laptop.run(syncOnce)
        yield* phone.run(syncOnce)
        expect(yield* phone.run(setRow)).toEqual([
          { weightKg: 102.5, updatedAt: at(9), _dirty: 0, _rejected: null },
        ])
        expect(yield* phone.run(setRow)).toEqual(yield* laptop.run(setRow))
      }),
    ),
  )

  it.effect(
    "re-keys LOCAL_USER_ID: keeps referenced demo parents, drops the rest, idempotent",
    () =>
      withServer(
        Effect.gen(function* () {
          yield* TestClock.setTime(Date.UTC(2026, 9, 20, 8))
          const phone = yield* openSignedOutPhone
          // Signed out: the demo seed runs, and one set is logged against a demo planned set.
          const today = yield* phone.run(
            seedIfEmpty.pipe(Effect.andThen(TodayRepo.use((repo) => repo.today))),
          )
          const first = Option.flatMap(today, (found) => Arr.head(found.exercises))
          const exerciseId = Option.map(first, ({ exercise }) => exercise.id)
          const plannedSetId = Option.flatMap(first, ({ plannedSets }) =>
            Option.map(Arr.head(plannedSets), (set) => set.id),
          )
          expect(Option.isSome(exerciseId) && Option.isSome(plannedSetId)).toBe(true)
          yield* phone.run(
            TodayRepo.use((repo) =>
              Option.match(exerciseId, {
                onNone: () => Effect.die("expected a demo exercise"),
                onSome: (id) =>
                  repo.logSet({
                    exerciseId: id,
                    plannedSetId,
                    weightKg: 100,
                    reps: 5,
                    rpe: Option.none(),
                  }),
              }),
            ),
          )

          expect(yield* phone.run(rekey(SIGNED_IN))).toBe(true)

          expect(yield* phone.run(countWhere(`"userId" = '${LOCAL_USER_ID}'`))).toBe(0)
          expect(yield* phone.run(perTable(`COUNT(*)`))).toEqual({
            profile: 0,
            exercise: 1,
            plan: 1,
            plan_week: 1,
            planned_session: 1,
            planned_set: 1,
            workout_session: 1,
            workout_set: 1,
          })
          expect(
            yield* phone.run(
              countWhere(`"userId" <> '${SIGNED_IN}' OR "_dirty" <> 1 OR "_rejected" IS NOT NULL`),
            ),
          ).toBe(0)
          // No pullCursor: the first pull fetches the user's whole history.
          expect(yield* phone.run(syncState)).toEqual([{ key: "ownerUserId", value: SIGNED_IN }])
          const exerciseRows = yield* phone.run(query(`SELECT "id" FROM "exercise"`))
          expect(exerciseRows).toEqual([{ id: Option.getOrNull(exerciseId) }])

          // A second run changes nothing: same rows, no StoreEvents bump.
          const before = yield* phone.run(snapshot)
          const version = yield* phone.run(StoreEvents.use((events) => events.version))
          expect(yield* phone.run(rekey(SIGNED_IN))).toBe(false)
          expect(yield* phone.run(snapshot)).toEqual(before)
          expect(yield* phone.run(StoreEvents.use((events) => events.version))).toBe(version)

          const summary = yield* phone.run(syncOnce)
          expect(summary.rejected).toBe(0)
          expect(summary.pushed).toBe(7)
          expect(yield* phone.run(countWhere(`"_dirty" = 1`))).toBe(0)

          // Still a no-op after a sync: the pull cursor survives.
          const synced = yield* phone.run(snapshot)
          expect(yield* phone.run(rekey(SIGNED_IN))).toBe(false)
          expect(yield* phone.run(snapshot)).toEqual(synced)
        }),
      ),
  )

  it.effect("leaves dirty rows intact when the server is unreachable", () =>
    withServer(
      Effect.gen(function* () {
        yield* MockSyncServer.use((server) => server.setReachable(false))
        const phone = yield* openDevice()
        yield* phone.run(write([session(at(1)), workoutSet(100, at(2))], true))
        const error = yield* Effect.flip(phone.run(syncOnce))
        expect(error).toMatchObject({ _tag: "TransportError", reason: "unreachable" })
        expect(yield* phone.run(dirtyCount)).toBe(2)
        yield* MockSyncServer.use((server) => server.setReachable(true))
        yield* phone.run(syncOnce)
        expect(yield* phone.run(dirtyCount)).toBe(0)
      }),
    ),
  )
})
