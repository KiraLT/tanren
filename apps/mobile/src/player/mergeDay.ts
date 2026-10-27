import { type CatalogId, expandDay, type ProgramDay } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import type { PlayerState } from "./playerMachine"

/**
 * The exercise of every step-round (one per set, `expandDay`), round-major: the order of
 * `plannedItems` and `performedItems`.
 */
export type RunPlan = ReadonlyArray<CatalogId>

/** Every round runs the day's steps as written. */
export const initialPlan = (day: ProgramDay): RunPlan => {
  const steps = expandDay(day)
  return Arr.flatMap(Arr.range(1, day.rounds), () => Arr.map(steps, (s) => s.item.catalogId))
}

/**
 * The first item-round a swap made now applies to, as an index into the plan: the running item
 * (a swap while it runs renames it) and everything after; while resting, the item just done stays
 * as it was. `None` once the run is done.
 */
const firstOpenRound = (day: ProgramDay, state: PlayerState): Option.Option<number> => {
  const perRound = expandDay(day).length
  const at = (round: number, stepIndex: number, rest: boolean) =>
    Option.some(round * perRound + stepIndex + (rest ? 1 : 0))
  return Match.value(state).pipe(
    Match.tag("Idle", () => Option.some(0)),
    Match.tag("Done", () => Option.none<number>()),
    Match.tag("Working", (s) => at(s.round, s.stepIndex, false)),
    Match.tag("Resting", (s) => at(s.round, s.stepIndex, true)),
    Match.tag("Paused", (s) => at(s.inner.round, s.inner.stepIndex, s.inner._tag === "Resting")),
    Match.exhaustive,
  )
}

/**
 * Folds a swap boundary into the plan: from the first open item-round on, each item whose name
 * differs between `previous` and `next` runs as `next` says (a revert is just another change);
 * item-rounds before that stay what was performed.
 */
export const reconcilePlan = (
  plan: RunPlan,
  previous: ProgramDay,
  next: ProgramDay,
  state: PlayerState,
): RunPlan =>
  Option.match(firstOpenRound(previous, state), {
    onNone: () => plan,
    onSome: (open) => {
      const steps = expandDay(previous)
      return Arr.map(plan, (id, index) => {
        const item = Option.match(Arr.get(steps, index % Math.max(1, steps.length)), {
          onNone: () => -1,
          onSome: (s) => s.exerciseIndex,
        })
        const before = Arr.get(previous.items, item)
        const after = Arr.get(next.items, item)
        return index >= open &&
          Option.isSome(before) &&
          Option.isSome(after) &&
          before.value.catalogId !== after.value.catalogId
          ? after.value.catalogId
          : id
      })
    },
  })

/**
 * Folds a re-read day (swaps applied after the player opened) into the running one. Only an item's
 * `catalogId` is taken from `reread`, matched by position and `kind`; durations, counts, rests and
 * rounds stay the running day's, so the running phase keeps its deadline and the player machine
 * (indices into `items`) needs no restart. When no name changed, `running` itself comes back, so a
 * memoised reducer config does not change.
 */
export const mergeDay = (running: ProgramDay, reread: ProgramDay): ProgramDay => {
  const items = Arr.map(running.items, (item, index) =>
    Option.match(Arr.get(reread.items, index), {
      onNone: () => item,
      onSome: (next) =>
        next.kind === item.kind && next.catalogId !== item.catalogId
          ? { ...item, catalogId: next.catalogId }
          : item,
    }),
  )
  return Arr.every(items, (item, index) => item === running.items[index])
    ? running
    : { ...running, items }
}
