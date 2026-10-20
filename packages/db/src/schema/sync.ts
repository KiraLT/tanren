import { type AnySQLiteColumn, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Columns every synced table has (docs/design/db.md §1). No SQL defaults: the writer supplies every
 * value. Timestamps are canonical ISO UTC strings, so text order is chronological.
 */
export const rowColumns = () => ({
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  serverSeq: integer("server_seq").notNull(),
})

/** `<table>_user_seq_idx (user_id, server_seq)`: pull pages by server order (db.md §2). */
export const userSeqIndex = (
  table: string,
  columns: { readonly userId: AnySQLiteColumn; readonly serverSeq: AnySQLiteColumn },
) => index(`${table}_user_seq_idx`).on(columns.userId, columns.serverSeq)

/** Per-user monotonic write position (db.md §3). Not synced: no row columns. */
export const syncClock = sqliteTable("sync_clock", {
  userId: text("user_id").primaryKey(),
  seq: integer("seq").notNull(),
})
