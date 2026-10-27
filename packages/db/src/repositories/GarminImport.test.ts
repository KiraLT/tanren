import { describe, expect, it } from "@effect/vitest"
import { IdGenerator, ImportedActivity, UserId } from "@tanren/shared"
import { DateTime, Effect, Layer, Schema } from "effect"
import { SyncStore } from "../sync/SyncStore"
import { TestLayer, t1 } from "../testing/fixtures"
import { GarminImportRepo } from "./GarminImport"

const RepoLayer = GarminImportRepo.layer.pipe(
  Layer.provideMerge(SyncStore.layer),
  Layer.provideMerge(Layer.mergeAll(TestLayer, IdGenerator.layerTest)),
)

const id = (n: number) => `75000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
/** One user per test: the D1 is shared by the file. */
const userOf = (n: number) =>
  UserId.make(`00000000-0000-4000-8000-${(0x750 + n).toString(16).padStart(12, "0")}`)
const at = (iso: string) => DateTime.makeUnsafe(iso)

const activity = (user: UserId, n: number, startedAt: string, deletedAt: string | null = null) =>
  Schema.decodeUnknownSync(ImportedActivity)({
    id: id(n),
    userId: user,
    createdAt: t1,
    updatedAt: t1,
    deletedAt,
    provider: "garmin",
    externalId: `ext-${n}`,
    sport: "running",
    title: `Run ${n}`,
    startedAt,
    durationSeconds: 1800,
    distanceMeters: 5000,
    calories: 400,
    avgHeartRate: null,
    maxHeartRate: null,
  })

describe("GarminImportRepo.listActivities", () => {
  it.effect("returns live activities with from <= startedAt < to, newest first", () =>
    Effect.gen(function* () {
      const user = userOf(1)
      const store = yield* SyncStore
      yield* store.apply(user, [
        { table: "importedActivity", row: activity(user, 1, "2026-10-10T07:00:00.000Z") },
        { table: "importedActivity", row: activity(user, 2, "2026-10-18T06:00:00.000Z") },
        { table: "importedActivity", row: activity(user, 3, "2026-10-01T00:00:00.000Z") },
        { table: "importedActivity", row: activity(user, 4, "2026-10-20T00:00:00.000Z") },
        { table: "importedActivity", row: activity(user, 5, "2026-09-30T23:59:59.000Z") },
        {
          table: "importedActivity",
          row: activity(user, 6, "2026-10-12T07:00:00.000Z", "2026-10-13T00:00:00.000Z"),
        },
      ])
      const rows = yield* (yield* GarminImportRepo).listActivities(
        user,
        { from: at("2026-10-01T00:00:00.000Z"), to: at("2026-10-20T00:00:00.000Z") },
        200,
      )
      expect(rows.map((r) => r.externalId)).toEqual(["ext-2", "ext-1", "ext-3"])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("caps the answer at limit and never reads another user's rows", () =>
    Effect.gen(function* () {
      const user = userOf(2)
      const other = userOf(3)
      const store = yield* SyncStore
      yield* store.apply(user, [
        { table: "importedActivity", row: activity(user, 11, "2026-10-10T07:00:00.000Z") },
        { table: "importedActivity", row: activity(user, 12, "2026-10-11T07:00:00.000Z") },
        { table: "importedActivity", row: activity(user, 13, "2026-10-12T07:00:00.000Z") },
      ])
      yield* store.apply(other, [
        { table: "importedActivity", row: activity(other, 14, "2026-10-12T08:00:00.000Z") },
      ])
      const range = { from: at("2026-10-01T00:00:00.000Z"), to: at("2026-10-20T00:00:00.000Z") }
      const repo = yield* GarminImportRepo
      expect((yield* repo.listActivities(user, range, 2)).map((r) => r.externalId)).toEqual([
        "ext-13",
        "ext-12",
      ])
      expect(yield* repo.listActivities(userOf(4), range, 200)).toEqual([])
    }).pipe(Effect.provide(RepoLayer)),
  )
})
