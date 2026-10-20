import { sql } from "drizzle-orm"
import { check, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { rowColumns, userSeqIndex } from "./sync"

/** One profile per user; `id = user_id` (db.md §1). JSON columns hold text. */
export const profile = sqliteTable(
  "profile",
  {
    ...rowColumns(),
    goals: text("goals").notNull(),
    constraints: text("constraints").notNull(),
    availableDays: text("available_days").notNull(),
    equipment: text("equipment").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => [
    uniqueIndex("profile_user_id_unique").on(t.userId),
    check("profile_id_is_user_id", sql`${t.id} = ${t.userId}`),
    userSeqIndex("profile", t),
  ],
)
