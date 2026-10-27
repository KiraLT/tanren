import { D1Client } from "@effect/sql-d1"
import { expect, it, layer } from "@effect/vitest"
import {
  DailyHealthInsert,
  IdGenerator,
  ImportedActivity,
  ImportedActivityInsert,
  type SyncChange,
  UserId,
  Uuid,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Ref, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { activeIntegrationGuard, GarminImportRepo } from "../repositories/GarminImport"
import { IntegrationRepo, SealedToken } from "../repositories/Integration"
import { TestLayer } from "../testing/fixtures"
import { SyncStore } from "./SyncStore"

/** The Garmin import tables (migration 0007, garmin.md §2), written through `SyncStore.apply`. */

/** One layer for the file: `IdGenerator.layerTest` keeps counting, so ids never repeat in this D1. */
const GarminLayer = GarminImportRepo.layer.pipe(
  Layer.provideMerge(SyncStore.layer),
  Layer.provideMerge(IdGenerator.layerTest),
  Layer.provideMerge(TestLayer),
)

const userOf = (n: number) =>
  UserId.make(`00000000-0000-4000-8000-${(0x700 + n).toString(16).padStart(12, "0")}`)
/** A user with an active Garmin connection: upserts write only while one exists. */
const connected = (n: number) =>
  Effect.gen(function* () {
    const userId = userOf(n)
    const stamp = DateTime.makeUnsafe("2026-10-27T07:00:00.000Z")
    yield* (yield* IntegrationRepo).upsert({
      id: Uuid.make(`00000000-0000-4000-8000-${(0x7a0 + n).toString(16).padStart(12, "0")}`),
      userId,
      provider: "garmin",
      status: "active",
      externalId: "personal",
      displayName: "Garmin account",
      accessToken: SealedToken.make("v1.iv.jwt"),
      refreshToken: SealedToken.make("v1.iv.key"),
      expiresAt: stamp,
      scope: "",
      createdAt: stamp,
      updatedAt: stamp,
    })
    return userId
  })
const at = (iso: string) => TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(iso)))

const activity = (externalId: string, title = "Morning Run") =>
  Schema.decodeUnknownSync(ImportedActivityInsert)({
    provider: "garmin",
    externalId,
    sport: "running",
    title,
    startedAt: "2026-10-26T06:00:00.000Z",
    durationSeconds: 1800,
    distanceMeters: 5000,
    calories: 350,
    avgHeartRate: 150,
    maxHeartRate: 172,
  })

const day = (date: string, steps: number) =>
  Schema.decodeUnknownSync(DailyHealthInsert)({
    provider: "garmin",
    date,
    totalCalories: 2400,
    activeCalories: 600,
    steps,
    restingHeartRate: 52,
  })

const seqOf = (table: "imported_activity" | "daily_health", userId: UserId) =>
  Effect.gen(function* () {
    const sql = yield* D1Client.D1Client
    return yield* sql<{ readonly id: string; readonly serverSeq: number }>`
      SELECT id, server_seq FROM ${sql(table)} WHERE user_id = ${userId}`
  })

const pullAll = (userId: UserId) =>
  Effect.gen(function* () {
    const page = yield* (yield* SyncStore).pull(userId, Option.none(), 100)
    return page.changes
  })

