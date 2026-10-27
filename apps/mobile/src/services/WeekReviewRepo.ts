import { type LocalDate, SessionId } from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Schema } from "effect"
import { type ReviewSummary, reviewSummary } from "../components/review/reviewMath"
import { FeedRepo } from "./FeedRepo"
import { decodeRecords, LocalStore } from "./LocalStore"
import { countOf, NutritionRepo, rangeOf } from "./NutritionRepo"
import type { StoreError } from "./SqlDriver"

export interface WeekReviewRepoShape {
  /** The Mon–Sun week from `weekStart` (a Monday) in the device zone (`/review`, ADR-0029). */
  readonly week: (
    weekStart: LocalDate,
  ) => Effect.Effect<ReviewSummary, StoreError, DateTime.CurrentTimeZone>
}

/**
 * The MCP rule (`get_week_review`): live sessions started in the week with `finishedAt` set.
 * Every one counts as done; `FeedRepo.activity` drops a session without a live set, which then adds
 * no volume or PRs.
 */
const SESSIONS = `SELECT "id" FROM "workout_session" WHERE "deletedAt" IS NULL
  AND "finishedAt" IS NOT NULL AND "startedAt" >= ? AND "startedAt" < ? ORDER BY "startedAt"`
const PROGRAM_DAYS = `SELECT COUNT(*) AS "n" FROM "program_day_completion" WHERE "deletedAt" IS NULL
  AND "completedAt" >= ? AND "completedAt" < ?`

const IdRow = Schema.Struct({ id: SessionId })

export class WeekReviewRepo extends Context.Service<WeekReviewRepo, WeekReviewRepoShape>()(
  "@tanren/WeekReviewRepo",
) {
  /** Needs `LocalStore`, `NutritionRepo` and `FeedRepo`: the nutrition week + 2 SELECTs + 1 feed read per session. */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const nutrition = yield* NutritionRepo
      const feed = yield* FeedRepo

      const week = (weekStart: LocalDate) =>
        Effect.gen(function* () {
          const zone = yield* DateTime.CurrentTimeZone
          const { review } = yield* nutrition.week(weekStart)
          const { from, to } = rangeOf(weekStart, 7, zone)
          const params = [DateTime.formatIso(from), DateTime.formatIso(to)]
          const ids = yield* store
            .all({ sql: SESSIONS, params })
            .pipe(Effect.flatMap(decodeRecords(IdRow)))
          const sessions = yield* Effect.forEach(ids, (row) => feed.activity(row.id))
          const programDays = yield* countOf(store, PROGRAM_DAYS, params)
          return reviewSummary({
            review,
            sessionsDone: ids.length,
            sessions: Arr.getSomes(sessions),
            programDays,
          })
        })

      return WeekReviewRepo.of({ week })
    }),
  )
}
