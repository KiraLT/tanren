import { describe, expect, it } from "@effect/vitest"
import { LocationId } from "@tanren/shared"
import { DateTime, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser } from "./CurrentUser"
import { LocalStore } from "./LocalStore"
import { ProfileRepo } from "./ProfileRepo"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const TestLayer = ProfileRepo.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

const homeId = LocationId.make("2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d")
const home = { id: homeId, name: "Home", equipment: ["dumbbell", "bench"] as const }

const dirtyFlags = LocalStore.use((store) =>
  store.all({ sql: `SELECT "_dirty" FROM "profile"`, params: [] }),
)

describe("ProfileRepo", () => {
  it.effect("get is None before the first save", () =>
    Effect.gen(function* () {
      expect(yield* ProfileRepo.use((repo) => repo.get)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("the first save creates the profile in the device zone for the owner", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 21, 8))
      const saved = yield* ProfileRepo.use((repo) => repo.save({ locations: [home] }))
      expect(saved.timezone).toBe("Europe/Vilnius")
      expect(saved.id).toBe(LOCAL_USER_ID)
      expect(saved.userId).toBe(LOCAL_USER_ID)
      expect(saved.goals).toEqual([])
      expect(DateTime.formatIso(saved.createdAt)).toBe("2026-10-21T08:00:00.000Z")
      const read = yield* ProfileRepo.use((repo) => repo.get)
      expect(Option.map(read, (profile) => profile.locations.map((l) => l.name))).toEqual(
        Option.some(["Home"]),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a save marks the row dirty so sync pushes it", () =>
    Effect.gen(function* () {
      yield* ProfileRepo.use((repo) => repo.save({ locations: [home] }))
      expect(yield* dirtyFlags).toEqual([{ _dirty: 1 }])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a later save keeps createdAt and other fields, bumps updatedAt", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 21, 8))
      yield* ProfileRepo.use((repo) => repo.save({ locations: [home] }))
      yield* TestClock.setTime(Date.UTC(2026, 9, 21, 9))
      const saved = yield* ProfileRepo.use((repo) =>
        repo.save({ activeLocationId: Option.some(homeId) }),
      )
      expect(saved.locations.map((l) => l.id)).toEqual([homeId])
      expect(DateTime.formatIso(saved.createdAt)).toBe("2026-10-21T08:00:00.000Z")
      expect(DateTime.formatIso(saved.updatedAt)).toBe("2026-10-21T09:00:00.000Z")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "an active id that names no location fails with ProfileInvalid and writes nothing",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          ProfileRepo.use((repo) => repo.save({ activeLocationId: Option.some(homeId) })),
        )
        expect(error._tag).toBe("ProfileInvalid")
        expect(yield* dirtyFlags).toEqual([])
      }).pipe(Effect.provide(TestLayer)),
  )
})
