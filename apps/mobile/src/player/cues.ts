import {
  type CatalogId,
  findCatalogExercise,
  type ProgramDay,
  type ProgramItem,
} from "@tanren/shared"
import { Array as Arr, Match, Option, String as Str } from "effect"
import {
  currentItem,
  idle,
  nextAfterWork,
  type PlayerConfig,
  type PlayerEvent,
  type PlayerState,
  phaseKey,
  playerEvent,
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
}

export const initialRun = (nowMs: number): PlayerRun => ({
  player: idle,
  previous: idle,
  nowMs,
  previousNowMs: nowMs,
  startedAtMs: Option.none(),
  performedItems: 0,
})

/**
 * Completed item-rounds before `state`: a Working item does not count yet, a Resting state counts
 * the item just done; Paused counts its inner phase. Done is handled by `reduceRun`.
 */
export const performedBefore = (day: ProgramDay, state: PlayerState): number => {
  const phase = state._tag === "Paused" ? state.inner : state
  return Match.value(phase).pipe(
    Match.tag("Working", (s) => s.round * day.items.length + s.itemIndex),
    Match.tag("Resting", (s) => s.round * day.items.length + s.itemIndex + 1),
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
    : config.day.rounds * config.day.items.length
}

/** `step` plus bookkeeping; the `useReducer` reducer. */
export const reduceRun =
  (config: PlayerConfig) =>
  (run: PlayerRun, event: PlayerEvent): PlayerRun => {
    const player = step(config)(run.player, event)
    return {
      player,
      previous: run.player,
      nowMs: event.nowMs,
      previousNowMs: run.nowMs,
      startedAtMs:
        run.player._tag === "Idle" && player._tag !== "Idle"
          ? Option.some(event.nowMs)
          : run.startedAtMs,
      performedItems: performedAfter(config, run, event, player),
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
    previous.inner.itemIndex === next.itemIndex
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
      Resting: (s) => `${name(state)} done — rest ${restSecondsOf(config.day, s)} s`,
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

const restSecondsOf = (day: ProgramDay, rest: Extract<PlayerState, { _tag: "Resting" }>): number =>
  rest.itemIndex >= day.items.length - 1
    ? day.restBetweenRoundsSeconds
    : Option.match(Arr.get(day.items, rest.itemIndex), {
        onNone: () => 0,
        onSome: (item) => item.restSeconds,
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
