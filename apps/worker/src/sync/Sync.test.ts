import { describe, expect, it } from "@effect/vitest"
import { decodeCursor, encodeCursor } from "@tanren/db"
import { type PushResponse, SyncCursor } from "@tanren/shared"
import { DateTime, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { ExerciseRepo, MemoryStore, Repositories } from "../repos"
import { at, ex, exercise, userA, userB } from "./fixtures"
import { Sync } from "./Sync"
import { SyncStore, SyncStoreMemory } from "./SyncStore"

const stored: PushResponse = {
  accepted: [{ table: "exercise", id: exercise(1).id, updatedAt: at("2026-10-20T10:00:00.000Z") }],
  conflicts: [ex(exercise(2))],
  rejected: [{ table: "exercise", id: exercise(3).id, reason: "forbidden", message: "theirs" }],
  serverTime: at("2026-10-20T12:00:00.000Z"),
}
const cursor = SyncCursor.make("4:1:-")
const StubStore = Layer.succeed(
  SyncStore,
  SyncStore.of({
    getRows: () => Effect.succeed([]),
    apply: () => Effect.succeed(stored),
    pull: () => Effect.succeed({ changes: [ex(exercise(1))], cursor, hasMore: true }),
  }),
)

describe("Sync service", () => {
  it.effect("returns the store's PushResponse unchanged", () =>
    Effect.gen(function* () {
      // Aliased: a `.push(` member call trips the noMutation plugin.
      const { push } = yield* Sync
      expect(yield* push(userA, { changes: [ex(exercise(1))] })).toEqual(stored)
    }).pipe(Effect.provide(Sync.layer.pipe(Layer.provide(StubStore)))),
  )

  it.effect("stamps a pull page with the server time", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 20, 12))
      const page = yield* (yield* Sync).pull(userA, { since: Option.none(), limit: 10 })
      expect(page).toMatchObject({ cursor, hasMore: true })
      expect(DateTime.formatIso(page.serverTime)).toBe("2026-10-20T12:00:00.000Z")
    }).pipe(Effect.provide(Sync.layer.pipe(Layer.provide(StubStore)))),
  )
})

const SyncLayer = Sync.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(SyncStoreMemory, Repositories.layerMemoryNoDeps)),
  Layer.provideMerge(MemoryStore.layer),
)

describe("Sync on the memory store (Node fake of @tanren/db's SyncStore)", () => {
  it.effect("pages pull with hasMore and a cursor round trip; REST writes appear", () =>
    Effect.gen(function* () {
      // Aliased: a `.push(` member call trips the noMutation plugin.
      const sync = yield* Sync
      const push = sync.push
      const repo = yield* ExerciseRepo
      yield* repo.put(userA, [exercise(1), exercise(2)]) // a REST write
      yield* push(userA, { changes: [ex(exercise(3))] })
      const first = yield* sync.pull(userA, { since: Option.none(), limit: 2 })
      expect(first.changes).toHaveLength(2)
      expect(first.hasMore).toBe(true)
      const second = yield* sync.pull(userA, { since: Option.some(first.cursor), limit: 2 })
      expect(second.changes.map((c) => c.row.id)).toEqual([exercise(3).id])
      expect(second.hasMore).toBe(false)
      const empty = yield* sync.pull(userA, { since: Option.some(second.cursor), limit: 2 })
      expect(empty.changes).toEqual([])
      expect(empty.cursor).toBe(second.cursor)
      const other = yield* sync.pull(userB, { since: Option.none(), limit: 10 })
      expect(other.changes).toEqual([])
    }).pipe(Effect.provide(SyncLayer)),
  )

  it.effect("accepts own rows and rejects a foreign userId as forbidden", () =>
    Effect.gen(function* () {
      const { push } = yield* Sync
      const response = yield* push(userA, {
        changes: [ex(exercise(1)), ex(exercise(2, { userId: userB }))],
      })
      expect(response.accepted.map((a) => a.id)).toEqual([exercise(1).id])
      expect(response.rejected.map((r) => [r.id, r.reason])).toEqual([
        [exercise(2).id, "forbidden"],
      ])
    }).pipe(Effect.provide(SyncLayer)),
  )

  it.effect("rejects a bad cursor with ValidationError", () =>
    Effect.gen(function* () {
      const sync = yield* Sync
      const error = yield* Effect.flip(
        sync.pull(userA, { since: Option.some(SyncCursor.make("nope")), limit: 2 }),
      )
      expect(error._tag).toBe("ValidationError")
    }).pipe(Effect.provide(SyncLayer)),
  )

  it.effect("round-trips a cursor whose id is uppercase hex", () =>
    Effect.gen(function* () {
      const position = { seq: 7, rank: 1, id: "0000000A-0000-4000-8000-0000000000AB" }
      expect(yield* decodeCursor(encodeCursor(position))).toEqual(position)
    }),
  )
})
