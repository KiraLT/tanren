import { Array as Arr, DateTime, Option, Order, pipe, Schema } from "effect"
import { CatalogId, findCatalogExercise, isLoadedEquipment } from "./catalog"
import { Label, Reps, Rpe, Timestamp, WeightKg } from "./common"
import { type Exercise, MuscleGroup } from "./exercise"
import { ExerciseId, SessionId, SetId } from "./ids"
import { DayNumber, findProgram, ProgramId } from "./programs"
import type { Session, WorkoutSet } from "./session"

/**
 * The activity aggregate (ADR-0017, docs/design/feed.md §1): one session with its sets, exercises,
 * muscles, totals and PR flags, built by the pure `buildActivity`. The PR math lives here too (it
 * moved from `apps/mobile/src/services/progressMath.ts`, which re-exports it).
 */

// --- PR math (moved verbatim from the app) ---------------------------------------------------

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
 * What an exercise's sets measure (programs-player-v2 §2.7), from its catalog link: `s` for a timed
 * entry (reps hold seconds, ADR-0007 Q4), `kg` when its equipment moves a load, else `reps`
 * (bodyweight, or no catalog link).
 */
export const ExerciseUnit = Schema.Literals(["kg", "reps", "s"])
export type ExerciseUnit = typeof ExerciseUnit.Type

export const unitOf = (exercise: { readonly catalogId: Option.Option<CatalogId> }): ExerciseUnit =>
  Option.match(Option.flatMap(exercise.catalogId, findCatalogExercise), {
    onNone: (): ExerciseUnit => "reps",
    onSome: (entry): ExerciseUnit => {
      if (entry.kind === "timed") {
        return "s"
      }
      return isLoadedEquipment(entry.equipment) ? "kg" : "reps"
    },
  })

/** A timed exercise's sets compare by seconds (`reps`) alone: a load never outranks a longer hold. */
const SecondsScore: Order.Order<Pick<ScoredSet, "weightKg" | "reps">> = Order.mapInput(
  Order.Number,
  (set: Pick<ScoredSet, "weightKg" | "reps">) => set.reps,
)

/**
 * Set i is a PR iff some earlier scored set exists and its score beats every earlier one strictly.
 * By `unit`: `kg` scores only sets with `weightKg > 0` (a 0-kg set is never a PR and never the bar
 * to beat), `s` compares seconds, `reps` uses `SetScore`. The input must already be in
 * `Chronological` order; the first scored set is never a PR (nothing to beat).
 */
export const markPrs = <S extends ScoredSet>(
  chronological: ReadonlyArray<S>,
  unit: ExerciseUnit,
): ReadonlyArray<S & { readonly isPr: boolean }> =>
  Arr.mapAccum(chronological, Option.none<S>(), (best, set) => {
    if (unit === "kg" && set.weightKg <= 0) {
      return [best, { ...set, isPr: false }] as const
    }
    const score = unit === "s" ? SecondsScore : SetScore
    const isPr = Option.match(best, {
      onNone: () => false,
      onSome: (current) => score(set, current) > 0,
    })
    const next = Option.match(best, {
      onNone: () => set,
      onSome: (current) => (isPr ? set : current),
    })
    return [Option.some(next), { ...set, isPr }] as const
  })[1]

// --- Schemas ---------------------------------------------------------------------------------

export const ActivityKind = Schema.Literals(["planned", "program", "free"])
export type ActivityKind = typeof ActivityKind.Type

export const ActivityStatus = Schema.Literals(["done", "inProgress"])
export type ActivityStatus = typeof ActivityStatus.Type

export const ActivitySet = Schema.Struct({
  setId: SetId,
  weightKg: WeightKg,
  reps: Reps,
  rpe: Schema.OptionFromNullOr(Rpe),
  loggedAt: Timestamp,
  /** PR over the exercise's full history at that moment (`markPrs`). */
  isPr: Schema.Boolean,
})
export type ActivitySet = typeof ActivitySet.Type

