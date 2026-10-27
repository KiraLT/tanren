import { SYNC_TABLE_ORDER, SyncCursor, type SyncTable, ValidationError } from "@tanren/shared"
import { Effect, Option, Order } from "effect"

/**
 * A position in the server sync order `(server_seq, table rank in SYNC_TABLE_ORDER, id)` (db.md §3).
 * Encoded as `"<seq>:<rank>:<id>"` (`-` for the empty id of the start), the format the worker port
 * (apps/worker/src/sync/SyncStore.ts) chose; opaque to clients.
 */
export interface Position {
  readonly seq: number
  readonly rank: number
  readonly id: string
}

export const positionOrder: Order.Order<Position> = Order.combine(
  Order.mapInput(Order.Number, (p: Position) => p.seq),
  Order.combine(
    Order.mapInput(Order.Number, (p: Position) => p.rank),
    Order.mapInput(Order.String, (p: Position) => p.id),
  ),
)

/** Before every row: the position of a first pull (`since: null`). */
export const START: Position = { seq: 0, rank: 0, id: "" }

export const tableRank = (table: SyncTable): number => SYNC_TABLE_ORDER.indexOf(table)

export const encodeCursor = (position: Position): SyncCursor =>
  SyncCursor.make(`${position.seq}:${position.rank}:${position.id || "-"}`)

// Uppercase hex too: `Schema.isUUID()` accepts it, so a stored id may be uppercase. The rank has as
// many digits as SYNC_TABLE_ORDER needs (12 tables since GM-2: ranks 10 and 11 are two digits); a
// rank past the last table is rejected below.
const CURSOR = /^(\d{1,15}):(\d{1,2}):([0-9a-fA-F-]{36}|-)$/

const badCursor = (cursor: string) =>
  new ValidationError({
    message: `invalid sync cursor: ${cursor}`,
    issues: [{ path: ["since"], message: "not a cursor issued by this server" }],
  })

export const decodeCursor = (cursor: SyncCursor): Effect.Effect<Position, ValidationError> =>
  Option.match(Option.fromNullishOr(CURSOR.exec(cursor)), {
    onNone: () => Effect.fail(badCursor(cursor)),
    onSome: ([, seq, rank, id]) =>
      seq === undefined ||
      rank === undefined ||
      id === undefined ||
      Number(rank) >= SYNC_TABLE_ORDER.length
        ? Effect.fail(badCursor(cursor))
        : Effect.succeed({ seq: Number(seq), rank: Number(rank), id: id === "-" ? "" : id }),
  })
