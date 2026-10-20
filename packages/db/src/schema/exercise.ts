import { sql } from "drizzle-orm"
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { rowColumns, userSeqIndex } from "./sync"

export const exercise = sqliteTable(
  "exercise",
  {
    ...rowColumns(),
    name: text("name").notNull(),
    aliases: text("aliases").notNull(),
    muscleGroups: text("muscle_groups").notNull(),
    notes: text("notes"),
    /** Link to the static catalog in `@tanren/shared` (v2-catalog.md §4); relinkable. */
    catalogId: text("catalog_id"),
  },
  (t) => [
    userSeqIndex("exercise", t),
    index("exercise_user_catalog_idx").on(t.userId, t.catalogId),
    // One live exercise per case-insensitive name (DM §11.3).
    uniqueIndex("exercise_user_name_unique")
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
)
