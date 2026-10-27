import { expandDay, type ProgramDay, type ProgramItem, type Step } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"

/**
 * Pure workout player (v2-programs.md §4, programs-player-v2 §7.3). No timers, no `Date`: the
 * screen feeds `nowMs` with every event (a `tick` every 250 ms and on `AppState` → active).
 * Remaining time is always `endsAtMs − nowMs`, so a backgrounded app catches up on the next `tick`.
 *
 * A round is the day's `expandDay` steps: every item's straight sets in order. Rounds and step
 * indices are 0-based in the state; `progress` turns them 1-based for display.
 *
 * Duration: `Done.durationSeconds` is wall-clock time from `start` to the end, **excluding
 * pauses** (`pausedMs` accumulates on every resume). It is real elapsed time, so at `speed: 10`
 * it is a tenth of the planned length. When the last phase ends by `tick`, the end is that
 * phase's deadline, not `nowMs` (a run finished in the background is not stretched).
 */

/** Shared by every running phase. */
interface RunClock {
  /** `nowMs` of the `start` event. */
  readonly startedAtMs: number
  /** Total time spent paused so far. */
  readonly pausedMs: number
  /** When this phase began (a deadline when entered by catch-up); shifted by a pause. */
  readonly phaseStartMs: number
}

export interface Idle {
  readonly _tag: "Idle"
}

export interface Working extends RunClock {
  readonly _tag: "Working"
  readonly round: number
  /** Index into the round's `expandDay` steps. */
  readonly stepIndex: number
  /** `None` for a `reps` item: no countdown, only `next` advances. */
  readonly endsAtMs: Option.Option<number>
}

export interface Resting extends RunClock {
  readonly _tag: "Resting"
  readonly round: number
  /** The step just done. */
  readonly stepIndex: number
  readonly endsAtMs: number
}

export interface Paused {
  readonly _tag: "Paused"
  readonly inner: Working | Resting
  /** Frozen countdown; `None` when the inner phase is a `reps` item. */
  readonly remainingMs: Option.Option<number>
  readonly pausedAtMs: number
}

export interface Done {
  readonly _tag: "Done"
  readonly durationSeconds: number
}

export type PlayerState = Idle | Working | Resting | Paused | Done

export type PlayerEventTag = "start" | "tick" | "pause" | "resume" | "next" | "previous" | "finish"

export interface PlayerEvent {
  readonly _tag: PlayerEventTag
  readonly nowMs: number
}

export interface PlayerConfig {
  readonly day: ProgramDay
  /** ≥ 1; divides every work and rest duration (dev: `EXPO_PUBLIC_PLAYER_SPEED`). */
  readonly speed: number
}

export const idle: PlayerState = { _tag: "Idle" }

export const playerEvent = (tag: PlayerEventTag, nowMs: number): PlayerEvent => ({
  _tag: tag,
  nowMs,
})

/** `previous` within this long after a phase began goes to the step before. */
export const PREVIOUS_GRACE_MS = 2000

const scaledMs = (config: PlayerConfig, seconds: number): number =>
  (seconds * 1000) / (Number.isFinite(config.speed) ? Math.max(1, config.speed) : 1)

const lastStepIndex = (steps: ReadonlyArray<Step>): number => steps.length - 1

type Run = Pick<RunClock, "startedAtMs" | "pausedMs">

const runOf = (state: Working | Resting): Run => ({
  startedAtMs: state.startedAtMs,
  pausedMs: state.pausedMs,
})

const done = (run: Run, endMs: number): Done => ({
  _tag: "Done",
  durationSeconds: Math.max(0, Math.round((endMs - run.startedAtMs - run.pausedMs) / 1000)),
})

const enterWork = (
  config: PlayerConfig,
  run: Run,
  round: number,
  stepIndex: number,
  atMs: number,
): PlayerState =>
  Option.match(Arr.get(expandDay(config.day), stepIndex), {
    onNone: () => done(run, atMs),
    onSome: ({ item }) => ({
      _tag: "Working",
      ...run,
      phaseStartMs: atMs,
      round,
      stepIndex,
      endsAtMs: Match.value(item).pipe(
        Match.discriminatorsExhaustive("kind")({
          timed: ({ seconds }) => Option.some(atMs + scaledMs(config, seconds)),
          reps: () => Option.none<number>(),
        }),
      ),
    }),
  })