layer(GarminLayer)("GarminImportRepo through SyncStore", (it) => {
  it.effect("the same externalId upserted twice keeps one row and advances server_seq", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(1)
      yield* at("2026-10-27T08:00:00.000Z")
      expect(yield* repo.upsertActivities(user, [activity("111")])).toBe(1)
      const first = yield* seqOf("imported_activity", user)
      yield* at("2026-10-27T09:00:00.000Z")
      expect(yield* repo.upsertActivities(user, [activity("111", "Renamed Run")])).toBe(1)
      const second = yield* seqOf("imported_activity", user)
      expect(second).toHaveLength(1)
      expect(second[0]?.id).toBe(first[0]?.id)
      expect(second[0]?.serverSeq ?? 0).toBeGreaterThan(first[0]?.serverSeq ?? 0)
      const titles = Arr.filterMap(yield* pullAll(user), (c: SyncChange) =>
        c.table === "importedActivity" ? Result.succeed(c.row.title) : Result.failVoid,
      )
      expect(titles).toEqual(["Renamed Run"])
    }),
  )

  it.effect("a repeat at the same clock instant still writes (the Worker wins LWW)", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(2)
      yield* at("2026-10-27T08:00:00.000Z")
      yield* repo.upsertActivities(user, [activity("222")])
      expect(yield* repo.upsertActivities(user, [activity("222", "Again")])).toBe(1)
    }),
  )

  it.effect("the same (provider, date) twice keeps one row; a repeated key in one call too", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(3)
      yield* at("2026-10-27T08:00:00.000Z")
      expect(yield* repo.upsertDays(user, [day("2026-10-26", 1000), day("2026-10-26", 2000)])).toBe(
        1,
      )
      yield* at("2026-10-27T09:00:00.000Z")
      yield* repo.upsertDays(user, [day("2026-10-26", 9000)])
      expect(yield* seqOf("daily_health", user)).toHaveLength(1)
      const steps = Arr.filterMap(yield* pullAll(user), (c: SyncChange) =>
        c.table === "dailyHealth" ? Result.succeed(c.row.steps) : Result.failVoid,
      )
      expect(steps).toEqual([Option.some(9000)])
    }),
  )

  it.effect("pull after softDeleteAll returns both rows with deletedAt: Some", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(4)
      yield* at("2026-10-27T08:00:00.000Z")
      yield* repo.upsertActivities(user, [activity("444")])
      yield* repo.upsertDays(user, [day("2026-10-26", 4000)])
      yield* at("2026-10-27T09:00:00.000Z")
      expect(yield* repo.softDeleteAll(user, "garmin")).toBe(2)
      const changes = yield* pullAll(user)
      expect(changes.map((c) => c.table)).toEqual(["importedActivity", "dailyHealth"])
      expect(changes.every((c) => Option.isSome(c.row.deletedAt))).toBe(true)
    }),
  )

  it.effect("counts excludes soft-deleted rows; a re-import revives the old id", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(5)
      yield* at("2026-10-27T08:00:00.000Z")
      yield* repo.upsertActivities(user, [activity("551"), activity("552")])
      yield* repo.upsertDays(user, [day("2026-10-25", 1), day("2026-10-26", 2)])
      expect(yield* repo.counts(user, "garmin")).toEqual({ activities: 2, days: 2 })
      yield* at("2026-10-27T09:00:00.000Z")
      yield* repo.softDeleteAll(user, "garmin")
      expect(yield* repo.counts(user, "garmin")).toEqual({ activities: 0, days: 0 })
      const before = yield* seqOf("imported_activity", user)
      yield* at("2026-10-27T10:00:00.000Z")
      yield* repo.upsertActivities(user, [activity("551")])
      expect(yield* repo.counts(user, "garmin")).toEqual({ activities: 1, days: 0 })
      const after = yield* seqOf("imported_activity", user)
      expect(new globalThis.Set(after.map((r) => r.id))).toEqual(
        new globalThis.Set(before.map((r) => r.id)),
      )
    }),
  )

  it.effect("the same upsert twice writes 0 the second time and keeps server_seq", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(6)
      yield* at("2026-10-27T08:00:00.000Z")
      yield* repo.upsertActivities(user, [activity("661")])
      yield* repo.upsertDays(user, [day("2026-10-26", 6000)])
      const activitiesBefore = yield* seqOf("imported_activity", user)
      const daysBefore = yield* seqOf("daily_health", user)
      yield* at("2026-10-27T08:05:00.000Z")
      expect(yield* repo.upsertActivities(user, [activity("661")])).toBe(0)
      expect(yield* repo.upsertDays(user, [day("2026-10-26", 6000)])).toBe(0)
      expect(yield* seqOf("imported_activity", user)).toEqual(activitiesBefore)
      expect(yield* seqOf("daily_health", user)).toEqual(daysBefore)
    }),
  )

  it.effect("softDeleteAll past one page (501 activities) deletes all of them", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(7)
      yield* at("2026-10-27T08:00:00.000Z")
      const many = Arr.map(Arr.range(1, 501), (n) => activity(`7${n}`))
      expect(yield* repo.upsertActivities(user, many)).toBe(501)
      yield* at("2026-10-27T09:00:00.000Z")
      expect(yield* repo.softDeleteAll(user, "garmin")).toBe(501)
      expect(yield* repo.counts(user, "garmin")).toEqual({ activities: 0, days: 0 })
    }),
  )
})

