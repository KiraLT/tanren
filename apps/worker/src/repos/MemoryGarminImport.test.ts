import { describe, expect, it } from "@effect/vitest"
import { GarminImportRepo, IntegrationRepo, SealedToken } from "@tanren/db"
import {
  DailyHealth,
  IdGenerator,
  ImportedActivity,
  ImportedActivityInsert,
  LocalDate,
  UserId,
  Uuid,
} from "@tanren/shared"
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

const day = (n: number, date: string, deletedAt: string | null = null) =>
  Schema.decodeUnknownSync(DailyHealth)({
    id: `73000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
    userId: user,
    createdAt: "2026-10-27T08:00:00.000Z",
    updatedAt: "2026-10-27T08:00:00.000Z",
    deletedAt,
    provider: "garmin",
    date,
    totalCalories: 2500,
    activeCalories: 600,
    steps: 9000,
    restingHeartRate: 52,
  })

describe("MemoryGarminImport.listDays", () => {
  it.effect("returns live days with date in [from, to], both ends included, by date", () =>
    Effect.gen(function* () {
      const store = yield* MemoryStore
      yield* store.put("dailyHealth", user, [
        day(1, "2026-10-21"),
        day(2, "2026-10-27"),
        day(3, "2026-10-22"),
        day(4, "2026-10-28"),
        day(5, "2026-10-24", "2026-10-27T09:00:00.000Z"),
      ])
      const days = yield* (yield* GarminImportRepo).listDays(
        user,
        LocalDate.make("2026-10-22"),
        LocalDate.make("2026-10-27"),
      )
      expect(days.map((d) => d.date)).toEqual(["2026-10-22", "2026-10-27"])
    }).pipe(
      Effect.provide(
        MemoryGarminImport.layer.pipe(
          Layer.provide(IdGenerator.layerTest),
          Layer.provide(MemoryIntegrations.layer),
          Layer.provideMerge(MemoryStore.layer),
        ),
      ),
    ),
  )
})

const stored = (n: number, startedAt: string, deletedAt: string | null = null) =>
  Schema.decodeUnknownSync(ImportedActivity)({
    id: `74100000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
    userId: user,
    createdAt: "2026-10-27T08:00:00.000Z",
    updatedAt: "2026-10-27T08:00:00.000Z",
    deletedAt,
    provider: "garmin",
    externalId: `ext-${n}`,
    sport: "running",
    title: `Run ${n}`,
    startedAt,
    durationSeconds: 1800,
    distanceMeters: null,
    calories: null,
    avgHeartRate: null,
    maxHeartRate: null,
  })

describe("MemoryGarminImport.listActivities", () => {
  it.effect("returns live activities with from <= startedAt < to, newest first, capped", () =>
    Effect.gen(function* () {
      const store = yield* MemoryStore
      yield* store.put("importedActivity", user, [
        stored(1, "2026-10-10T07:00:00.000Z"),
        stored(2, "2026-10-18T06:00:00.000Z"),
        stored(3, "2026-10-01T00:00:00.000Z"),
        stored(4, "2026-10-20T00:00:00.000Z"),
        stored(5, "2026-09-30T23:59:59.000Z"),
        stored(6, "2026-10-12T07:00:00.000Z", "2026-10-13T00:00:00.000Z"),
      ])
      const repo = yield* GarminImportRepo
      const range = { from: at("2026-10-01T00:00:00.000Z"), to: at("2026-10-20T00:00:00.000Z") }
      expect((yield* repo.listActivities(user, range, 200)).map((r) => r.externalId)).toEqual([
        "ext-2",
        "ext-1",
        "ext-3",
      ])
      expect((yield* repo.listActivities(user, range, 2)).map((r) => r.externalId)).toEqual([
        "ext-2",
        "ext-1",
      ])
    }).pipe(
      Effect.provide(
        MemoryGarminImport.layer.pipe(
          Layer.provide(IdGenerator.layerTest),
          Layer.provide(MemoryIntegrations.layer),
          Layer.provideMerge(MemoryStore.layer),
        ),
      ),
    ),
  )
})