/** The phase after resting on (round, stepIndex): the next step, wrapping into the next round. */
const enterNextWork = (
  config: PlayerConfig,
  run: Run,
  round: number,
  stepIndex: number,
  atMs: number,
): PlayerState =>
  stepIndex >= lastStepIndex(expandDay(config.day))
    ? enterWork(config, run, round + 1, 0, atMs)
    : enterWork(config, run, round, stepIndex + 1, atMs)

/**
 * Rest after step `stepIndex`: the step's `restSeconds` (between sets and after an item), or
 * `restBetweenRoundsSeconds` after the last step of a round.
 */
export const restAfter = (day: ProgramDay, stepIndex: number): number => {
  const steps = expandDay(day)
  return stepIndex >= lastStepIndex(steps)
    ? day.restBetweenRoundsSeconds
    : Option.match(Arr.get(steps, stepIndex), {
        onNone: () => 0,
        onSome: (s) => s.restSeconds,
      })
}

/**
 * The phase after working on (round, stepIndex): `restAfter`, `Done` after the last step of the
 * final round. A rest of 0 s is skipped.
 */
const afterWork = (
  config: PlayerConfig,
  run: Run,
  round: number,
  stepIndex: number,
  atMs: number,
): PlayerState => {
  const { day } = config
  const endOfRound = stepIndex >= lastStepIndex(expandDay(day))
  if (endOfRound && round >= day.rounds - 1) {
    return done(run, atMs)
  }
  const restSeconds = restAfter(day, stepIndex)
  return restSeconds <= 0
    ? enterNextWork(config, run, round, stepIndex, atMs)
    : {
        _tag: "Resting",
        ...run,
        phaseStartMs: atMs,
        round,
        stepIndex,
        endsAtMs: atMs + scaledMs(config, restSeconds),
      }
}

/** Advance through every phase whose deadline is ≤ nowMs, chaining from each deadline. */
const catchUp = (config: PlayerConfig, state: PlayerState, nowMs: number): PlayerState =>
  Match.valueTags(state, {
    Idle: (s): PlayerState => s,
    Paused: (s): PlayerState => s,
    Done: (s): PlayerState => s,
    Working: (s): PlayerState =>
      Option.match(
        Option.filter(s.endsAtMs, (endsAt) => endsAt <= nowMs),
        {
          onNone: () => s,
          onSome: (endsAt) =>
            catchUp(config, afterWork(config, runOf(s), s.round, s.stepIndex, endsAt), nowMs),
        },
      ),
    Resting: (s): PlayerState =>
      s.endsAtMs <= nowMs
        ? catchUp(config, enterNextWork(config, runOf(s), s.round, s.stepIndex, s.endsAtMs), nowMs)
        : s,
  })

const remainingOf = (state: Working | Resting, nowMs: number): Option.Option<number> =>
  Match.valueTags(state, {
    Working: (s) => Option.map(s.endsAtMs, (endsAt) => Math.max(0, endsAt - nowMs)),
    Resting: (s) => Option.some(Math.max(0, s.endsAtMs - nowMs)),
  })

const pause = (state: Working | Resting, nowMs: number): Paused => ({
  _tag: "Paused",
  inner: state,
  remainingMs: remainingOf(state, nowMs),
  pausedAtMs: nowMs,
})

/** Unfreeze: deadline = now + frozen remaining; the paused span moves the phase start along. */
const resume = (state: Paused, nowMs: number): Working | Resting => {
  const pausedFor = Math.max(0, nowMs - state.pausedAtMs)
  const shift = {
    pausedMs: state.inner.pausedMs + pausedFor,
    phaseStartMs: state.inner.phaseStartMs + pausedFor,
  }
  return Match.valueTags(state.inner, {
    Working: (s): Working | Resting => ({
      ...s,
      ...shift,
      endsAtMs: Option.map(state.remainingMs, (remaining) => nowMs + remaining),
    }),
    Resting: (s): Working | Resting => ({
      ...s,
      ...shift,
      endsAtMs: nowMs + Option.getOrElse(state.remainingMs, () => 0),
    }),
  })
}

