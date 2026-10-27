import {
  type CatalogId,
  expandDay,
  findCatalogExercise,
  isLoaded,
  type ProgramDay,
  type ProgramItem,
  setsOf,
} from "@tanren/shared"
import { Array as Arr, Match, Option, String as Str } from "effect"
import type { SetEntry } from "../services/ProgramRepo"
import type { RunPlan } from "./mergeDay"
import {
  currentItem,
  idle,
  nextAfterWork,
  type PlayerConfig,
  type PlayerEvent,
  type PlayerState,
  phaseKey,
  playerEvent,
  restAfter,
  step,
} from "./playerMachine"

/**
 * Pure parts of `usePlayer` (v2-programs.md §4): what the hook keeps between renders, which cue
 * a phase change fires, and which phase-end alert to (re)schedule. No React, no Effect.
 */

/** The reducer state of `usePlayer`: the machine plus what the cues compare against. */
export interface PlayerRun {
  readonly player: PlayerState
  /** The state before the last event (cue selection compares the two). */
  readonly previous: PlayerState
  /** `nowMs` of the last event; the screen renders the countdown against it. */
  readonly nowMs: number
  /** `nowMs` of the event before; the 3-2-1 cue fires when a second boundary is crossed. */
  readonly previousNowMs: number
  /** Set by `start`; `Done` does not carry it and `ProgramRepo.complete` needs it. */
  readonly startedAtMs: Option.Option<number>
  /**
   * Item-rounds (round-major) whose work phase was completed, for `ProgramRepo.complete`. Frozen
   * once `Done`: `finish` counts from the state the user saw, a natural end counts every one.
   */
  readonly performedItems: number
  /** One per performed item-round, in `performedItems` order; `None` for timed / bodyweight. */
  readonly entries: ReadonlyArray<Option.Option<SetEntry>>
  /** The steppers' current value for the item being worked; `None` unless weighted. */
  readonly draft: Option.Option<SetEntry>
}

/**
 * `reduceRun`'s config: the machine's plus the loads to prefill (programs-player-v2 §2.3): per
 * loaded catalog id, the exercise's last logged set (`ProgramRepo.prefill`). The machine's own
 * `PlayerConfig` stays time-only (`playerMachine.ts` is untouched).
 */
export interface RunConfig extends PlayerConfig {
  readonly prefill: ReadonlyMap<CatalogId, SetEntry>
  /**
   * The exercise each item-round runs (`usePlayer`'s plan, `reconcilePlan`): a mid-run swap renames
   * only open rounds, so the exercise of round `i` is `ids[i]`, never `day.items[...]`.
   */
  readonly ids: RunPlan
}

/**
 * The machine's events plus `adjust`, which only replaces `draft` (the steppers), and `replan`
 * (the plan changed by a swap; `previousIds` is the plan before it): when the round being worked
 * now runs another exercise, its draft restarts from that exercise's prefill (`None` unweighted).
 */
export type RunEvent =
  | PlayerEvent
  | { readonly _tag: "adjust"; readonly weightKg: number; readonly reps: number }
  | { readonly _tag: "replan"; readonly previousIds: RunPlan }

export const initialRun = (nowMs: number): PlayerRun => ({
  player: idle,
  previous: idle,
  nowMs,
  previousNowMs: nowMs,
  startedAtMs: Option.none(),
  performedItems: 0,
  entries: [],
  draft: Option.none(),
})

/** A reps item of an exercise that moves a load: the player shows kg × reps steppers. */
export const isWeighted = (item: ProgramItem): boolean =>
  item.kind === "reps" && isLoaded(item.catalogId)

/** Steps per round (`expandDay`): one per set of every item. */
const stepsPerRound = (day: ProgramDay): number => expandDay(day).length

/**
 * The day's item of step-round `index` (round-major over `expandDay` steps, one per performed set;
 * "item-round" below means this): its kind, target and rest.
 */
const itemAt = (day: ProgramDay, index: number): Option.Option<ProgramItem> => {
  const steps = expandDay(day)
  return steps.length === 0
    ? Option.none()
    : Option.map(Arr.get(steps, index % steps.length), (s) => s.item)
}

