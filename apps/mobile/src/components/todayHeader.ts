import { CATALOG, type CatalogExercise, type CatalogId, type Exercise } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { programProgress } from "../player/programDays"
import type { ProgramsState } from "../player/usePrograms"
import { formatKg } from "./stepMath"

/** The AppBar eyebrow on Today: "Core 30 · Day 2 of 30" plus the ring's done share. */
export interface TodayEyebrow {
  readonly label: string
  readonly progress: number
}

/**
 * The first (newest) `active` enrollment that still has a day to do (`paused` ones are hidden from
 * Today); the ring is `programProgress`.
 */
export const todayEyebrowOf = (state: ProgramsState): Option.Option<TodayEyebrow> =>
  state._tag === "Ready"
    ? Arr.findFirst(state.active, ({ enrollment, program, day }) =>
        enrollment.status === "active"
          ? Option.map(day, (today) => {
              const total = program.days.length
              return {
                label: `${program.name} · Day ${today.dayNumber} of ${total}`,
                progress: programProgress(today.dayNumber, total),
              }
            })
          : Option.none(),
      )
    : Option.none()

const sameName = (name: string) => (entry: CatalogExercise) => {
  const wanted = name.trim().toLowerCase()
  return (
    entry.name.toLowerCase() === wanted ||
    entry.aliases.some((alias) => alias.toLowerCase() === wanted)
  )
}

/**
 * The catalog entry whose illustration Today shows: the exercise's own link, else an exact
 * (case-insensitive) name or alias match, so unlinked demo exercises still get their figure.
 */
export const illustrationIdFor = (
  exercise: Pick<Exercise, "name" | "catalogId">,
  entries: ReadonlyArray<CatalogExercise> = CATALOG,
): Option.Option<CatalogId> =>
  Option.orElse(exercise.catalogId, () =>
    Option.map(Arr.findFirst(entries, sameName(exercise.name)), (entry) => entry.catalogId),
  )

/** "Last set 100 kg × 5" after a logged set, else the prefilled target. */
export const lastSetText = (
  loggedSets: ReadonlyArray<{ readonly weightKg: number; readonly reps: number }>,
  prefill: { readonly weightKg: number; readonly reps: number },
): string =>
  Option.match(Arr.last(loggedSets), {
    onNone: () => `Target ${formatKg(prefill.weightKg)} kg × ${prefill.reps}`,
    onSome: (set) => `Last set ${formatKg(set.weightKg)} kg × ${set.reps}`,
  })