/** `next`: end the current phase now. */
const next = (config: PlayerConfig, state: Working | Resting, nowMs: number): PlayerState =>
  Match.valueTags(state, {
    Working: (s) => afterWork(config, runOf(s), s.round, s.stepIndex, nowMs),
    Resting: (s) => enterNextWork(config, runOf(s), s.round, s.stepIndex, nowMs),
  })

/**
 * `previous` while working: restart the step, or, within `PREVIOUS_GRACE_MS` of its start, go to
 * the step before (wrapping into the previous round; the very first step just restarts).
 * While resting: redo the step just done.
 */
const previous = (config: PlayerConfig, state: Working | Resting, nowMs: number): PlayerState =>
  Match.valueTags(state, {
    Resting: (s) => enterWork(config, runOf(s), s.round, s.stepIndex, nowMs),
    Working: (s) => {
      const withinGrace = nowMs - s.phaseStartMs < PREVIOUS_GRACE_MS
      if (!withinGrace || (s.round === 0 && s.stepIndex === 0)) {
        return enterWork(config, runOf(s), s.round, s.stepIndex, nowMs)
      }
      return s.stepIndex === 0
        ? enterWork(config, runOf(s), s.round - 1, lastStepIndex(expandDay(config.day)), nowMs)
        : enterWork(config, runOf(s), s.round, s.stepIndex - 1, nowMs)
    },
  })

const stepRunning = (
  config: PlayerConfig,
  state: Working | Resting,
  event: PlayerEvent,
): PlayerState => {
  const { nowMs } = event
  return Match.value(event._tag).pipe(
    Match.withReturnType<PlayerState>(),
    Match.when("start", () => state),
    Match.when("resume", () => state),
    Match.when("tick", () => catchUp(config, state, nowMs)),
    // Catch up first so a pause between ticks freezes the phase that is really running.
    Match.when("pause", () => {
      const current = catchUp(config, state, nowMs)
      return current._tag === "Working" || current._tag === "Resting"
        ? pause(current, nowMs)
        : current
    }),
    // `next` / `previous` act on the phase the user sees (the last tick), no catch-up.
    Match.when("next", () => next(config, state, nowMs)),
    Match.when("previous", () => previous(config, state, nowMs)),
    Match.when("finish", () => done(runOf(state), nowMs)),
    Match.exhaustive,
  )
}

/**
 * Paused: `resume` unfreezes; `next` / `previous` / `finish` apply to the resumed phase at
 * `nowMs` (the first two stay paused); `start`, `tick`, `pause` are no-ops.
 */
const stepPaused = (config: PlayerConfig, state: Paused, event: PlayerEvent): PlayerState => {
  const { nowMs } = event
  const repause = (s: PlayerState): PlayerState =>
    s._tag === "Working" || s._tag === "Resting" ? pause(s, nowMs) : s
  return Match.value(event._tag).pipe(
    Match.withReturnType<PlayerState>(),
    Match.when("start", () => state),
    Match.when("tick", () => state),
    Match.when("pause", () => state),
    Match.when("resume", () => resume(state, nowMs)),
    Match.when("next", () => repause(next(config, resume(state, nowMs), nowMs))),
    Match.when("previous", () => repause(previous(config, resume(state, nowMs), nowMs))),
    Match.when("finish", () => done(runOf(resume(state, nowMs)), nowMs)),
    Match.exhaustive,
  )
}

/** The one transition function. Unlisted event/state pairs return the state unchanged. */
export const step =
  (config: PlayerConfig) =>
  (state: PlayerState, event: PlayerEvent): PlayerState =>
    Match.valueTags(state, {
      Idle: (s): PlayerState =>
        event._tag === "start"
          ? enterWork(config, { startedAtMs: event.nowMs, pausedMs: 0 }, 0, 0, event.nowMs)
          : s,
      Working: (s) => stepRunning(config, s, event),
      Resting: (s) => stepRunning(config, s, event),
      Paused: (s) => stepPaused(config, s, event),
      Done: (s): PlayerState => s,
    })

// Selectors for the player screen.

