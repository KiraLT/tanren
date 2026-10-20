/** Test fixtures: one in-memory phone (store, Today, sync) and wire-row builders. */
import { IdGenerator, SyncChange, type UserId } from "@tanren/shared"
import { type Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { CurrentUser } from "../services/CurrentUser"
import { LocalStore } from "../services/LocalStore"
import { MockSyncServer } from "../services/MockSyncServer"
import type { SqlDriver } from "../services/SqlDriver"
import { nodeSqlDriverLayer } from "../services/SqlDriver.testing"
import { StoreEvents } from "../services/StoreEvents"
import { SyncEngine } from "../services/SyncEngine"
import type { SyncTransport } from "../services/SyncTransport"
import { TodayRepo } from "../services/TodayRepo"
import { LOCAL_USER_ID } from "../store/localUser"

export const EXERCISE_ID = "00000000-0000-4000-8000-0000000000e1"
export const SESSION_ID = "00000000-0000-4000-8000-0000000000a1"
export const SET_ID = "00000000-0000-4000-8000-0000000000c1"
export const at = (minute: number) => `2026-10-20T08:${String(minute).padStart(2, "0")}:00.000Z`
const decode = Schema.decodeUnknownSync(SyncChange)

export const exerciseChange = (name: string, updatedAt: string, deletedAt: string | null = null) =>
  decode({
    table: "exercise",
    row: {
      id: EXERCISE_ID,
      userId: LOCAL_USER_ID,
      name,
      aliases: [],
      muscleGroups: [],
      notes: null,
      createdAt: at(0),
      updatedAt,
      deletedAt,
    },
  })

export const sessionChange = (updatedAt: string, deletedAt: string | null = null) =>
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
      deletedAt,
    },
  })

export const setChange = (weightKg: number, updatedAt: string) =>
  decode({
    table: "set",
    row: {
      id: SET_ID,
      userId: LOCAL_USER_ID,
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

export type Phone = SyncEngine | LocalStore | SqlDriver | StoreEvents | TodayRepo | SyncTransport
export type PhoneEnv = Phone | CurrentUser | IdGenerator | DateTime.CurrentTimeZone

/**
 * A phone signed out (rows owned by `LOCAL_USER_ID`), its transport built by `transport` (default:
 * the mock server as `LOCAL_USER_ID`). Needs a `MockSyncServer` in scope.
 */
export const openPhone = (
  options: {
    readonly transport?: Layer.Layer<SyncTransport, never, MockSyncServer>
    readonly signedIn?: UserId
  } = {},
) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      Layer.mergeAll(TodayRepo.layerNoDeps, SyncEngine.layerNoDeps).pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            LocalStore.layerNoDeps.pipe(
              Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
            ),
            options.transport ?? MockSyncServer.transport(options.signedIn ?? LOCAL_USER_ID),
            CurrentUser.layerTest(Option.fromNullishOr(options.signedIn)),
            IdGenerator.layerTest,
            DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
          ),
        ),
      ),
    )
    return {
      run: <A, E>(effect: Effect.Effect<A, E, PhoneEnv>): Effect.Effect<A, E> =>
        Effect.provide(effect, context satisfies Context.Context<PhoneEnv>),
    }
  })