/** The exercise item-round `index` runs: the plan's id, else the day's item (plan not loaded). */
const roundId = (config: RunConfig, index: number): Option.Option<CatalogId> =>
  Option.orElse(Arr.get(config.ids, index), () =>
    Option.map(itemAt(config.day, index), (item) => item.catalogId),
  )

/** The rep target of item-round `index` when it is weighted (reps item, loaded exercise). */
const weightedTarget = (config: RunConfig, index: number): Option.Option<number> =>
  Option.flatMap(itemAt(config.day, index), (item) =>
    item.kind === "reps" && Option.exists(roundId(config, index), isLoaded)
      ? Option.some(item.reps)
      : Option.none(),
  )

/**
 * The steppers' start value for item-round `index` (§2.3), `None` unless weighted: the same
 * exercise's entry in an earlier round of this run (by the plan's ids), else its last logged load
 * with the item's rep target, else 0 kg × the target.
 */
export const prefillFor = (
  config: RunConfig,
  entries: ReadonlyArray<Option.Option<SetEntry>>,
  index: number,
): Option.Option<SetEntry> =>
  Option.flatMap(weightedTarget(config, index), (target): Option.Option<SetEntry> => {
    const id = roundId(config, index)
    const earlier = Arr.findLast(
      Arr.take(entries, index).map((entry, at) => ({ entry, at })),
      ({ entry, at }) =>
        Option.isSome(entry) &&
        Option.isSome(id) &&
        Option.exists(roundId(config, at), (other) => other === id.value),
    )
    const last = Option.flatMap(id, (catalogId) =>
      Option.fromNullishOr(config.prefill.get(catalogId)),
    )
    return Option.some(
      Option.getOrElse(
        Option.flatMap(earlier, ({ entry }) => entry),
        () => ({
          weightKg: Option.match(last, { onNone: () => 0, onSome: (set) => set.weightKg }),
          reps: target,
        }),
      ),
    )
  })

/** Round-major index of the item being worked (a Paused Working counts), else None. */
const workingIndex = (day: ProgramDay, state: PlayerState): Option.Option<number> => {
  const phase = state._tag === "Paused" ? state.inner : state
  return phase._tag === "Working"
    ? Option.some(phase.round * stepsPerRound(day) + phase.stepIndex)
    : Option.none()
}

/**
 * Completed item-rounds before `state`: a Working item does not count yet, a Resting state counts
 * the item just done; Paused counts its inner phase. Done is handled by `reduceRun`.
 */
export const performedBefore = (day: ProgramDay, state: PlayerState): number => {
  const phase = state._tag === "Paused" ? state.inner : state
  const perRound = stepsPerRound(day)
  return Match.value(phase).pipe(
    Match.tag("Working", (s) => s.round * perRound + s.stepIndex),
    Match.tag("Resting", (s) => s.round * perRound + s.stepIndex + 1),
    Match.orElse(() => 0),
  )
}

const performedAfter = (
  config: PlayerConfig,
  run: PlayerRun,
  event: PlayerEvent,
  next: PlayerState,
) => {
  if (next._tag !== "Done") {
    return performedBefore(config.day, next)
  }
  if (run.player._tag === "Done") {
    return run.performedItems
  }
  // `finish` stops early; reaching Done by the last deadline or `next` completed every item.
  return event._tag === "finish"
    ? performedBefore(config.day, run.player)
    : config.day.rounds * stepsPerRound(config.day)
}

/**
 * `entries` resized to `performed`: rounds just finished append the draft (for the round that was
 * being worked) or their prefill; `previous` drops the rounds it undid. So `entries.length ===
 * performedItems` always.
 */
const entriesAfter = (
  config: RunConfig,
  run: PlayerRun,
  performed: number,
): ReadonlyArray<Option.Option<SetEntry>> => {
  if (performed <= run.entries.length) {
    return Arr.take(run.entries, performed)
  }
  const worked = workingIndex(config.day, run.player)
  return Arr.reduce(
    Arr.range(run.entries.length, performed - 1),
    run.entries,
    (entries, index): ReadonlyArray<Option.Option<SetEntry>> => [
      ...entries,
      Option.isSome(worked) &&
      worked.value === index &&
      Option.isSome(run.draft) &&
      Option.isSome(weightedTarget(config, index))
        ? run.draft
        : prefillFor(config, entries, index),
    ],
  )
}

