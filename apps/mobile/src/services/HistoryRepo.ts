import {
  type Exercise,
  type ExerciseId,
  ExerciseRow,
  type ExerciseUnit,
  type Session,
  SessionRow,
  unitOf,
  type WorkoutSet,
  WorkoutSetRow,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Order,
  pipe,
  Record as Rec,
} from "effect"
import { decodeRecords, LocalStore } from "./LocalStore"
import { bestSet, Chronological, epley1Rm, markPrs, shiftDate, weekStartOf } from "./progressMath"
import type { StoreError } from "./SqlDriver"

/**
 * The sets that are data points for best / e1RM / volume: a `kg` exercise's 0-kg sets (an unweighted
 * program round, or a program day logged before weights) are not; other units keep every set.
 * PR marks apply the same rule inside the shared `markPrs(sets, unit)`.
 */
const scoredSets = (unit: ExerciseUnit, sets: ReadonlyArray<WorkoutSet>) =>
  unit === "kg" ? sets.filter((set) => set.weightKg > 0) : sets

export interface ExerciseSummary {
  readonly exercise: Exercise
  readonly unit: ExerciseUnit
  readonly lastLoggedAt: DateTime.Utc
  /**
   * Max by `SetScore` over the scored sets (earliest on a tie); a `kg` exercise with only 0-kg sets
   * falls back to all its sets so it stays listed (the row then reads "… · no load").
   */
  readonly best: WorkoutSet
  readonly bestE1Rm: number
  readonly totalSets: number
}

export interface WeekBucket {
  /** Local Monday, `YYYY-MM-DD`. */
  readonly weekStart: string
  /** `Σ weightKg · reps`: 0 for bodyweight and timed work, where the chart plots `reps` (seconds). */
  readonly volumeKg: number
  readonly sets: number
  readonly reps: number
}

export type MarkedSet = WorkoutSet & { readonly isPr: boolean }

export interface ExerciseHistory {
  readonly exercise: Exercise
  readonly unit: ExerciseUnit
  /** Over the scored sets (`kg`: weightKg > 0 only); None when there are none. */
  readonly best: Option.Option<WorkoutSet>
  readonly bestE1Rm: number
  /** Exactly `HISTORY_WEEKS`, oldest first, current week last, zero-filled. */
  readonly weeks: ReadonlyArray<WeekBucket>
  /** Same weeks; the best set's e1RM per week, None for a week without sets. */
  readonly e1RmTrend: ReadonlyArray<{
    readonly weekStart: string
    readonly e1Rm: Option.Option<number>
  }>
  /** Newest `RECENT_SESSIONS` sessions with this exercise; sets chronological. */
  readonly recent: ReadonlyArray<{
    readonly session: Session
    readonly sets: ReadonlyArray<MarkedSet>
  }>
}

export interface HistoryRepoShape {
  /** Only exercises with at least one live set, `lastLoggedAt` desc. */
  readonly exercises: Effect.Effect<ReadonlyArray<ExerciseSummary>, StoreError>
  /** None when the exercise row does not exist locally. */
  readonly exercise: (
    id: ExerciseId,
  ) => Effect.Effect<Option.Option<ExerciseHistory>, StoreError, DateTime.CurrentTimeZone>
  /**
   * The exercise's newest live set (by `loggedAt`) in a live session: the prefill source.
   * `loadedOnly` skips 0-kg sets (a loaded exercise's pre-weights program rows are not data, §2.7).
   */
  readonly lastSet: (
    id: ExerciseId,
    options?: { readonly loadedOnly: boolean },
  ) => Effect.Effect<Option.Option<WorkoutSet>, StoreError>
}

export const HISTORY_WEEKS = 8
export const RECENT_SESSIONS = 10

const volumeOf = (sets: ReadonlyArray<WorkoutSet>): number =>
  Arr.reduce(sets, 0, (total, set) => total + set.weightKg * set.reps)

const NewestSessionFirst: Order.Order<Session> = Order.flip(
  Order.combine(
    Order.mapInput(DateTime.Order, (session: Session) => session.startedAt),
    Order.mapInput(Order.String, (session: Session) => session.id),
  ),
)

const NewestLoggedFirst: Order.Order<ExerciseSummary> = Order.flip(
  Order.combine(
    Order.mapInput(DateTime.Order, (summary: ExerciseSummary) => summary.lastLoggedAt),
    Order.mapInput(Order.String, (summary: ExerciseSummary) => summary.exercise.id),
  ),
)

const summarise = (
  exercise: Exercise,
  sets: ReadonlyArray<WorkoutSet>,
): Option.Option<ExerciseSummary> => {
  const unit = unitOf(exercise)
  const scored = scoredSets(unit, sets)
  return Option.map(bestSet(scored.length > 0 ? scored : sets), (best) => ({
    exercise,
    unit,
    // `sets` is chronological and non-empty here (it has a best set).
    lastLoggedAt: pipe(
      Arr.last(sets),
      Option.match({ onNone: () => best.loggedAt, onSome: (last) => last.loggedAt }),
    ),
    best,
    bestE1Rm: unit === "s" ? 0 : epley1Rm(best.weightKg, best.reps),
    totalSets: sets.length,
  }))
}

/**
 * Pure assembly of the detail; `sets` are the exercise's live sets in `Chronological` order. Best,
 * e1RM and the trend use `scoredSets(unit)` only, PR marks `markPrs(sets, unit)`; `s` has no e1RM.
 */
