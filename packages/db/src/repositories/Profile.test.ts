import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import { profile, TestLayer, t2, userA, userB } from "../testing/fixtures"
import { ProfileRepo } from "./Profile"

const ownerA = UserId.make(userA)
const ownerB = UserId.make(userB)

describe("ProfileRepo", () => {
  it.effect("returns the stored profile with its JSON columns decoded", () =>
    Effect.gen(function* () {
      const repo = yield* ProfileRepo
      const row = profile()
      yield* repo.put(ownerA, [row])
      expect(yield* repo.get(ownerA)).toEqual(Option.some(row))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("updates the profile in place on a second put", () =>
    Effect.gen(function* () {
      const repo = yield* ProfileRepo
      const updated = profile({ timezone: "Europe/Vilnius", updatedAt: t2 })
      yield* repo.put(ownerA, [profile()])
      yield* repo.put(ownerA, [updated])
      expect(yield* repo.get(ownerA)).toEqual(Option.some(updated))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "stores locations and the active one, and writes the legacy equipment column as []",
    () =>
      Effect.gen(function* () {
        const repo = yield* ProfileRepo
        const home = {
          id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          name: "Home",
          equipment: ["bench"] as const,
        }
        const row = profile({ locations: [home], activeLocationId: home.id, updatedAt: t2 })
        yield* repo.put(ownerA, [row])
        expect(yield* repo.get(ownerA)).toEqual(Option.some(row))
        const sql = yield* SqlClient.SqlClient
        const raw = yield* sql<{ readonly equipment: string; readonly activeLocationId: string }>`
        SELECT equipment, active_location_id FROM profile WHERE id = ${userA}`
        expect(raw).toEqual([{ equipment: "[]", activeLocationId: home.id }])
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("has no profile for a user who never wrote one", () =>
    Effect.gen(function* () {
      expect(yield* (yield* ProfileRepo).get(ownerB)).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with Forbidden for another user's profile", () =>
    Effect.gen(function* () {
      const repo = yield* ProfileRepo
      const error = yield* Effect.flip(repo.put(ownerA, [profile({ id: userB, userId: userB })]))
      expect(error._tag).toBe("Forbidden")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("rejects a profile whose id differs from its user", () =>
    Effect.gen(function* () {
      const repo = yield* ProfileRepo
      const error = yield* Effect.flip(repo.put(ownerB, [profile({ id: userA, userId: userB })]))
      expect(error._tag).toBe("PersistenceError")
    }).pipe(Effect.provide(TestLayer)),
  )
})
