import { describe, expect, it } from "@effect/vitest"
import { LocalDate, SyncChange } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser } from "./CurrentUser"
import { FeedRepo } from "./FeedRepo"
import { LocalStore } from "./LocalStore"
import { NutritionRepo } from "./NutritionRepo"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"
import { WeekReviewRepo } from "./WeekReviewRepo"

/** Europe/Vilnius: the week of Mon 19 Oct runs 18 Oct 21:00Z to 25 Oct 22:00Z (DST ended 25 Oct). */
const TestLayer = WeekReviewRepo.layer.pipe(
  Layer.provide(Layer.mergeAll(NutritionRepo.layer, FeedRepo.layer)),
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const STAMP = "2026-10-26T06:00:00.000Z"
const row = (n: number, deletedAt: string | null = null) => ({
  id: uid(n),
  userId: LOCAL_USER_ID,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt,
})

/** A session with one live 100 kg × 5 set (500 kg volume). */
const sessionWithSet = (
  n: number,
  startedAt: string,
  finishedAt: string | null,
  deletedAt: string | null = null,
) => [
  {
    table: "session",
    row: { ...row(n, deletedAt), startedAt, finishedAt, plannedSessionId: null, notes: null },
  },
  {
    table: "set",
    row: {
      ...row(n + 100),
      sessionId: uid(n),
      exerciseId: uid(99),
      order: 0,
      weightKg: 100,
      reps: 5,
      rpe: null,
      note: null,
      plannedSetId: null,
      loggedAt: startedAt,
    },
  },
]

const completion = (n: number, completedAt: string, deletedAt: string | null = null) => ({
  table: "programDayCompletion",
  row: {
    ...row(n, deletedAt),
    enrollmentId: uid(90),
    dayNumber: n,
    completedAt,
    durationSeconds: 600,
    sessionId: null,
  },
})

const fixture = [
  ...sessionWithSet(1, "2026-10-25T21:30:00.000Z", "2026-10-25T22:30:00.000Z"), // Sun 23:30: in
  ...sessionWithSet(2, "2026-10-25T22:30:00.000Z", "2026-10-25T23:30:00.000Z"), // Mon 00:30: out
  ...sessionWithSet(3, "2026-10-21T08:00:00.000Z", "2026-10-21T09:00:00.000Z", STAMP), // deleted
  ...sessionWithSet(4, "2026-10-22T08:00:00.000Z", null), // unfinished
  // Finished with no sets (only the session row): counted as done, adds no volume.
  ...sessionWithSet(7, "2026-10-23T08:00:00.000Z", "2026-10-23T09:00:00.000Z").slice(0, 1),
  completion(5, "2026-10-22T09:00:00.000Z"),
  completion(6, "2026-10-23T09:00:00.000Z", STAMP), // deleted
]

const seed = Schema.decodeUnknownEffect(Schema.Array(SyncChange))(fixture).pipe(
  Effect.orDie,
  Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
)

describe("WeekReviewRepo.week", () => {
  it.effect("counts finished live sessions started in the local week and live program days", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 12))
      yield* seed
      const summary = yield* WeekReviewRepo.use((repo) => repo.week(LocalDate.make("2026-10-19")))
      expect([
        summary.training.done,
        summary.training.volumeKg,
        summary.training.programDays,
      ]).toEqual([2, 500, 1])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("puts the Monday 00:30 session in the next week", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 27, 12))
      yield* seed
      const summary = yield* WeekReviewRepo.use((repo) => repo.week(LocalDate.make("2026-10-26")))
      expect([summary.training.done, summary.training.programDays]).toEqual([1, 0])
    }).pipe(Effect.provide(TestLayer)),
  )
})
