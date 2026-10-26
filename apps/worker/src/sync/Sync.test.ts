import { describe, expect, it } from "@effect/vitest"
import { decodeCursor, encodeCursor } from "@tanren/db"
import { type PushResponse, Session, type SyncChange, SyncCursor } from "@tanren/shared"
import { DateTime, Effect, Fiber, Layer, Option, Ref } from "effect"
import { TestClock } from "effect/testing"
import { ExportQueue } from "../integrations/ExportQueue"
import { ExerciseRepo, MemoryStore, Repositories } from "../repos"
import { at, ex, exercise, session, T0, userA, userB } from "./fixtures"
import { ENQUEUE_BUDGET, EXPORT_BUDGET, Sync } from "./Sync"
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
const StubLayers = Layer.mergeAll(StubStore, ExportQueue.layerDisabled)

describe("Sync service", () => {
  it.effect("returns the store's PushResponse unchanged", () =>
    Effect.gen(function* () {
      // Aliased: a `.push(` member call trips the noMutation plugin.
      const { push } = yield* Sync
      expect(yield* push(userA, { changes: [ex(exercise(1))] })).toEqual(stored)
    }).pipe(Effect.provide(Sync.layer.pipe(Layer.provide(StubLayers)))),
  )

  it.effect("stamps a pull page with the server time", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 20, 12))
      const page = yield* (yield* Sync).pull(userA, { since: Option.none(), limit: 10 })
      expect(page).toMatchObject({ cursor, hasMore: true })
      expect(DateTime.formatIso(page.serverTime)).toBe("2026-10-20T12:00:00.000Z")
    }).pipe(Effect.provide(Sync.layer.pipe(Layer.provide(StubLayers)))),
  )
})

const SyncLayer = Sync.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(SyncStoreMemory, Repositories.layerMemoryNoDeps, ExportQueue.layerDisabled),
  ),
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

const finished = Session.make({
  ...session(0x51, T0),
  finishedAt: Option.some(at("2026-10-19T09:00:00.000Z")),
})
const sessionChange: SyncChange = { table: "session", row: finished }
const completedResponse: PushResponse = {
  accepted: [{ table: "session", id: finished.id, updatedAt: finished.updatedAt }],
  conflicts: [],
  rejected: [],
  serverTime: at("2026-10-20T12:00:00.000Z"),
}
const storeReturning = (response: PushResponse) =>
  Layer.succeed(
    SyncStore,
    SyncStore.of({
      getRows: () => Effect.succeed([]),
      apply: () => Effect.succeed(response),
      pull: () => Effect.succeed({ changes: [], cursor, hasMore: false }),
    }),
  )
type Call = readonly ["enqueue", number] | readonly ["drain", Option.Option<string>, number]
/** An `ExportQueue` that records its calls and runs `enqueue` / `drain` as given. */
const recordingQueue = (
  calls: Ref.Ref<ReadonlyArray<Call>>,
  drain: Effect.Effect<number>,
  enqueue: Effect.Effect<void>,
) =>
  Layer.succeed(
    ExportQueue,
    ExportQueue.of({
      enqueueCompleted: (_userId, changes) =>
        Ref.update(calls, (all) => [...all, ["enqueue", changes.length] as const]).pipe(
          Effect.andThen(enqueue),
        ),
      drain: ({ userId, max }) =>
        Ref.update(calls, (all) => [...all, ["drain", userId, max] as const]).pipe(
          Effect.andThen(drain),
        ),
    }),
  )
const pushWith = (
  response: PushResponse,
  changes: ReadonlyArray<SyncChange>,
  drain: Effect.Effect<number>,
  enqueue: Effect.Effect<void> = Effect.void,
) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<Call>>([])
    const { push } = yield* Effect.provide(
      Effect.gen(function* () {
        return yield* Sync
      }),
      Sync.layer.pipe(
        Layer.provide(
          Layer.mergeAll(storeReturning(response), recordingQueue(calls, drain, enqueue)),
        ),
      ),
    )
    const fiber = yield* Effect.forkChild(push(userA, { changes }))
    yield* TestClock.adjust(ENQUEUE_BUDGET)
    yield* TestClock.adjust(EXPORT_BUDGET)
    const result = yield* Fiber.join(fiber)
    return { result, calls: yield* Ref.get(calls) }
  })

describe("Sync.push exports completed sessions (design §6)", () => {
  it.effect("enqueues then drains one row of the user for an accepted finished session", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* pushWith(
        completedResponse,
        [sessionChange],
        Effect.succeed(1),
      )
      expect(result).toEqual(completedResponse)
      expect(calls).toEqual([
        ["enqueue", 1],
        ["drain", Option.some(userA), 1],
      ])
    }),
  )

  it.effect("calls no export at all when the push completes no session", () =>
    Effect.gen(function* () {
      const { calls } = yield* pushWith(stored, [ex(exercise(1))], Effect.succeed(0))
      expect(calls).toEqual([])
    }),
  )

  it.effect("returns the store's response when the drain outlives the 5 s budget", () =>
    Effect.gen(function* () {
      const { result } = yield* pushWith(completedResponse, [sessionChange], Effect.never)
      expect(result).toEqual(completedResponse)
    }),
  )

  it.effect("cuts a hung enqueue off at 2 s and still runs the drain", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* pushWith(
        completedResponse,
        [sessionChange],
        Effect.succeed(0),
        Effect.never,
      )
      expect(result).toEqual(completedResponse)
      expect(calls).toEqual([
        ["enqueue", 1],
        ["drain", Option.some(userA), 1],
      ])
    }),
  )

  it.effect("returns the store's response when the export dies", () =>
    Effect.gen(function* () {
      const { result } = yield* pushWith(
        completedResponse,
        [sessionChange],
        Effect.die("strava exploded"),
      )
      expect(result).toEqual(completedResponse)
    }),
  )
})