export const buildHistory = (input: {
  readonly exercise: Exercise
  readonly unit: ExerciseUnit
  readonly sets: ReadonlyArray<WorkoutSet>
  readonly sessions: ReadonlyArray<Session>
  readonly now: DateTime.Zoned
}): ExerciseHistory => {
  const currentWeek = weekStartOf(input.now)
  const weekStarts = Arr.makeBy(HISTORY_WEEKS, (index) =>
    shiftDate(currentWeek, (index - (HISTORY_WEEKS - 1)) * 7),
  )
  const dated = input.sets.map((set) => ({
    set,
    weekStart: weekStartOf(DateTime.setZone(set.loggedAt, input.now.zone)),
  }))
  const perWeek = weekStarts.map((weekStart) => ({
    weekStart,
    sets: dated.filter((entry) => entry.weekStart === weekStart).map((entry) => entry.set),
  }))
  const { unit } = input
  const scored = scoredSets(unit, input.sets)
  const marked: ReadonlyArray<MarkedSet> = markPrs(input.sets, unit)
  const e1RmOf = (set: WorkoutSet) => (unit === "s" ? 0 : epley1Rm(set.weightKg, set.reps))
  const best = bestSet(scored)
  return {
    exercise: input.exercise,
    unit,
    best,
    bestE1Rm: Option.match(best, { onNone: () => 0, onSome: e1RmOf }),
    weeks: perWeek.map(
      (week): WeekBucket => ({
        weekStart: week.weekStart,
        volumeKg: volumeOf(scoredSets(unit, week.sets)),
        sets: week.sets.length,
        reps: Arr.reduce(week.sets, 0, (total, set) => total + set.reps),
      }),
    ),
    e1RmTrend: perWeek.map((week) => ({
      weekStart: week.weekStart,
      e1Rm: Option.map(bestSet(scoredSets(unit, week.sets)), e1RmOf),
    })),
    recent: pipe(
      Arr.sort(input.sessions, NewestSessionFirst),
      Arr.take(RECENT_SESSIONS),
      Arr.map((session) => ({
        session,
        sets: marked.filter((set) => set.sessionId === session.id),
      })),
    ),
  }
}

const q = (sql: string, ...params: ReadonlyArray<string | number | null>) => ({ sql, params })
const placeholders = (values: ReadonlyArray<string>) => values.map(() => "?").join(", ")

export class HistoryRepo extends Context.Service<HistoryRepo, HistoryRepoShape>()(
  "@tanren/HistoryRepo",
) {
  static readonly layer: Layer.Layer<HistoryRepo, never, LocalStore> = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore

      /** Live sets of live sessions (one SELECT), sorted `Chronological`. */
      const liveSets = (where: string, ...params: ReadonlyArray<string>) =>
        store
          .all(
            q(
              `SELECT s.* FROM "workout_set" s
               JOIN "workout_session" ws ON ws."id" = s."sessionId"
               WHERE s."deletedAt" IS NULL AND ws."deletedAt" IS NULL ${where}`,
              ...params,
            ),
          )
          .pipe(Effect.flatMap(decodeRecords(WorkoutSetRow)), Effect.map(Arr.sort(Chronological)))

      /** `sql IN (ids)`, skipping the query when there are none. */
      const whereIn = (sql: string, ids: ReadonlyArray<string>, tail = "") =>
        ids.length === 0
          ? Effect.succeed([])
          : store.all(q(`${sql} IN (${placeholders(ids)}) ${tail}`, ...ids))

      const exercises = Effect.gen(function* () {
        const sets = yield* liveSets("")
        const byExercise = Arr.groupBy(sets, (set): string => set.exerciseId)
        const rows = yield* whereIn(
          `SELECT * FROM "exercise" WHERE "deletedAt" IS NULL AND "id"`,
          Rec.keys(byExercise),
        ).pipe(Effect.flatMap(decodeRecords(ExerciseRow)))
        return pipe(
          rows,
          Arr.flatMap((exercise) =>
            pipe(
              Rec.get(byExercise, exercise.id),
              Option.flatMap((group) => summarise(exercise, group)),
              Option.toArray,
            ),
          ),
          Arr.sort(NewestLoggedFirst),
        )
      })

      const exercise = (id: ExerciseId) =>
        Effect.gen(function* () {
          const found = yield* store
            .all(q(`SELECT * FROM "exercise" WHERE "id" = ? AND "deletedAt" IS NULL`, id))
            .pipe(Effect.flatMap(decodeRecords(ExerciseRow)), Effect.map(Arr.head))
          if (Option.isNone(found)) {
            return Option.none<ExerciseHistory>()
          }
          const sets = yield* liveSets(`AND s."exerciseId" = ?`, id)
          const sessions = yield* whereIn(
            `SELECT * FROM "workout_session" WHERE "deletedAt" IS NULL AND "id"`,
            Arr.dedupe(sets.map((set) => set.sessionId)),
          ).pipe(Effect.flatMap(decodeRecords(SessionRow)))
          const now = yield* DateTime.nowInCurrentZone
          return Option.some(
            buildHistory({
              exercise: found.value,
              unit: unitOf(found.value),
              sets,
              sessions,
              now,
            }),
          )
        })

      const lastSet = (id: ExerciseId, options?: { readonly loadedOnly: boolean }) =>
        store
          .all(
            q(
              `SELECT s.* FROM "workout_set" s
               JOIN "workout_session" ws ON ws."id" = s."sessionId"
               WHERE s."exerciseId" = ? AND s."deletedAt" IS NULL AND ws."deletedAt" IS NULL
                 ${options?.loadedOnly === true ? `AND s."weightKg" > 0` : ""}
               ORDER BY s."loggedAt" DESC LIMIT 1`,
              id,
            ),
          )
          .pipe(Effect.flatMap(decodeRecords(WorkoutSetRow)), Effect.map(Arr.head))

      return HistoryRepo.of({ exercises, exercise, lastSet })
    }),
  )
}
