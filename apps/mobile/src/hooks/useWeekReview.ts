import type { LocalDate } from "@tanren/shared"
import type { ReviewSummary } from "../components/review/reviewMath"
import { WeekReviewRepo } from "../services/WeekReviewRepo"
import { type HistoryState, type StoreRead, useStoreRead } from "./useHistory"

/** Module-level reader: stable identity, so it can sit in the effect's dependencies. */
const readWeek: StoreRead<LocalDate, ReviewSummary> = (weekStart) =>
  WeekReviewRepo.use((repo) => repo.week(weekStart))

/** The Mon–Sun review from `weekStart` (`/review`); re-reads on every store write. */
export const useWeekReview = (weekStart: LocalDate): HistoryState<ReviewSummary> =>
  useStoreRead(readWeek, weekStart).state
