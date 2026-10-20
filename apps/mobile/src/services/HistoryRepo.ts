import {
  type Exercise,
  type ExerciseId,
  ExerciseRow,
  PlannedSessionRow,
  type Session,
  SessionRow,
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

export interface ExerciseSummary {
  readonly exercise: Exercise
  readonly lastLoggedAt: DateTime.Utc
  /** Max by `SetScore` over all live sets (earliest on a tie). */
  readonly best: WorkoutSet
  readonly bestE1Rm: number
  readonly totalSets: number
}

export interface WeekBucket {
  /** Local Monday, `YYYY-MM-DD`. */
  readonly weekStart: string
  /** `Σ weightKg · reps`: 0 for bodyweight work, where the chart plots `reps`. */
  readonly volumeKg: number
  readonly sets: number
  readonly reps: number
}

export type MarkedSet = WorkoutSet & { readonly isPr: boolean }

export interface ExerciseHistory {
  readonly exercise: Exercise
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

export interface SessionSummary {
  readonly session: Session
  /** The live linked planned session's name, else "Workout". */
  readonly title: string
  /** `finishedAt − startedAt`, floored to minutes; None while unfinished. */
  readonly durationMinutes: Option.Option<number>
  readonly sets: number
  readonly exercises: number
  readonly volumeKg: number
  /** Sets in this session that are PRs over their exercise's full history (stable). */
  readonly prs: number
}

export interface HistoryRepoShape {
  /** Only exercises with at least one live set, `lastLoggedAt` desc. */
  readonly exercises: Effect.Effect<ReadonlyArray<ExerciseSummary>, StoreError>
  /** None when the exercise row does not exist locally. */
  readonly exercise: (
    id: ExerciseId,
  ) => Effect.Effect<Option.Option<ExerciseHistory>, StoreError, DateTime.CurrentTimeZone>
  /** Live sessions, `startedAt` desc; the UI pages by 30. */
  readonly sessions: (limit: number) => Effect.Effect<ReadonlyArray<SessionSummary>, StoreError>
}

export const HISTORY_WEEKS = 8
export const RECENT_SESSIONS = 10
export const UNTITLED_SESSION = "Workout"

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

/** Groups by exercise, then marks PRs within each exercise's chronological history. */
const markByExercise = (sets: ReadonlyArray<WorkoutSet>): ReadonlyArray<MarkedSet> =>
  pipe(
    Arr.groupBy(sets, (set): string => set.exerciseId),
    Rec.values,
    Arr.flatMap((group) => markPrs(Arr.sort(group, Chronological))),
  )

const summarise = (
  exercise: Exercise,
  sets: ReadonlyArray<WorkoutSet>,
): Option.Option<ExerciseSummary> =>
  Option.map(bestSet(sets), (best) => ({
    exercise,
    // `sets` is chronological and non-empty here (it has a best set).
    lastLoggedAt: pipe(
      Arr.last(sets),
      Option.match({ onNone: () => best.loggedAt, onSome: (last) => last.loggedAt }),
    ),
    best,
    bestE1Rm: epley1Rm(best.weightKg, best.reps),
    totalSets: sets.length,
  }))

/** Pure assembly of the detail; `sets` are the exercise's live sets in `Chronological` order. */
export const buildHistory = (input: {
  readonly exercise: Exercise
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
  const marked = markPrs(input.sets)
  const best = bestSet(input.sets)
  return {
    exercise: input.exercise,
    best,
    bestE1Rm: Option.match(best, {
      onNone: () => 0,
      onSome: (set) => epley1Rm(set.weightKg, set.reps),
    }),
    weeks: perWeek.map(
      (week): WeekBucket => ({
        weekStart: week.weekStart,
        volumeKg: volumeOf(week.sets),
        sets: week.sets.length,
        reps: Arr.reduce(week.sets, 0, (total, set) => total + set.reps),
      }),
    ),
    e1RmTrend: perWeek.map((week) => ({
      weekStart: week.weekStart,
      e1Rm: Option.map(bestSet(week.sets), (set) => epley1Rm(set.weightKg, set.reps)),
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

/** Pure assembly of one session row; `marked` holds the session's sets with full-history PRs. */
export const buildSessionSummary = (
  session: Session,
  marked: ReadonlyArray<MarkedSet>,
  titles: ReadonlyMap<string, string>,
): SessionSummary => {
  const sets = marked.filter((set) => set.sessionId === session.id)
  return {
    session,
    title: pipe(
      session.plannedSessionId,
      Option.flatMap((id) => Option.fromNullishOr(titles.get(id))),
      Option.getOrElse(() => UNTITLED_SESSION),
    ),
    durationMinutes: Option.map(session.finishedAt, (finishedAt) =>
      Math.floor(
        (DateTime.toEpochMillis(finishedAt) - DateTime.toEpochMillis(session.startedAt)) / 60_000,
      ),
    ),
    sets: sets.length,
    exercises: Arr.dedupe(sets.map((set) => set.exerciseId)).length,
    volumeKg: volumeOf(sets),
    prs: sets.filter((set) => set.isPr).length,
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
          return Option.some(buildHistory({ exercise: found.value, sets, sessions, now }))
        })

      const sessions = (limit: number) =>
        Effect.gen(function* () {
          const page = yield* store
            .all(
              q(
                `SELECT * FROM "workout_session" WHERE "deletedAt" IS NULL
                 ORDER BY "startedAt" DESC, "id" DESC LIMIT ?`,
                Math.max(0, Math.floor(limit)),
              ),
            )
            .pipe(Effect.flatMap(decodeRecords(SessionRow)))
          const ids = page.map((session) => session.id)
          // Full history of every exercise in the page, so each session's PR count is stable.
          const history =
            ids.length === 0
              ? []
              : yield* liveSets(
                  `AND s."exerciseId" IN (SELECT "exerciseId" FROM "workout_set"
                   WHERE "deletedAt" IS NULL AND "sessionId" IN (${placeholders(ids)}))`,
                  ...ids,
                )
          const planned = yield* whereIn(
            `SELECT * FROM "planned_session" WHERE "deletedAt" IS NULL AND "id"`,
            Arr.dedupe(Arr.getSomes(page.map((session) => session.plannedSessionId))),
          ).pipe(Effect.flatMap(decodeRecords(PlannedSessionRow)))
          const titles = new Map(planned.map((row): [string, string] => [row.id, row.name]))
          const marked = markByExercise(history)
          return page.map((session) => buildSessionSummary(session, marked, titles))
        })

      return HistoryRepo.of({ exercises, exercise, sessions })
    }),
  )
}