it.effect("a store rejection of a Worker write is a PersistenceError", () =>
  Effect.gen(function* () {
    const repo = yield* GarminImportRepo
    const user = yield* connected(8)
    const error = yield* Effect.flip(repo.upsertActivities(user, [activity("881")]))
    expect(error._tag).toBe("PersistenceError")
    expect(error.operation).toBe("garminImport.upsertActivities")
  }).pipe(
    Effect.provide(
      GarminImportRepo.layer.pipe(
        Layer.provideMerge(
          Layer.succeed(
            SyncStore,
            SyncStore.of({
              getRows: () => Effect.succeed([]),
              apply: (_, changes) =>
                Effect.succeed({
                  accepted: [],
                  conflicts: [],
                  rejected: changes.map((c) => ({
                    table: c.table,
                    id: c.row.id,
                    reason: "forbidden" as const,
                    message: "stub",
                  })),
                  serverTime: DateTime.makeUnsafe("2026-10-27T08:00:00.000Z"),
                }),
              pull: () => Effect.die("unused"),
            }),
          ),
        ),
        Layer.provideMerge(IdGenerator.layerTest),
        Layer.provideMerge(TestLayer),
      ),
    ),
  ),
)

/** A second shared layer needs ids the first block's `IdGenerator.layerTest` never hands out. */
const laterIds = Layer.effect(
  IdGenerator,
  Effect.map(Ref.make(0), (count) =>
    IdGenerator.of({
      next: Effect.map(
        Ref.updateAndGet(count, (n) => n + 1),
        (n) => Uuid.make(`00000000-0000-4000-8000-0009${n.toString(16).padStart(8, "0")}`),
      ),
    }),
  ),
)

layer(
  GarminImportRepo.layer.pipe(
    Layer.provideMerge(SyncStore.layer),
    Layer.provideMerge(laterIds),
    Layer.provideMerge(TestLayer),
  ),
)("GarminImportRepo after a disconnect", (it) => {
  it.effect("an upsert after softDeleteAll + remove writes nothing and counts stay 0", () =>
    Effect.gen(function* () {
      const repo = yield* GarminImportRepo
      const user = yield* connected(9)
      yield* at("2026-10-27T08:00:00.000Z")
      yield* repo.upsertActivities(user, [activity("991")])
      yield* at("2026-10-27T09:00:00.000Z")
      yield* repo.softDeleteAll(user, "garmin")
      yield* (yield* IntegrationRepo).remove(user, "garmin")
      yield* at("2026-10-27T09:01:00.000Z")
      expect(yield* repo.upsertActivities(user, [activity("991"), activity("992")])).toBe(0)
      expect(yield* repo.upsertDays(user, [day("2026-10-26", 1)])).toBe(0)
      expect(yield* repo.counts(user, "garmin")).toEqual({ activities: 0, days: 0 })
    }),
  )
})

it.effect("a guard that finds no active integration aborts the whole apply batch", () =>
  Effect.gen(function* () {
    const sql = yield* D1Client.D1Client
    const store = yield* SyncStore
    const user = userOf(10)
    const row = yield* Schema.decodeUnknownEffect(ImportedActivity)({
      id: "00000000-0000-4000-8000-0000000007b1",
      userId: user,
      createdAt: "2026-10-27T08:00:00.000Z",
      updatedAt: "2026-10-27T08:00:00.000Z",
      deletedAt: null,
      ...Schema.encodeSync(ImportedActivityInsert)(activity("1001")),
    })
    const guard = activeIntegrationGuard(sql, user, "garmin")
    const error = yield* Effect.flip(store.apply(user, [{ table: "importedActivity", row }], guard))
    expect(error._tag).toBe("PersistenceError")
    expect(yield* seqOf("imported_activity", user)).toEqual([])
  }).pipe(Effect.provide(SyncStore.layer.pipe(Layer.provideMerge(TestLayer)))),
)
