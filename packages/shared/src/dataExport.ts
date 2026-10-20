import { Schema } from "effect"
import { Timestamp } from "./common"
import { UserId } from "./ids"
import { SyncChange } from "./sync"

/**
 * The "export all data" file. `rows` reuses `SyncChange`, so the file can be re-imported later
 * through the sync push path. Live rows of all 8 synced tables; `userId` is `None` when the
 * export was made signed out.
 */
export const DataExport = Schema.Struct({
  format: Schema.Literal("tanren.export"),
  version: Schema.Literal(1),
  exportedAt: Timestamp,
  userId: Schema.OptionFromNullOr(UserId),
  rows: Schema.Array(SyncChange),
})
export type DataExport = typeof DataExport.Type
export type DataExportEncoded = (typeof DataExport)["Encoded"]
