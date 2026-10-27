import { Array as Arr, Match, Option } from "effect"

/**
 * What the shared Start does (navigation-v2.md §2 Merge, §6): open today's session in the pager
 * (`resume` once a set is logged), add the first exercise to a started free workout, play the
 * first due program day, or start a free workout. `None` while Today is loading or failed.
 */
export type StartTarget =
  | { readonly _tag: "None" }
  | { readonly _tag: "Session"; readonly resume: boolean }
  | { readonly _tag: "AddExercise" }
  | { readonly _tag: "Program"; readonly enrollmentId: string }
  | { readonly _tag: "Free" }
  /** A workout was finished today and nothing is open or due: "Start another" does `next`. */
  | { readonly _tag: "Done"; readonly next: StartTarget }

/** The parts of `TodayState` the decision reads (structural, so tests need no store rows). */
export type StartInput =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Failed" }
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Ready"; readonly session: Option.Option<unknown> }
  | {
      readonly _tag: "Free"
      readonly exercises: ReadonlyArray<unknown>
      readonly session: Option.Option<unknown>
    }

export interface DueInput {
  readonly enrollment: { readonly id: string }
}

/**
 * Planned session beats an open free workout beats a due program day beats a new free workout.
 * With `doneToday` > 0 a fresh start (no set logged yet) becomes `Done` (navigation-v2.md §6
 * "Done today"); an open session, a started free workout and a due program day stay primary.
 */
export const startTarget = (
  state: StartInput,
  due: ReadonlyArray<DueInput>,
  doneToday = 0,
): StartTarget => {
  const base = baseTarget(state, due)
  const fresh = (base._tag === "Session" && !base.resume) || base._tag === "Free"
  return doneToday > 0 && fresh ? { _tag: "Done", next: base } : base
}

const baseTarget = (state: StartInput, due: ReadonlyArray<DueInput>): StartTarget =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Loading: (): StartTarget => ({ _tag: "None" }),
      Failed: (): StartTarget => ({ _tag: "None" }),
      Ready: ({ session }): StartTarget => ({ _tag: "Session", resume: Option.isSome(session) }),
      Free: ({ exercises }): StartTarget =>
        // A started free workout with exercises is already under way: "Continue" (NAV-R3).
        Arr.isReadonlyArrayNonEmpty(exercises)
          ? { _tag: "Session", resume: true }
          : { _tag: "AddExercise" },
      Empty: (): StartTarget =>
        Option.match(Arr.head(due), {
          onNone: (): StartTarget => ({ _tag: "Free" }),
          onSome: (entry): StartTarget => ({
            _tag: "Program",
            enrollmentId: entry.enrollment.id,
          }),
        }),
    }),
  )

/** The pill's label: "Continue" for a session with sets, "Add exercise" for an empty free workout. */
export const startLabel = (target: StartTarget): string =>
  Match.value(target).pipe(
    Match.tagsExhaustive({
      None: () => "Start",
      Session: ({ resume }) => (resume ? "Continue" : "Start"),
      AddExercise: () => "Add exercise",
      Program: () => "Start",
      Free: () => "Start",
      Done: () => "Start another",
    }),
  )

export interface DoneInput {
  readonly status: "done" | "inProgress"
  /** Local `YYYY-MM-DD` the workout started on. */
  readonly date: string
}

/** Workouts finished on `today` (local date), newest first as given. */
export const finishedOn = <A extends DoneInput>(
  items: ReadonlyArray<A>,
  today: string,
): ReadonlyArray<A> => Arr.filter(items, (item) => item.status === "done" && item.date === today)

/** "2 workouts · 31 sets · 8,240 kg" over today's finished workouts. */
export const doneLine = (
  items: ReadonlyArray<{ readonly sets: number; readonly volumeKg: number }>,
  formatKg: (kg: number) => string,
): string => {
  const sets = Arr.reduce(items, 0, (total, item) => total + item.sets)
  const volume = Arr.reduce(items, 0, (total, item) => total + item.volumeKg)
  return [
    ...(items.length > 1 ? [`${items.length} workouts`] : []),
    `${sets} set${sets === 1 ? "" : "s"}`,
    ...(volume > 0 ? [formatKg(volume)] : []),
  ].join(" · ")
}

/** Work time assumed per set on top of its rest, for the card's "≈ N min". */
export const SECONDS_PER_SET = 45

export interface SessionExerciseInput {
  readonly exercise: { readonly name: string }
  readonly plannedSets: ReadonlyArray<unknown>
  /** The exercise's rest between sets (`TodayExercise.restSeconds`). */
  readonly restSeconds: number
}

/** "5 exercises · 18 sets · ≈ 50 min" under the session title. */
export const sessionMeta = (exercises: ReadonlyArray<SessionExerciseInput>): string => {
  const sets = Arr.reduce(exercises, 0, (total, item) => total + item.plannedSets.length)
  const seconds = Arr.reduce(
    exercises,
    0,
    (total, item) => total + item.plannedSets.length * (item.restSeconds + SECONDS_PER_SET),
  )
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
  return [
    count(exercises.length, "exercise"),
    ...(sets > 0 ? [count(sets, "set"), `≈ ${Math.max(1, Math.round(seconds / 60))} min`] : []),
  ].join(" · ")
}

/** "Leg press, RDL, Split squat" (the card truncates to one line). */
export const exerciseNames = (exercises: ReadonlyArray<SessionExerciseInput>): string =>
  Arr.map(exercises, (item) => item.exercise.name).join(", ")
