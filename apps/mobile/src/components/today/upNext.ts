import type { ProgramDay } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { dayMinutes } from "../../player/programDays"
import { continueLabel, continueLine, type DayProgress } from "../../services/ProgramRepo"

/**
 * What the shared Start does (navigation-v2.md §2 Merge, §6): open today's session in the pager
 * (`resume` once a set is logged), add the first exercise to a started free workout, play the
 * first due program day, or start a free workout. `None` while Today is loading or failed.
 */
export type StartTarget =
  | { readonly _tag: "None" }
  | { readonly _tag: "Session"; readonly resume: boolean }
  | { readonly _tag: "AddExercise" }
  | {
      readonly _tag: "Program"
      readonly enrollmentId: string
      readonly dayNumber: number
      /** An unfinished day (`ActiveProgram.inProgress`): "Continue day N", "Day N · k of m done". */
      readonly inProgress: Option.Option<DayProgress>
    }
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

/** The parts of `ActiveProgram` the decision reads. */
export interface DueInput {
  readonly enrollment: { readonly id: string }
  readonly day: Option.Option<{ readonly dayNumber: number }>
  readonly inProgress: Option.Option<DayProgress>
  /** A day was completed today: no Program target (the feed's "Done today" covers it). */
  readonly doneToday: boolean
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
        Option.match(
          Arr.findFirst(due, (entry) =>
            entry.doneToday
              ? Option.none()
              : Option.map(entry.day, (day) => ({ entry, dayNumber: day.dayNumber })),
          ),
          {
            onNone: (): StartTarget => ({ _tag: "Free" }),
            onSome: ({ entry, dayNumber }): StartTarget => ({
              _tag: "Program",
              enrollmentId: entry.enrollment.id,
              dayNumber,
              inProgress: entry.inProgress,
            }),
          },
        ),
    }),
  )

/** The pill's label: "Continue" for a session with sets, "Add exercise" for an empty free workout. */
export const startLabel = (target: StartTarget): string =>
  Match.value(target).pipe(
    Match.tagsExhaustive({
      None: () => "Start",
      Session: ({ resume }) => (resume ? "Continue" : "Start"),
      AddExercise: () => "Add exercise",
      Program: ({ dayNumber, inProgress }) =>
        Option.isSome(inProgress) ? continueLabel(dayNumber) : `Start day ${dayNumber}`,
      Free: () => "Start",
      Done: () => "Start another",
    }),
  )

/** The parts of `ActiveProgram` the Up-next program line reads. */
export interface ProgramLineInput {
  readonly program: { readonly days: ReadonlyArray<unknown> }
  readonly day: Option.Option<ProgramDay>
  readonly inProgress: Option.Option<DayProgress>
}

/** "Day 2 of 30 · ≈ 15 min", or "Day 2 · 3 of 21 done" for an unfinished day. */
export const programLine = ({ program, day, inProgress }: ProgramLineInput): string =>
  Option.match(day, {
    onNone: () => `${program.days.length} days`,
    onSome: (next) =>
      Option.match(inProgress, {
        onNone: () => `Day ${next.dayNumber} of ${program.days.length} · ≈ ${dayMinutes(next)} min`,
        onSome: (progress) => continueLine(next.dayNumber, progress),
      }),
  })

export interface DoneInput {
  readonly status: "done" | "inProgress"
  /** Local `YYYY-MM-DD` the workout started on. */
  readonly date: string
}

/** Finished workouts that started on `today` (local date of `startedAt`), newest first as given. */
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
