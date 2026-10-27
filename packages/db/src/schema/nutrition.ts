import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { rowColumns, userSeqIndex } from "./sync"

/**
 * One meal, snack or supplement (nutrition.md §2, ADR-0025). Synced both ways; `items` is JSON
 * text and the totals are the denormalised `totalsOf(items)` (`SyncStore` rejects a mismatch).
 */
export const foodEntry = sqliteTable(
  "food_entry",
  {
    ...rowColumns(),
    loggedAt: text("logged_at").notNull(),
    meal: text("meal").notNull(),
    source: text("source").notNull(),
    items: text("items").notNull(),
    kcal: integer("kcal").notNull(),
    proteinG: real("protein_g").notNull(),
    carbsG: real("carbs_g").notNull(),
    fatG: real("fat_g").notNull(),
    note: text("note"),
  },
  (t) => [
    userSeqIndex("food_entry", t),
    index("food_entry_user_logged_idx").on(t.userId, t.loggedAt),
  ],
)
