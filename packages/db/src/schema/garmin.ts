import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { rowColumns, userSeqIndex } from "./sync"

/**
 * Imported provider data (garmin.md §2, ADR-0023): pull-only synced tables. Only the Worker writes
 * them (through `SyncStore.apply`); `Sync.push` rejects client changes `forbidden`. The unique keys
 * are not partial: a re-import after a disconnect revives the soft-deleted row under its old id.
 */
export const importedActivity = sqliteTable(
  "imported_activity",
  {
    ...rowColumns(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    sport: text("sport").notNull(),
    title: text("title").notNull(),
    startedAt: text("started_at").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    distanceMeters: real("distance_meters"),
    calories: integer("calories"),
    avgHeartRate: integer("avg_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
  },
  (t) => [
    userSeqIndex("imported_activity", t),
    uniqueIndex("imported_activity_user_provider_external_unique").on(
      t.userId,
      t.provider,
      t.externalId,
    ),
    index("imported_activity_user_started_idx").on(t.userId, t.startedAt),
  ],
)

/** One row per (user, provider, local day). */
export const dailyHealth = sqliteTable(
  "daily_health",
  {
    ...rowColumns(),
    provider: text("provider").notNull(),
    date: text("date").notNull(),
    totalCalories: integer("total_calories"),
    activeCalories: integer("active_calories"),
    steps: integer("steps"),
    restingHeartRate: integer("resting_heart_rate"),
  },
  (t) => [
    userSeqIndex("daily_health", t),
    uniqueIndex("daily_health_user_provider_date_unique").on(t.userId, t.provider, t.date),
  ],
)
