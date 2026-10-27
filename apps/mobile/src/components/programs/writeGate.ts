import { Option } from "effect"

/**
 * Which editor writes may start (pure; `useWriteGate` keeps the state in a ref).
 *
 * - `queued`: a change that is a function of the stored row (steppers, text, add day). Any number
 *   may be in flight; each lands on the previous one's result. Refused while a `positional` or
 *   `leave` write is pending, because it would use an index the pending write is about to shift.
 * - `positional`: addresses a place in a list (move, remove). One at a time, and only when nothing
 *   else is in flight.
 * - `leave`: a write after which the screen navigates away (remove day, pick an exercise, create).
 *   Like `positional`, but a SAVED one locks the gate for good: the screen stays mounted until
 *   `back()` finishes, and a second tap in that window would act on the reloaded list (remove the
 *   next day, add a second exercise). Only a failed save unlocks.
 *
 * A saved `positional` or `leave` write also keeps the gate shut until the screen has RENDERED the
 * reloaded row (`observed`): between the save and the re-render the list on screen is the old one,
 * so its indexes (move, remove, per-item steppers) would hit the wrong item.
 */
export type WriteKind = "queued" | "positional" | "leave"

export interface GateState {
  /** Writes in flight, any kind. */
  readonly pending: number
  /** `positional` and `leave` writes in flight (0 or 1). */
  readonly positional: number
  /** A `leave` write saved: the screen is on its way out. */
  readonly locked: boolean
  /** A positional write saved at this version: shut until the screen renders that version or later. */
  readonly awaiting: Option.Option<number>
}

export const OPEN_GATE: GateState = {
  pending: 0,
  positional: 0,
  locked: false,
  awaiting: Option.none(),
}

/** The state after starting a write of `kind`, or `None` when it must be ignored. */
export const begin = (state: GateState, kind: WriteKind): Option.Option<GateState> => {
  if (state.locked || Option.isSome(state.awaiting)) {
    return Option.none()
  }
  if (kind === "queued") {
    return state.positional > 0
      ? Option.none()
      : Option.some({ ...state, pending: state.pending + 1 })
  }
  return state.pending > 0
    ? Option.none()
    : Option.some({ ...state, pending: state.pending + 1, positional: state.positional + 1 })
}

/**
 * The state after a write of `kind` settled. `savedVersion` is the version the save wrote, or
 * `None` for a failed save (a failure never locks and never waits).
 */
export const finish = (
  state: GateState,
  kind: WriteKind,
  savedVersion: Option.Option<number>,
): GateState => ({
  pending: Math.max(0, state.pending - 1),
  positional: kind === "queued" ? state.positional : Math.max(0, state.positional - 1),
  locked: state.locked || (kind === "leave" && Option.isSome(savedVersion)),
  awaiting: kind === "queued" ? state.awaiting : Option.orElse(savedVersion, () => state.awaiting),
})

/** The screen rendered `version`: a write waiting for that version or an earlier one may proceed. */
export const observed = (state: GateState, version: number): GateState =>
  Option.exists(state.awaiting, (awaited) => version >= awaited)
    ? { ...state, awaiting: Option.none() }
    : state

/** True while a write is in flight, awaiting its render, or the screen is leaving. */
export const isBusy = (state: GateState): boolean =>
  state.pending > 0 || state.locked || Option.isSome(state.awaiting)
