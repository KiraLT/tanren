import { describe, expect, it } from "@effect/vitest"
import { SyncChange, UserId } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import { OWNER_USER_ID_KEY } from "../store/syncQueries"
import { gateAccount, localSetCount } from "./CurrentUser"
import { LocalStore } from "./LocalStore"
import { SqlDriver } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const USER = UserId.make("00000000-0000-4000-8000-0000000000aa")
const STAMP = "2026-10-01T08:00:00.000Z"
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const TestLayer = LocalStore.layerNoDeps.pipe(
  Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
)

const setRow = (n: number, deletedAt: string | null) => ({
  table: "set",
  row: {
    id: uid(n),
    userId: LOCAL_USER_ID,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt,
    sessionId: uid(100),
    exerciseId: uid(101),
    order: n,
    weightKg: 100,
    reps: 5,
    rpe: null,
    note: null,
    plannedSetId: null,
    loggedAt: STAMP,
  },
})

const writeSets = (deleted: ReadonlyArray<boolean>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(
    deleted.map((gone, n) => setRow(n + 1, gone ? STAMP : null)),
  ).pipe(
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

describe("localSetCount", () => {
  it.effect("is 0 on an empty store", () =>
    Effect.gen(function* () {
      expect(yield* localSetCount).toBe(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("counts live sets and skips tombstones", () =>
    Effect.gen(function* () {
      yield* writeSets([false, false, true])
      expect(yield* localSetCount).toBe(2)
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("gateAccount", () => {
  it.effect("keeps a resolved user", () =>
    Effect.gen(function* () {
      expect(yield* gateAccount(Option.some(USER))).toEqual(Option.some(USER))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("falls back to the stored owner when the session is null (expired)", () =>
    Effect.gen(function* () {
      yield* SqlDriver.use((d) =>
        d.batch([
          {
            sql: `INSERT INTO "sync_state" ("key","value") VALUES (?,?)`,
            params: [OWNER_USER_ID_KEY, USER],
          },
        ]),
      )
      expect(yield* gateAccount(Option.none())).toEqual(Option.some(USER))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is None with no session and no stored owner", () =>
    Effect.gen(function* () {
      expect(yield* gateAccount(Option.none())).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )
})