export const ActivityExercise = Schema.Struct({
  exerciseId: ExerciseId,
  name: Label,
  catalogId: Schema.OptionFromNullOr(CatalogId),
  /**
   * The exercise row's `muscleGroups` (empty for an exercise missing from the map): what a custom
   * exercise (no `catalogId`) draws in its muscle map.
   */
  muscleGroups: Schema.Array(MuscleGroup),
  /** Chronological (`Chronological` order). Never empty. */
  sets: Schema.Array(ActivitySet),
  /** `bestSet` of `sets`: weightKg, reps. */
  best: Schema.Struct({ weightKg: WeightKg, reps: Reps }),
  prs: Schema.Int,
})
export type ActivityExercise = typeof ActivityExercise.Type

export const Activity = Schema.Struct({
  sessionId: SessionId,
  kind: ActivityKind,
  status: ActivityStatus,
  /** Planned session name | `${program.name} · Day ${n}` | "Workout". */
  title: Label,
  startedAt: Timestamp,
  /** `finishedAt − startedAt` if finished; else last − first `loggedAt` when ≥ 2 sets; else None. */
  durationSeconds: Schema.OptionFromNullOr(Schema.Int),
  sets: Schema.Int,
  reps: Schema.Int,
  /** Σ weightKg · reps. */
  volumeKg: Schema.Number,
  prs: Schema.Int,
  program: Schema.OptionFromNullOr(Schema.Struct({ programId: ProgramId, dayNumber: DayNumber })),
  /** In order of each exercise's first set. */
  exercises: Schema.Array(ActivityExercise),
  /**
   * Union over `exercises` of the catalog entry's `primaryMuscles` / `secondaryMuscles`
   * (`findCatalogExercise`), a muscle never in both; an exercise without `catalogId` contributes
   * its `muscleGroups` as primary. Each list sorted by `MuscleGroup` literal order.
   */
  muscles: Schema.Struct({
    primary: Schema.Array(MuscleGroup),
    secondary: Schema.Array(MuscleGroup),
  }),
})
export type Activity = typeof Activity.Type

/** A session with no `finishedAt` counts as in progress for this long after it started. */
export const ACTIVITY_OPEN_WINDOW_MS = 12 * 60 * 60 * 1000

export interface BuildActivityInput {
  readonly session: Session
  /** This session's live sets with full-history PR flags, any order. */
  readonly sets: ReadonlyArray<WorkoutSet & { readonly isPr: boolean }>
  /** By exerciseId. */
  readonly exercises: ReadonlyMap<string, Exercise>
  /** The live planned session's name. */
  readonly plannedTitle: Option.Option<Label>
  readonly program: Option.Option<{ readonly programId: ProgramId; readonly dayNumber: DayNumber }>
  readonly now: DateTime.Utc
}

// --- buildActivity ---------------------------------------------------------------------------

const UNKNOWN_EXERCISE = "Unknown exercise"
const FREE_TITLE = "Workout"

const millisBetween = (from: DateTime.Utc, to: DateTime.Utc): number =>
  DateTime.toEpochMillis(to) - DateTime.toEpochMillis(from)

/** Whole seconds, never negative (clock skew can put `finishedAt` before `startedAt`). */
const wholeSeconds = (millis: number): number => Math.max(0, Math.floor(millis / 1000))

const muscleOrder: Order.Order<MuscleGroup> = Order.mapInput(Order.Number, (muscle: MuscleGroup) =>
  MuscleGroup.literals.indexOf(muscle),
)

interface Contribution {
  readonly primary: ReadonlyArray<MuscleGroup>
  readonly secondary: ReadonlyArray<MuscleGroup>
}

/** The catalog entry's muscles; no catalog link (or an id the catalog lacks): `muscleGroups` as primary. */
const contribution = (exercise: Option.Option<Exercise>): Contribution =>
  Option.match(exercise, {
    onNone: () => ({ primary: [], secondary: [] }),
    onSome: (found) =>
      pipe(
        found.catalogId,
        Option.flatMap(findCatalogExercise),
        Option.match({
          onNone: () => ({ primary: found.muscleGroups, secondary: [] }),
          onSome: (entry) => ({
            primary: entry.primaryMuscles,
            secondary: entry.secondaryMuscles,
          }),
        }),
      ),
  })

