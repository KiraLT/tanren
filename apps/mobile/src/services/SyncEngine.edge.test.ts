import { describe, expect, it } from "@effect/vitest"
import { ExerciseId, PushResponse, type SyncChange, UserId } from "@tanren/shared"
import { DateTime, Deferred, Effect, Fiber, Layer, Option, Ref } from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import {
  at,
  EXERCISE_ID,
  exerciseChange,
  openPhone,
  SESSION_ID,
  SET_ID,
  sessionChange,
  setChange,
} from "../testing/phone"
import { LocalStore } from "./LocalStore"
import { MockSyncServer } from "./MockSyncServer"
import { SqlDriver } from "./SqlDriver"
import { SyncEngine } from "./SyncEngine"
import { SyncTransport } from "./SyncTransport"
import { TodayRepo } from "./TodayRepo"

const withServer = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(MockSyncServer.layer))
const sync = SyncEngine.use((engine) => engine.syncOnce)
const query = (sql: string) => LocalStore.use((store) => store.all({ sql, params: [] }))
const write = (changes: ReadonlyArray<SyncChange>, dirty: boolean) =>
  LocalStore.use((store) => store.write(changes, { dirty }))
const setRows = query(
  `SELECT "weightKg", "updatedAt", "_dirty", "_rejected", "deletedAt" FROM "workout_set"`,
)

/** Wraps the mock transport: `gate` blocks every push until released; `answer` rewrites replies. */
const scripted = (hooks: {
  readonly entered?: Deferred.Deferred<void>
  readonly gate?: Deferred.Deferred<void>
  readonly answer?: (response: PushResponse) => PushResponse
}) =>
  Layer.effect(
    SyncTransport,
    Effect.gen(function* () {
      const inner = yield* SyncTransport
      return SyncTransport.of({
        fetchChanges: inner.fetchChanges,
        sendChanges: (request) =>
          Effect.gen(function* () {
            if (hooks.entered) yield* Deferred.succeed(hooks.entered, undefined)
            if (hooks.gate) yield* Deferred.await(hooks.gate)
            const response = yield* inner.sendChanges(request)
            return hooks.answer ? hooks.answer(response) : response
          }),
      })
    }),
  ).pipe(Layer.provide(MockSyncServer.transport(LOCAL_USER_ID)))

