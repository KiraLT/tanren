import { describe, expect, it } from "@effect/vitest"
import { SYNC_TABLE_ORDER, SyncCursor } from "@tanren/shared"
import { Effect } from "effect"
import { decodeCursor, encodeCursor, tableRank } from "./Cursor"

const ID = "c7c91da0-5dff-4969-a825-53f118f5d5e3"

describe("cursor rank width", () => {
  it.effect("round-trips a cursor ending on the dailyHealth rank (11)", () =>
    Effect.gen(function* () {
      const cursor = encodeCursor({ seq: 3, rank: tableRank("dailyHealth"), id: ID })
      const back = yield* decodeCursor(cursor)
      expect(back).toEqual({ seq: 3, rank: 11, id: ID })
    }),
  )

  it.effect("round-trips a single-digit rank", () =>
    Effect.gen(function* () {
      const back = yield* decodeCursor(encodeCursor({ seq: 3, rank: 9, id: ID }))
      expect(back.rank).toBe(9)
    }),
  )

  it.effect("round-trips the importedActivity rank (10)", () =>
    Effect.gen(function* () {
      const back = yield* decodeCursor(encodeCursor({ seq: 4, rank: 10, id: ID }))
      expect(back.rank).toBe(10)
    }),
  )

  it.effect("rejects a rank past the last synced table", () =>
    Effect.gen(function* () {
      const past = SYNC_TABLE_ORDER.length
      const error = yield* Effect.flip(decodeCursor(SyncCursor.make(`3:${past}:${ID}`)))
      expect(error._tag).toBe("ValidationError")
    }),
  )

  it.effect("garbage cursor fails typed", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(decodeCursor(SyncCursor.make("nope")))
      expect(exit._tag).toBe("Failure")
    }),
  )
})

describe("cursor rank per table", () => {
  it.effect("round-trips a cursor on every table rank, the LAST (program) included", () =>
    Effect.gen(function* () {
      const ranks = yield* Effect.forEach(SYNC_TABLE_ORDER, (table) =>
        decodeCursor(encodeCursor({ seq: 7, rank: tableRank(table), id: ID })).pipe(
          Effect.map((back) => back.rank),
        ),
      )
      expect(ranks).toEqual(SYNC_TABLE_ORDER.map((_, i) => i))
      expect(SYNC_TABLE_ORDER[SYNC_TABLE_ORDER.length - 1]).toBe("program")
    }),
  )
})
