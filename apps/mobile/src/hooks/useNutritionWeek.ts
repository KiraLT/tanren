import type { LocalDate } from "@tanren/shared"
import { type HealthWeek, NutritionRepo } from "../services/NutritionRepo"
import { type HistoryState, type StoreRead, useStoreRead } from "./useHistory"

export type { HealthWeek } from "../services/NutritionRepo"

/** Module-level reader: stable identity, so it can sit in the effect's dependencies. */
const readWeek: StoreRead<LocalDate, HealthWeek> = (weekStart) =>
  NutritionRepo.use((repo) => repo.week(weekStart))

/** The Mon–Sun week from `weekStart`: review + the week's imported activities; re-reads on writes. */
export const useNutritionWeek = (weekStart: LocalDate): HistoryState<HealthWeek> =>
  useStoreRead(readWeek, weekStart).state
