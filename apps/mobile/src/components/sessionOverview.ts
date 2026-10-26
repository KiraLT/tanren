import { Array as Arr } from "effect"

/** The part of a `TodayExercise` the session overview reads. */
export interface SessionOverviewExercise {
  readonly exercise: { readonly name: string }
  readonly plannedSets: ReadonlyArray<unknown>
  readonly loggedSets: ReadonlyArray<unknown>
}

export type SessionRowState = "done" | "now" | "todo"

export interface SessionRow {
  /** Pager index this row opens. */
  readonly index: number
  readonly title: string
  readonly state: SessionRowState
  /** 1-based number for the disc (`done` shows a check instead). */
  readonly number: number
  /** "logged/planned sets". */
  readonly trailing: string
}

const stateOf = (
  item: SessionOverviewExercise,
  position: number,
  current: number,
): SessionRowState =>
  item.loggedSets.length >= item.plannedSets.length ? "done" : position === current ? "now" : "todo"

/**
 * Desktop Today aside (ui-desktop §3): one row per exercise. Done wins over now (all planned sets
 * logged), then the pager's current exercise is now, the rest are todo.
 */
export const sessionRows = (
  exercises: ReadonlyArray<SessionOverviewExercise>,
  current: number,
): ReadonlyArray<SessionRow> =>
  Arr.map(exercises, (item, position) => ({
    index: position,
    title: item.exercise.name,
    state: stateOf(item, position, current),
    number: position + 1,
    trailing: `${item.loggedSets.length}/${item.plannedSets.length} sets`,
  }))
