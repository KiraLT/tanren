import type { Exercise, ExerciseId, Session, WorkoutSet } from "@tanren/shared"
import { Array as Arr, DateTime, Option, Order, pipe } from "effect"
import type { NewActivity } from "./StravaApi"

// The Strava activity built from one finished session (design §6). Pure: no I/O, no clock.

/** Used when the session has no resolvable planned-session name. */
export const DEFAULT_ACTIVITY_NAME = "Strength training"
/** Strava shows long descriptions folded; Tanren keeps the whole text within this many chars. */
export const DESCRIPTION_LIMIT = 1000
export const DESCRIPTION_FOOTER = "Logged with Tanren"
/** The name shown for an exercise that is deleted or not found. */
export const UNKNOWN_EXERCISE = "Exercise"
const ELLIPSIS = "…"
const MIN_ELAPSED_SECONDS = 60

const byLogged: Order.Order<WorkoutSet> = Order.combine(
  Order.mapInput(DateTime.Order, (set: WorkoutSet) => set.loggedAt),
  Order.mapInput(Order.Number, (set: WorkoutSet) => set.order),
)

/** `2340` → `2 340` (a plain space groups thousands, as in the design copy). */
const grouped = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")

/** Weights keep their 0.25 steps (`62.5`), whole numbers are grouped. */
const kg = (value: number): string => (Number.isInteger(value) ? grouped(value) : String(value))

const nameOf = (exercises: ReadonlyArray<Exercise>, id: ExerciseId): string =>
  pipe(
    Arr.findFirst(exercises, (each) => each.id === id && Option.isNone(each.deletedAt)),
    Option.match({ onNone: () => UNKNOWN_EXERCISE, onSome: (each) => each.name }),
  )

/** `Bench Press — 4 × 8 @ 60 kg`, `Lat Pulldown — 3 sets · 10/10/8 reps @ 50 kg`. */
const exerciseLine = (name: string, sets: Arr.NonEmptyReadonlyArray<WorkoutSet>): string => {
  const reps = Arr.map(sets, (set) => set.reps)
  const first = Arr.headNonEmpty(reps)
  const uniform = Arr.every(reps, (r) => r === first)
  const volume = uniform
    ? `${sets.length} × ${first}`
    : `${sets.length} sets · ${reps.join("/")} reps`
  const heaviest = Arr.reduce(sets, 0, (max, set) => Math.max(max, set.weightKg))
  const load = heaviest === 0 ? "@ bodyweight" : `@ ${kg(heaviest)} kg`
  return `${name} — ${volume} ${load}`
}

/** `12 sets · 2 340 kg lifted · 48 min`; the lifted part is left out when nothing was loaded. */
const totalsLine = (sets: ReadonlyArray<WorkoutSet>, elapsedSeconds: number): string => {
  const lifted = Arr.reduce(sets, 0, (total, set) => total + set.weightKg * set.reps)
  return [
    `${sets.length} ${sets.length === 1 ? "set" : "sets"}`,
    ...(lifted > 0 ? [`${grouped(lifted)} kg lifted`] : []),
    `${Math.round(elapsedSeconds / 60)} min`,
  ].join(" · ")
}

/**
 * The activity description: one line per exercise in the order it was first logged, a blank line,
 * the totals and the footer. Exercise lines are dropped from the end (the list then ends with `…`)
 * until the whole text fits in `DESCRIPTION_LIMIT` characters.
 */
export const describeSession = (input: {
  readonly sets: ReadonlyArray<WorkoutSet>
  readonly exercises: ReadonlyArray<Exercise>
  readonly elapsedSeconds: number
}): string => {
  const sets = pipe(
    input.sets,
    Arr.filter((set) => Option.isNone(set.deletedAt)),
    Arr.sort(byLogged),
  )
  const lines = pipe(
    sets,
    Arr.map((set) => set.exerciseId),
    Arr.dedupe,
    Arr.flatMap((id) => {
      const group = Arr.filter(sets, (set) => set.exerciseId === id)
      return Arr.isReadonlyArrayNonEmpty(group)
        ? [exerciseLine(nameOf(input.exercises, id), group)]
        : []
    }),
  )
  const tail = `${totalsLine(sets, input.elapsedSeconds)}\n${DESCRIPTION_FOOTER}`
  const text = (kept: number): string => {
    const list = kept === lines.length ? lines : [...Arr.take(lines, kept), ELLIPSIS]
    return list.length === 0 ? tail : `${list.join("\n")}\n\n${tail}`
  }
  return pipe(
    Arr.reverse(Arr.range(0, lines.length)),
    Arr.findFirst((kept) => text(kept).length <= DESCRIPTION_LIMIT),
    Option.match({ onNone: () => text(0), onSome: text }),
  )
}

/**
 * `startedAt` as wall-clock time in `timezone`, `YYYY-MM-DDTHH:mm:ss` without an offset (Strava's
 * `start_date_local`). A missing or unknown zone falls back to UTC.
 */
export const startDateLocal = (startedAt: DateTime.Utc, timezone: Option.Option<string>): string =>
  pipe(
    timezone,
    Option.flatMap(DateTime.zoneMakeNamed),
    Option.flatMap((zone) => DateTime.makeZoned(startedAt, { timeZone: zone })),
    Option.match({ onNone: () => DateTime.formatIso(startedAt), onSome: DateTime.formatIsoZoned }),
  ).slice(0, "YYYY-MM-DDTHH:mm:ss".length)

/** Whole seconds between start and finish, at least 60 (Strava rejects very short activities). */
export const elapsedSeconds = (startedAt: DateTime.Utc, finishedAt: DateTime.Utc): number =>
  Math.max(
    MIN_ELAPSED_SECONDS,
    Math.floor((DateTime.toEpochMillis(finishedAt) - DateTime.toEpochMillis(startedAt)) / 1000),
  )

/**
 * The Strava activity for a finished session (`finishedAt` is passed in, already checked Some). The
 * name is the linked planned session's (`plannedSessionName`, resolved by the caller: `None` when
 * the session is unlinked or the planned session is gone), else `DEFAULT_ACTIVITY_NAME`.
 */
export const activityFor = (input: {
  readonly session: Session
  readonly finishedAt: DateTime.Utc
  readonly sets: ReadonlyArray<WorkoutSet>
  readonly exercises: ReadonlyArray<Exercise>
  readonly timezone: Option.Option<string>
  readonly plannedSessionName: Option.Option<string>
}): NewActivity => {
  const elapsed = elapsedSeconds(input.session.startedAt, input.finishedAt)
  return {
    sessionId: input.session.id,
    name: Option.getOrElse(input.plannedSessionName, () => DEFAULT_ACTIVITY_NAME),
    sportType: "WeightTraining",
    trainer: true,
    startDateLocal: startDateLocal(input.session.startedAt, input.timezone),
    elapsedTime: elapsed,
    description: describeSession({
      sets: input.sets,
      exercises: input.exercises,
      elapsedSeconds: elapsed,
    }),
  }
}