/**
 * The draft after a machine step: kept while the same item-round is worked (ticks, pause, a
 * restart), else the new item-round's value: the entry `previous` just dropped for it, or its
 * prefill. `None` off a work phase.
 */
const draftAfter = (
  config: RunConfig,
  run: PlayerRun,
  player: PlayerState,
  entries: ReadonlyArray<Option.Option<SetEntry>>,
): Option.Option<SetEntry> =>
  Option.flatMap(workingIndex(config.day, player), (index) => {
    const same = Option.exists(workingIndex(config.day, run.player), (was) => was === index)
    if (same) {
      return run.draft
    }
    return Option.flatMap(
      weightedTarget(config, index),
      (): Option.Option<SetEntry> =>
        Option.orElse(Option.flatten(Arr.get(run.entries, index)), () =>
          prefillFor(config, entries, index),
        ),
    )
  })

/** `replan`: a round being worked that now runs another exercise restarts its draft. */
const replanned = (config: RunConfig, run: PlayerRun, previousIds: RunPlan): PlayerRun =>
  Option.match(workingIndex(config.day, run.player), {
    onNone: () => run,
    onSome: (index) => {
      const before = Option.orElse(Arr.get(previousIds, index), () => roundId(config, index))
      const changed = !(
        Option.isSome(before) && Option.exists(roundId(config, index), (id) => id === before.value)
      )
      return changed ? { ...run, draft: prefillFor(config, run.entries, index) } : run
    },
  })

/** `step` plus bookkeeping; the `useReducer` reducer. */
export const reduceRun =
  (config: RunConfig) =>
  (run: PlayerRun, event: RunEvent): PlayerRun => {
    if (event._tag === "adjust") {
      return { ...run, draft: Option.some({ weightKg: event.weightKg, reps: event.reps }) }
    }
    if (event._tag === "replan") {
      return replanned(config, run, event.previousIds)
    }
    const player = step(config)(run.player, event)
    const performedItems = performedAfter(config, run, event, player)
    const entries = entriesAfter(config, run, performedItems)
    return {
      player,
      previous: run.player,
      nowMs: event.nowMs,
      previousNowMs: run.nowMs,
      startedAtMs:
        run.player._tag === "Idle" && player._tag !== "Idle"
          ? Option.some(event.nowMs)
          : run.startedAtMs,
      performedItems,
      entries,
      draft: draftAfter(config, run, player, entries),
    }
  }

/** `EXPO_PUBLIC_PLAYER_SPEED`: a number ≥ 1, else 1. */
export const parseSpeed = (raw: string | undefined): number =>
  Option.fromNullishOr(raw).pipe(
    Option.map(Number),
    Option.filter((speed) => Number.isFinite(speed) && speed >= 1),
    Option.getOrElse(() => 1),
  )

/** Catalog name, or the title-cased id while the catalog lacks the entry ("dead-bug" → "Dead Bug"). */
export const exerciseName = (id: CatalogId): string =>
  findCatalogExercise(id).pipe(
    Option.map((exercise) => exercise.name),
    Option.getOrElse(() =>
      Arr.join(
        Arr.map(Str.split(id, "-"), (word) => Str.capitalize(word)),
        " ",
      ),
    ),
  )

/** "40 s" for a timed item, "12 reps" for a reps item (planned values, not scaled by speed). */
export const itemAmount = (item: ProgramItem): string =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: ({ seconds }) => `${seconds} s`,
      reps: ({ reps }) => `${reps} reps`,
    }),
  )

/** "4 × 10 reps" for a reps item with sets (programs-player-v2 §7.3), else `itemAmount`. */
export const prescription = (item: ProgramItem): string => {
  const sets = setsOf(item)
  return sets > 1 ? `${sets} × ${itemAmount(item)}` : itemAmount(item)
}

/** `Some(count)` for a reps item, `None` for a timed one (ADR-0020: the work screen shows a numeral). */
export const repsOf = (item: ProgramItem): Option.Option<number> =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: () => Option.none<number>(),
      reps: ({ reps }) => Option.some<number>(reps),
    }),
  )

/**
 * The work screen's preview line under the transport row: "Next · Crunch 25 s". `None` when no
 * exercise follows (last item of the last round) or the player is not on a work phase.
 */