describe("SyncEngine edges", () => {
  it.effect("logging a set during an in-flight sync is not lost; a second trigger is skipped", () =>
    withServer(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const phone = yield* openPhone({ transport: scripted({ entered, gate }) })
        yield* phone.run(write([sessionChange(at(1)), setChange(100, at(2))], true))
        const fiber = yield* Effect.forkChild(
          phone.run(SyncEngine.use((engine) => engine.syncOnceExclusive)),
        )
        yield* Deferred.await(entered)
        const skipped = yield* phone.run(SyncEngine.use((engine) => engine.syncOnceExclusive))
        expect(Option.isNone(skipped)).toBe(true)
        const logged = yield* phone.run(
          TodayRepo.use((repo) =>
            repo.logSet({
              exerciseId: ExerciseId.make(EXERCISE_ID),
              plannedSetId: Option.none(),
              weightKg: 50,
              reps: 5,
              rpe: Option.none(),
            }),
          ),
        )
        expect(logged.weightKg).toBe(50)
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(fiber)
        const dirty = yield* phone.run(
          query(`SELECT COUNT(*) AS "n" FROM "workout_set" WHERE "_dirty" = 1`),
        )
        expect(dirty).toEqual([{ n: 0 }])
        const server = yield* MockSyncServer.use((mock) => mock.rows)
        expect(server.filter((change) => change.table === "set").length).toBe(2)
      }),
    ),
  )

  it.effect(
    "accepts one row and rejects another in one reply: only the rejected one is flagged and never resent",
    () =>
      withServer(
        Effect.gen(function* () {
          const calls = yield* Ref.make(0)
          const phone = yield* openPhone({
            transport: scripted({
              answer: (response) => {
                Effect.runSync(Ref.update(calls, (n) => n + 1))
                return PushResponse.make({
                  ...response,
                  accepted: response.accepted.filter((a) => a.table === "set"),
                  rejected: response.accepted
                    .filter((a) => a.table === "exercise")
                    .map((a) => ({
                      table: a.table,
                      id: a.id,
                      reason: "forbidden" as const,
                      message: "x",
                    })),
                })
              },
            }),
          })
          yield* phone.run(write([exerciseChange("Squat", at(0)), setChange(100, at(2))], true))
          const first = yield* phone.run(sync)
          yield* phone.run(sync)
          expect(first.rejected).toBe(1)
          expect(yield* Ref.get(calls)).toBe(1) // one push in total: the rejected row is not resent
          expect(yield* phone.run(setRows)).toEqual([
            { weightKg: 100, updatedAt: at(2), _dirty: 0, _rejected: null, deletedAt: null },
          ])
          expect(yield* phone.run(query(`SELECT "_dirty", "_rejected" FROM "exercise"`))).toEqual([
            { _dirty: 1, _rejected: "forbidden" },
          ])
        }),
      ),
  )

  it.effect("a rejected row is reconciled by a newer server row on the next pull", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone({
          transport: scripted({
            answer: (response) =>
              PushResponse.make({
                accepted: [],
                conflicts: [],
                serverTime: response.serverTime,
                rejected: [{ table: "set", id: SET_ID, reason: "forbidden", message: "x" }],
              }),
          }),
        })
        yield* phone.run(write([setChange(100, at(2))], true))
        yield* phone.run(sync)
        expect((yield* phone.run(setRows))[0]?._rejected).toBe("forbidden")
        yield* MockSyncServer.use((server) =>
          server.sendChanges(LOCAL_USER_ID, { changes: [setChange(120, at(9))] }),
        )
        yield* phone.run(sync)
        expect(yield* phone.run(setRows)).toEqual([
          { weightKg: 120, updatedAt: at(9), _dirty: 0, _rejected: null, deletedAt: null },
        ])
      }),
    ),
  )

  it.effect("a pulled session tombstone does not cascade to a set that is still live", () =>
    withServer(
      Effect.gen(function* () {
        yield* MockSyncServer.use((server) =>
          server.sendChanges(LOCAL_USER_ID, { changes: [sessionChange(at(5), at(5))] }),
        )
        const phone = yield* openPhone()
        yield* phone.run(write([sessionChange(at(1))], false))
        yield* phone.run(write([setChange(100, at(6))], true))
        yield* phone.run(sync)
        const session = yield* phone.run(
          query(`SELECT "deletedAt" FROM "workout_session" WHERE "id" = '${SESSION_ID}'`),
        )
        expect(session).toEqual([{ deletedAt: at(5) }])
        // Observed: the set survives, clean, under a deleted parent.
        expect((yield* phone.run(setRows))[0]).toMatchObject({ _dirty: 0, deletedAt: null })
      }),
    ),
  )

  it.effect(
    "a server exercise rename reaches the phone and leaves the referencing set intact",
    () =>
      withServer(
        Effect.gen(function* () {
          const phone = yield* openPhone()
          yield* phone.run(
            write(
              [exerciseChange("Squat", at(0)), sessionChange(at(1)), setChange(100, at(2))],
              true,
            ),
          )
          yield* phone.run(sync)
          yield* MockSyncServer.use((server) =>
            server.sendChanges(LOCAL_USER_ID, { changes: [exerciseChange("Back Squat", at(9))] }),
          )
          yield* phone.run(sync)
          expect(yield* phone.run(query(`SELECT "name" FROM "exercise"`))).toEqual([
            { name: "Back Squat" },
          ])
          expect((yield* phone.run(setRows))[0]).toMatchObject({ weightKg: 100, _dirty: 0 })
        }),
      ),
  )

  it.effect("a device clock a day ahead and one on time still converge", () =>
    withServer(
      Effect.gen(function* () {
        const ahead = yield* openPhone()
        const onTime = yield* openPhone()
        yield* ahead.run(
          write(
            [sessionChange("2026-10-21T08:00:00.000Z"), setChange(100, "2026-10-21T08:00:00.000Z")],
            true,
          ),
        )
        yield* ahead.run(sync)
        yield* onTime.run(sync)
        yield* onTime.run(write([setChange(90, at(9))], true))
        yield* onTime.run(sync)
        yield* ahead.run(sync)
        const a = yield* ahead.run(setRows)
        const b = yield* onTime.run(setRows)
        expect(a).toEqual(b)
      }),
    ),
  )

  it.effect("re-key interrupted mid-batch rolls back fully and succeeds on retry", () =>
    withServer(
      Effect.gen(function* () {
        const user = UserId.make("00000000-0000-4000-8000-0000000000aa")
        const phone = yield* openPhone({ signedIn: user })
        yield* phone.run(write([sessionChange(at(1)), setChange(100, at(2))], true))
        const before = yield* phone.run(query(`SELECT "userId", "_dirty" FROM "workout_set"`))
        yield* phone.run(
          SqlDriver.use((driver) =>
            driver.batch([
              {
                sql: `CREATE TRIGGER "boom" BEFORE UPDATE OF "userId" ON "workout_set" BEGIN SELECT RAISE(ABORT, 'boom'); END`,
                params: [],
              },
            ]),
          ),
        )
        const failure = yield* Effect.flip(
          phone.run(SyncEngine.use((engine) => engine.rekeyLocalUser(user))),
        )
        expect(failure._tag).toBe("StoreError")
        expect(yield* phone.run(query(`SELECT "userId", "_dirty" FROM "workout_set"`))).toEqual(
          before,
        )
        expect(yield* phone.run(query(`SELECT "userId" FROM "workout_session"`))).toEqual([
          { userId: LOCAL_USER_ID },
        ])
        expect(yield* phone.run(query(`SELECT COUNT(*) AS "n" FROM "sync_state"`))).toEqual([
          { n: 0 },
        ])
        yield* phone.run(
          SqlDriver.use((driver) => driver.batch([{ sql: `DROP TRIGGER "boom"`, params: [] }])),
        )
        expect(yield* phone.run(SyncEngine.use((engine) => engine.rekeyLocalUser(user)))).toBe(true)
        expect(yield* phone.run(SyncEngine.use((engine) => engine.rekeyLocalUser(user)))).toBe(
          false,
        )
      }),
    ),
  )

  it.effect("an empty database syncs and reports zero", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone()
        const summary = yield* phone.run(sync)
        expect(summary).toMatchObject({ pushed: 0, rejected: 0, pulled: 0 })
        expect(DateTime.isDateTime(DateTime.makeUnsafe(summary.serverTime))).toBe(true)
      }),
    ),
  )

  it.effect("a garbled stored cursor fails with a typed StoreError, never throws", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone()
        yield* phone.run(
          SqlDriver.use((driver) =>
            driver.batch([
              {
                sql: `INSERT INTO "sync_state" ("key","value") VALUES ('pullCursor','')`,
                params: [],
              },
            ]),
          ),
        )
        const error = yield* Effect.flip(phone.run(sync))
        expect(error._tag).toBe("StoreError")
      }),
    ),
  )

  it.effect("an undecodable dirty row is flagged invalid and not retried", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone()
        yield* phone.run(write([sessionChange(at(1))], true))
        yield* phone.run(
          SqlDriver.use((driver) =>
            driver.batch([
              {
                sql: `INSERT INTO "workout_set" ("id","userId","sessionId","exerciseId","order","weightKg","reps","note","loggedAt","createdAt","updatedAt","_dirty") VALUES ('${SET_ID}','${LOCAL_USER_ID}','${SESSION_ID}','x',0,-5,5,NULL,'${at(1)}','${at(1)}','${at(2)}',1)`,
                params: [],
              },
            ]),
          ),
        )
        const first = yield* phone.run(sync)
        expect(first).toMatchObject({ pushed: 1, rejected: 1 })
        expect((yield* phone.run(setRows))[0]).toMatchObject({ _dirty: 1, _rejected: "invalid" })
        expect(yield* phone.run(sync)).toMatchObject({ pushed: 0, rejected: 0 })
      }),
    ),
  )

  // Ratified: collectDirty flags an undecodable row (here a negative weight written straight to
  // SQLite) `_rejected = "invalid"` and pushes the healthy rows in the same pass.
  it.effect("a poison row does not block pushing healthy rows", () =>
    withServer(
      Effect.gen(function* () {
        const phone = yield* openPhone()
        yield* phone.run(write([sessionChange(at(1))], true))
        yield* phone.run(
          SqlDriver.use((driver) =>
            driver.batch([
              {
                sql: `INSERT INTO "workout_set" ("id","userId","sessionId","exerciseId","order","weightKg","reps","note","loggedAt","createdAt","updatedAt","_dirty") VALUES ('${SET_ID}','${LOCAL_USER_ID}','${SESSION_ID}','x',0,-5,5,NULL,'${at(1)}','${at(1)}','${at(2)}',1)`,
                params: [],
              },
            ]),
          ),
        )
        yield* Effect.ignore(phone.run(sync))
        const server = yield* MockSyncServer.use((mock) => mock.rows)
        expect(server.length).toBe(1)
      }),
    ),
  )
})