/** Countdown left; `None` in Idle, Done and on a `reps` item. */
export const remainingMs = (state: PlayerState, nowMs: number): Option.Option<number> =>
  Match.valueTags(state, {
    Idle: () => Option.none<number>(),
    Done: () => Option.none<number>(),
    Paused: (s) => s.remainingMs,
    Working: (s) => remainingOf(s, nowMs),
    Resting: (s) => remainingOf(s, nowMs),
  })

const activePhase = (state: PlayerState): Option.Option<Working | Resting> =>
  Match.valueTags(state, {
    Idle: () => Option.none<Working | Resting>(),
    Done: () => Option.none<Working | Resting>(),
    Paused: (s) => Option.some(s.inner),
    Working: (s) => Option.some<Working | Resting>(s),
    Resting: (s) => Option.some<Working | Resting>(s),
  })

/** The step being worked on, or (while resting) the step just done. */
export const currentStep = (day: ProgramDay, state: PlayerState): Option.Option<Step> =>
  Option.flatMap(activePhase(state), (phase) => Arr.get(expandDay(day), phase.stepIndex))

/** The item being worked on, or (while resting) the item just done. */
export const currentItem = (day: ProgramDay, state: PlayerState): Option.Option<ProgramItem> =>
  Option.map(currentStep(day, state), (s) => s.item)

/** While resting: the item that comes after the rest (for "Rest over — Plank, 40 s"). */
export const upNext = (day: ProgramDay, state: PlayerState): Option.Option<ProgramItem> => {
  const steps = expandDay(day)
  return Option.flatMap(
    Option.filter(activePhase(state), (phase) => phase._tag === "Resting"),
    (phase) => Option.map(Arr.get(steps, (phase.stepIndex + 1) % steps.length), (s) => s.item),
  )
}

/**
 * While working (or paused mid-work): the item of the step that follows this one, wrapping to the
 * first step for the next round; `None` on the last step of the last round, while resting, idle
 * or done.
 */
export const nextAfterWork = (day: ProgramDay, state: PlayerState): Option.Option<ProgramItem> => {
  const steps = expandDay(day)
  return Option.flatMap(
    Option.filter(activePhase(state), (phase) => phase._tag === "Working"),
    (phase) =>
      Option.map(
        phase.stepIndex + 1 < steps.length
          ? Arr.get(steps, phase.stepIndex + 1)
          : phase.round + 1 < day.rounds
            ? Arr.get(steps, 0)
            : Option.none<Step>(),
        (s) => s.item,
      ),
  )
}

export interface PlayerProgress {
  /** 1-based. */
  readonly round: number
  readonly rounds: number
  /** 1-based exercise (the day's item). */
  readonly item: number
  readonly items: number
  /** 1-based set of that item. */
  readonly set: number
  readonly sets: number
  /** 1-based step within the round, of `steps`. */
  readonly step: number
  readonly steps: number
}

/** Round, exercise, set and step x/y; `None` in Idle and Done. */
export const progress = (day: ProgramDay, state: PlayerState): Option.Option<PlayerProgress> => {
  const steps = expandDay(day)
  return Option.flatMap(activePhase(state), (phase) =>
    Option.map(Arr.get(steps, phase.stepIndex), (s) => ({
      round: phase.round + 1,
      rounds: day.rounds,
      item: s.exerciseIndex + 1,
      items: s.exercises,
      set: s.set,
      sets: s.sets,
      step: phase.stepIndex + 1,
      steps: steps.length,
    })),
  )
}

const phaseKeyOf = (phase: Working | Resting): string =>
  `${phase._tag === "Working" ? "work" : "rest"}:${phase.round}:${phase.stepIndex}:${phase.phaseStartMs}`

/**
 * Changes exactly when a new phase begins (including a restart via `previous`), on pause and on
 * resume, and never on a plain tick. P4 fires cues and (re)schedules the phase-end notification
 * on a change.
 */
export const phaseKey = (state: PlayerState): string =>
  Match.valueTags(state, {
    Idle: () => "idle",
    Done: () => "done",
    Paused: (s) => `paused:${phaseKeyOf(s.inner)}`,
    Working: phaseKeyOf,
    Resting: phaseKeyOf,
  })
