import { Array as Arr, DateTime, Option, Order } from "effect"

/** The fields "better set" and PR detection read; `WorkoutSet` satisfies it. */
export interface ScoredSet {
  readonly weightKg: number
  readonly reps: number
  readonly loggedAt: DateTime.Utc
  readonly id: string
}

/**
 * Epley estimated one-rep max: `w * (1 + reps / 30)` for reps >= 2, the weight itself for one rep,
 * 0 for no reps or no weight. Unrounded: the UI rounds to 0.1 kg for display.
 */
export const epley1Rm = (weightKg: number, reps: number): number =>
  reps < 1 || weightKg <= 0 ? 0 : reps === 1 ? weightKg : weightKg * (1 + reps / 30)

/** Total order for "better set": e1RM, then reps, then weightKg. Bodyweight (0 kg): reps decide. */
export const SetScore: Order.Order<Pick<ScoredSet, "weightKg" | "reps">> = Order.combine(
  Order.mapInput(Order.Number, (set: Pick<ScoredSet, "weightKg" | "reps">) =>
    epley1Rm(set.weightKg, set.reps),
  ),
  Order.combine(
    Order.mapInput(Order.Number, (set: Pick<ScoredSet, "weightKg" | "reps">) => set.reps),
    Order.mapInput(Order.Number, (set: Pick<ScoredSet, "weightKg" | "reps">) => set.weightKg),
  ),
)

/** Chronological order of logged sets: `loggedAt`, then `id` (stable for equal timestamps). */
export const Chronological: Order.Order<Pick<ScoredSet, "loggedAt" | "id">> = Order.combine(
  Order.mapInput(DateTime.Order, (set: Pick<ScoredSet, "loggedAt" | "id">) => set.loggedAt),
  Order.mapInput(Order.String, (set: Pick<ScoredSet, "loggedAt" | "id">) => set.id),
)

/** The best set by `SetScore`; on a tie the earliest (first in the input) wins. */
export const bestSet = <S extends ScoredSet>(sets: ReadonlyArray<S>): Option.Option<S> =>
  Arr.reduce(sets, Option.none<S>(), (best, set) =>
    Option.match(best, {
      onNone: () => Option.some(set),
      onSome: (current) => (SetScore(set, current) > 0 ? Option.some(set) : best),
    }),
  )

/**
 * Set i is a PR iff some earlier set exists and its score beats every earlier set strictly. The
 * input must already be in `Chronological` order; the first set is never a PR (nothing to beat).
 */
export const markPrs = <S extends ScoredSet>(
  chronological: ReadonlyArray<S>,
): ReadonlyArray<S & { readonly isPr: boolean }> =>
  Arr.mapAccum(chronological, Option.none<S>(), (best, set) => {
    const isPr = Option.match(best, {
      onNone: () => false,
      onSome: (current) => SetScore(set, current) > 0,
    })
    const next = Option.match(best, {
      onNone: () => set,
      onSome: (current) => (isPr ? set : current),
    })
    return [Option.some(next), { ...set, isPr }] as const
  })[1]

/** A `YYYY-MM-DD` as UTC midnight, so day arithmetic never meets a DST shift. */
const utcMidnight = (date: string): DateTime.Utc =>
  // Callers pass `formatIsoDate` output, which always parses.
  DateTime.makeUnsafe(`${date}T00:00:00.000Z`)

/** Calendar arithmetic on a `YYYY-MM-DD` date (negative `days` go back). */
export const shiftDate = (date: string, days: number): string =>
  DateTime.formatIsoDate(DateTime.add(utcMidnight(date), { days }))

/**
 * Local ISO week start (Monday) of `at` in its own zone, as `YYYY-MM-DD`. Only history buckets
 * snap to Monday; plan weeks start on any weekday (ADR-0007 Q3).
 */
export const weekStartOf = (at: DateTime.Zoned): string => {
  const localDate = DateTime.formatIsoDate(at)
  // `weekDay` counts from Sunday = 0, so Monday is 0 days back and Sunday 6.
  const daysSinceMonday = (DateTime.getPartUtc(utcMidnight(localDate), "weekDay") + 6) % 7
  return shiftDate(localDate, -daysSinceMonday)
}
