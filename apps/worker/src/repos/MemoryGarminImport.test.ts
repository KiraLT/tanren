import { describe, expect, it } from "@effect/vitest"
import { GarminImportRepo, IntegrationRepo, SealedToken } from "@tanren/db"
import { IdGenerator, ImportedActivityInsert, UserId, Uuid } from "@tanren/shared"
import { Effect, Layer, Schema } from "effect"
import { at } from "../sync/fixtures"
import { MemoryGarminImport } from "./MemoryGarminImport"
import { MemoryIntegrations } from "./MemoryIntegrations"
import { MemoryStore } from "./MemoryStore"

const user = UserId.make("00000000-0000-4000-8000-0000000000f7")
const T0 = at("2026-10-27T08:00:00.000Z")

const activity = Schema.decodeUnknownSync(ImportedActivityInsert)({
  provider: "garmin",
  externalId: "1",
  sport: "running",
  title: "Run",
  startedAt: "2026-10-27T06:00:00.000Z",
  durationSeconds: 1800,
  distanceMeters: null,
  calories: null,
  avgHeartRate: null,
  maxHeartRate: null,
})

/** Wired like `memoryPersistence`: the fake is built on the `IntegrationRepo` the test drives. */
const TestLayer = MemoryGarminImport.layer.pipe(
  Layer.provide(IdGenerator.layerTest),
  Layer.provideMerge(MemoryIntegrations.layer),
  Layer.provide(MemoryStore.layer),
)

describe("MemoryGarminImport and the connection gate (like the D1 repo)", () => {
  it.effect("writes while Garmin is connected and nothing after a disconnect", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const integrations = yield* IntegrationRepo
      yield* integrations.upsert({
        id: Uuid.make("00000000-0000-4000-8000-0000000000f8"),
        userId: user,
        provider: "garmin",
        status: "active",
        externalId: "personal",
        displayName: "Garmin account",
        accessToken: SealedToken.make("v1.iv.jwt"),
        refreshToken: SealedToken.make("v1.iv.key"),
        expiresAt: T0,
        scope: "",
        createdAt: T0,
        updatedAt: T0,
      })
      expect(yield* repo.upsertActivities(user, [activity])).toBe(1)
      yield* repo.softDeleteAll(user, "garmin")
      yield* integrations.remove(user, "garmin")
      expect(yield* repo.upsertActivities(user, [activity])).toBe(0)
      expect(yield* repo.counts(user, "garmin")).toEqual({ activities: 0, days: 0 })
    }).pipe(Effect.provide(TestLayer)),
  )
})