const titleFor = (input: BuildActivityInput): string =>
  Option.match(input.program, {
    onSome: ({ programId, dayNumber }) =>
      `${Option.match(findProgram(programId), { onNone: () => "Program", onSome: (p) => p.name })} · Day ${dayNumber}`,
    onNone: () => Option.getOrElse(input.plannedTitle, () => FREE_TITLE),
  })

const kindFor = (input: BuildActivityInput): ActivityKind =>
  Option.isSome(input.program) ? "program" : Option.isSome(input.plannedTitle) ? "planned" : "free"

const toActivitySet = (set: WorkoutSet & { readonly isPr: boolean }): ActivitySet => ({
  setId: set.id,
  weightKg: set.weightKg,
  reps: set.reps,
  rpe: set.rpe,
  loggedAt: set.loggedAt,
  isPr: set.isPr,
})

/**
 * Pure. Returns None when `sets` is empty (not an activity). A set whose exercise is missing from
 * `exercises` is kept under the name "Unknown exercise" with no catalogId (never dropped: counts
 * stay true).
 */
export const buildActivity = (input: BuildActivityInput): Option.Option<Activity> => {
  const { session, now } = input
  const sorted = Arr.sort(input.sets, Chronological)
  if (sorted.length === 0) {
    return Option.none()
  }

  const exerciseIds = Arr.dedupe(Arr.map(sorted, (set) => set.exerciseId))
  // `bestSet` of a non-empty group is always Some; `toArray` keeps that total without a throw.
  const built = Arr.flatMap(exerciseIds, (exerciseId) => {
    const own = Arr.filter(sorted, (set) => set.exerciseId === exerciseId)
    const exercise = Option.fromNullishOr(input.exercises.get(exerciseId))
    return Option.toArray(
      Option.map(bestSet(own), (best) => ({
        muscles: contribution(exercise),
        exercise: {
          exerciseId,
          name: Option.match(exercise, { onNone: () => UNKNOWN_EXERCISE, onSome: (e) => e.name }),
          catalogId: Option.flatMap(exercise, (e) => e.catalogId),
          muscleGroups: Option.match(exercise, { onNone: () => [], onSome: (e) => e.muscleGroups }),
          sets: Arr.map(own, toActivitySet),
          best: { weightKg: best.weightKg, reps: best.reps },
          prs: Arr.filter(own, (set) => set.isPr).length,
        } satisfies ActivityExercise,
      })),
    )
  })

  const primary = pipe(
    built,
    Arr.flatMap((entry) => entry.muscles.primary),
    Arr.dedupe,
    Arr.sort(muscleOrder),
  )
  const secondary = pipe(
    built,
    Arr.flatMap((entry) => entry.muscles.secondary),
    Arr.dedupe,
    Arr.filter((muscle) => !primary.includes(muscle)),
    Arr.sort(muscleOrder),
  )

  const durationSeconds = Option.match(session.finishedAt, {
    onSome: (finishedAt) => Option.some(wholeSeconds(millisBetween(session.startedAt, finishedAt))),
    onNone: () =>
      sorted.length < 2
        ? Option.none()
        : Option.map(Option.all([Arr.head(sorted), Arr.last(sorted)]), ([first, last]) =>
            wholeSeconds(millisBetween(first.loggedAt, last.loggedAt)),
          ),
  })

  const open =
    Option.isNone(session.finishedAt) &&
    millisBetween(session.startedAt, now) < ACTIVITY_OPEN_WINDOW_MS

  return Option.some({
    sessionId: session.id,
    kind: kindFor(input),
    status: open ? "inProgress" : "done",
    title: titleFor(input),
    startedAt: session.startedAt,
    durationSeconds,
    sets: sorted.length,
    reps: Arr.reduce(sorted, 0, (total, set) => total + set.reps),
    volumeKg: Arr.reduce(sorted, 0, (total, set) => total + set.weightKg * set.reps),
    prs: Arr.filter(sorted, (set) => set.isPr).length,
    program: input.program,
    exercises: Arr.map(built, (entry) => entry.exercise),
    muscles: { primary, secondary },
  })
}
