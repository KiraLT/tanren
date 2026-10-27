import type { LocalDate } from "@tanren/shared"
import { type NutritionDay, NutritionRepo } from "../services/NutritionRepo"
import { type HistoryState, type StoreRead, useStoreRead } from "./useHistory"

export type { HealthWeek, NutritionDay } from "../services/NutritionRepo"

/** Module-level reader: stable identity, so it can sit in the effect's dependencies. */
const readDay: StoreRead<LocalDate, NutritionDay> = (localDate) =>
  NutritionRepo.use((repo) => repo.day(localDate))

/** The local date's totals + ≤ 3 insights (nutrition.md §3, §5); re-reads after every store write. */
export const useNutritionDay = (localDate: LocalDate): HistoryState<NutritionDay> =>
  useStoreRead(readDay, localDate).state