export const nextCaption = (day: ProgramDay, state: PlayerState): Option.Option<string> =>
  Option.map(
    nextAfterWork(day, state),
    (item) => `Next · ${exerciseName(item.catalogId)} ${itemAmount(item)}`,
  )

/** What a phase change sounds/feels like. */
export type Cue =
  /** Work ended, rest begins: success haptic + beep. */
  | "rest"
  /** A new work phase (after rest or `next`): beep. */
  | "work"
  /** The run ended: success haptic + beep. */
  | "done"
  | "none"

/** Picks the cue from the `_tag`s around a `phaseKey` change; pause/resume/restart are silent. */
export const cueFor = (previous: PlayerState, next: PlayerState): Cue => {
  if (phaseKey(previous) === phaseKey(next) || next._tag === "Paused") {
    return "none"
  }
  const resumed =
    previous._tag === "Paused" &&
    (next._tag === "Working" || next._tag === "Resting") &&
    previous.inner._tag === next._tag &&
    previous.inner.round === next.round &&
    previous.inner.stepIndex === next.stepIndex
  // Resume continues the same phase (its start shifted by the pause): silent.
  return resumed ? "none" : tagCue(next)
}

const tagCue = (next: PlayerState): Cue =>
  Match.valueTags(next, {
    Idle: (): Cue => "none",
    Paused: (): Cue => "none",
    Working: (): Cue => "work",
    Resting: (): Cue => "rest",
    Done: (): Cue => "done",
  })

/**
 * 3-2-1 before work (v2-programs.md §4): the whole second (3, 2 or 1) left in a rest that this
 * tick crossed into, comparing the remaining time at the previous and the current tick of the
 * same rest. Work phases end silently here (the rest cue marks them).
 */
export const countdownCue = (run: PlayerRun): Option.Option<number> => {
  const { player, previous } = run
  if (player._tag !== "Resting" || phaseKey(player) !== phaseKey(previous)) {
    return Option.none()
  }
  const before = Math.ceil((player.endsAtMs - run.previousNowMs) / 1000)
  const now = Math.ceil((player.endsAtMs - run.nowMs) / 1000)
  return now < before && now >= 1 && now <= 3 ? Option.some(now) : Option.none()
}

/** One phase-end notification: when, and what it says. */
export interface PhaseAlert {
  readonly atMs: number
  readonly text: string
}

const deadlineOf = (state: PlayerState): Option.Option<number> =>
  Match.valueTags(state, {
    Idle: () => Option.none<number>(),
    Paused: () => Option.none<number>(),
    Done: () => Option.none<number>(),
    Working: (s) => s.endsAtMs,
    Resting: (s) => Option.some(s.endsAtMs),
  })

/**
 * The alert for the running phase: at its deadline, describing what comes next (found by
 * stepping the machine to the deadline). `None` when paused, idle, done or on a reps item.
 * "Rest over — Plank, 40 s" · "Dead Bug done — rest 15 s" · "Workout complete".
 */
export const alertFor = (config: PlayerConfig, state: PlayerState): Option.Option<PhaseAlert> =>
  Option.map(deadlineOf(state), (atMs) => {
    const following = step(config)(state, playerEvent("tick", atMs))
    const name = (s: PlayerState) =>
      currentItem(config.day, s).pipe(
        Option.map((item) => exerciseName(item.catalogId)),
        Option.getOrElse(() => "Exercise"),
      )
    const text = Match.valueTags(following, {
      Idle: () => "Workout complete",
      Paused: () => "Workout complete",
      Done: () => "Workout complete",
      Resting: (s) => `${name(state)} done — rest ${restAfter(config.day, s.stepIndex)} s`,
      Working: (s) => {
        const amount = currentItem(config.day, s).pipe(
          Option.map(itemAmount),
          Option.getOrElse(() => ""),
        )
        const lead = state._tag === "Resting" ? "Rest over" : "Next"
        return `${lead} — ${name(s)}, ${amount}`
      },
    })
    return { atMs, text }
  })

/** Whether the countdown is live (interval, keep-awake). */
export const isRunning = (state: PlayerState): boolean =>
  state._tag === "Working" || state._tag === "Resting"

/** "15:20" for a duration in seconds. */
export const clock = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}
