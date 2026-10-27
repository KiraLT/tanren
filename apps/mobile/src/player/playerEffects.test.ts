import { describe, expect, it } from "@effect/vitest"
import {
  CatalogId,
  ProgramDayCompletion,
  ProgramDayCompletionId,
  ProgramEnrollmentId,
  UserId,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Ref } from "effect"
import { PhaseAlerts, PhaseAlertsLog } from "../services/PhaseAlerts"
import { type CompletionInput, ProgramRepo, type ProgramRepoShape } from "../services/ProgramRepo"
import { StoreError } from "../services/SqlDriver"
import { SyncEngine } from "../services/SyncEngine"
import { COMPLETION_FAILED, completeDay, loadPrefill, syncAlerts } from "./playerEffects"

describe("syncAlerts", () => {
  it.effect("cancels, then schedules the new alert", () =>
    Effect.gen(function* () {
      yield* syncAlerts(Option.some({ atMs: 41_000, text: "Rest over — Plank, 40 s" }))
      yield* syncAlerts(Option.none())
      const calls = yield* PhaseAlertsLog.use((log) => log.calls)
      expect(calls.map((call) => call._tag)).toEqual(["CancelAll", "Schedule", "CancelAll"])
      const scheduled = calls[1]
      expect(scheduled?._tag === "Schedule" && DateTime.formatIso(scheduled.at)).toBe(
        "1970-01-01T00:00:41.000Z",
      )
      expect(scheduled?._tag === "Schedule" && scheduled.text).toBe("Rest over — Plank, 40 s")
    }).pipe(Effect.provide(PhaseAlerts.layerTest)),
  )
})

const enrollmentId = ProgramEnrollmentId.make("00000000-0000-4000-8000-000000000001")
const finished = {
  enrollmentId,
  dayNumber: 3,
  startedAtMs: Date.UTC(2026, 9, 21, 7),
  durationSeconds: 912,
  performedItems: 9,
  performedIds: [],
  entries: [
    Option.some({ weightKg: 20, reps: 10 }),
    Option.none(),
    Option.some({ weightKg: 22.5, reps: 8 }),
  ],
}

const notUsed = Effect.die("not used in this test")

const repoLayer = (
  complete: (input: CompletionInput) => Effect.Effect<ProgramDayCompletion, StoreError>,
  lastLoads: ProgramRepoShape["lastLoads"] = () => notUsed,
) =>
  Layer.succeed(
    ProgramRepo,
    ProgramRepo.of({
      find: () => notUsed,
      list: () => notUsed,
      enrollments: notUsed,
      activeEnrollments: () => notUsed,
      dueToday: () => notUsed,
      enroll: () => notUsed,
      setStatus: () => notUsed,
      setSwap: () => notUsed,
      todayFor: () => notUsed,
      findRow: () => notUsed,
      save: () => notUsed,
      deleteProgram: () => notUsed,
      complete,
      lastLoads,
    }),
  )

const syncLayer = (requests: Ref.Ref<number>) =>
  Layer.succeed(
    SyncEngine,
    SyncEngine.of({
      syncOnce: notUsed,
      syncOnceExclusive: notUsed,
      rekeyLocalUser: () => notUsed,
      requestSync: Ref.update(requests, (n) => n + 1),
      background: () => notUsed,
    }),
  )

const completion = (input: CompletionInput) =>
  ProgramDayCompletion.make({
    id: ProgramDayCompletionId.make("00000000-0000-4000-8000-000000000002"),
    userId: UserId.make("00000000-0000-4000-8000-0000000000aa"),
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
    deletedAt: Option.none(),
    enrollmentId: input.enrollmentId,
    dayNumber: input.dayNumber,
    completedAt: input.startedAt,
    durationSeconds: input.durationSeconds,
    sessionId: Option.none(),
  })

describe("completeDay", () => {
  it.effect("completes with the start time, then requests a sync", () =>
    Effect.gen(function* () {
      const requests = yield* Ref.make(0)
      const seen = yield* Ref.make(Option.none<CompletionInput>())
      const result = yield* completeDay(finished).pipe(
        Effect.provide(
          Layer.merge(
            repoLayer((input) =>
              Ref.set(seen, Option.some(input)).pipe(Effect.as(completion(input))),
            ),
            syncLayer(requests),
          ),
        ),
      )
      // Volume = 20 × 10 + 22.5 × 8 (the None round adds nothing); sets = performedItems.
      expect(result).toEqual({ _tag: "Saved", durationSeconds: 912, volumeKg: 380, sets: 9 })
      expect(yield* Ref.get(requests)).toBe(1)
      const input = Option.getOrThrow(yield* Ref.get(seen))
      expect(DateTime.formatIso(input.startedAt)).toBe("2026-10-21T07:00:00.000Z")
      expect(input.dayNumber).toBe(3)
      expect(input.performedItems).toBe(9)
    }),
  )

  it.effect("a failing complete becomes Failed with a message and no sync request", () =>
    Effect.gen(function* () {
      const requests = yield* Ref.make(0)
      const result = yield* completeDay(finished).pipe(
        Effect.provide(
          Layer.merge(
            repoLayer(() => Effect.fail(new StoreError({ cause: "disk full" }))),
            syncLayer(requests),
          ),
        ),
      )
      expect(result).toEqual({ _tag: "Failed", durationSeconds: 912, message: COMPLETION_FAILED })
      expect(yield* Ref.get(requests)).toBe(0)
    }),
  )

  it.effect("retrying with the same input after a failure saves and syncs", () =>
    Effect.gen(function* () {
      const requests = yield* Ref.make(0)
      const calls = yield* Ref.make(0)
      const layer = Layer.merge(
        repoLayer((input) =>
          Ref.updateAndGet(calls, (n) => n + 1).pipe(
            Effect.flatMap((n) =>
              n === 1
                ? Effect.fail(new StoreError({ cause: "locked" }))
                : Effect.succeed(completion(input)),
            ),
          ),
        ),
        syncLayer(requests),
      )
      const first = yield* completeDay(finished).pipe(Effect.provide(layer))
      const retried = yield* completeDay(finished).pipe(Effect.provide(layer))
      expect(first._tag).toBe("Failed")
      expect(retried).toEqual({ _tag: "Saved", durationSeconds: 912, volumeKg: 380, sets: 9 })
      expect(yield* Ref.get(requests)).toBe(1)
    }),
  )
})

describe("loadPrefill", () => {
  const BENCH = CatalogId.make("barbell-bench-press")
  const prefillLayer = (lastLoads: ProgramRepoShape["lastLoads"]) =>
    repoLayer(() => notUsed, lastLoads)

  it.effect("maps the ids with a last load and skips the ones without", () =>
    Effect.gen(function* () {
      const map = yield* loadPrefill([BENCH, CatalogId.make("plank")]).pipe(
        Effect.provide(
          prefillLayer(() =>
            Effect.succeed([
              { catalogId: BENCH, last: Option.some({ weightKg: 60, reps: 5 }) },
              { catalogId: CatalogId.make("dumbbell-row"), last: Option.none() },
            ]),
          ),
        ),
      )
      expect([...map]).toEqual([[BENCH, { weightKg: 60, reps: 5 }]])
    }),
  )

  it.effect("a store error yields an empty map", () =>
    Effect.gen(function* () {
      const map = yield* loadPrefill([BENCH]).pipe(
        Effect.provide(prefillLayer(() => Effect.fail(new StoreError({ cause: "locked" })))),
      )
      expect(map.size).toBe(0)
    }),
  )
})
