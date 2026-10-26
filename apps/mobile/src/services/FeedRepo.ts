import {
  type Activity,
  buildActivity,
  Chronological,
  type DayNumber,
  type Exercise,
  ExerciseRow,
  type Label,
  markPrs,
  PlannedSessionRow,
  ProgramDayCompletionRow,
  ProgramEnrollmentRow,
  type ProgramId,
  type Session,
  type SessionId,
  SessionRow,
  type WorkoutSet,
  WorkoutSetRow,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, pipe, Record as Rec } from "effect"
import { decodeRecords, LocalStore } from "./LocalStore"
import type { StoreError } from "./SqlDriver"

export interface FeedRepoShape {
  /** Live sessions with ≥ 1 live set, `startedAt` desc then id desc. The UI pages by `FEED_PAGE`. */
  readonly activities: (limit: number) => Effect.Effect<ReadonlyArray<Activity>, StoreError>
  /** None when the session is missing, deleted or has no live set. */
  readonly activity: (id: SessionId) => Effect.Effect<Option.Option<Activity>, StoreError>
}

export const FEED_PAGE = 20

type MarkedSet = WorkoutSet & { readonly isPr: boolean }

interface ProgramLink {
  readonly programId: ProgramId
  readonly dayNumber: DayNumber
}

/** Groups by exercise, then marks PRs within each exercise's chronological history. */
const markByExercise = (sets: ReadonlyArray<WorkoutSet>): ReadonlyArray<MarkedSet> =>
  pipe(
    Arr.groupBy(sets, (set): string => set.exerciseId),
    Rec.values,
    Arr.flatMap((group) => markPrs(Arr.sort(group, Chronological))),
  )

const q = (sql: string, ...params: ReadonlyArray<string | number | null>) => ({ sql, params })
const placeholders = (values: ReadonlyArray<string>) => values.map(() => "?").join(", ")

/** A live session that has at least one live set. */
const FEED_SESSION = `SELECT ws.* FROM "workout_session" ws
  WHERE ws."deletedAt" IS NULL AND EXISTS (
    SELECT 1 FROM "workout_set" s WHERE s."sessionId" = ws."id" AND s."deletedAt" IS NULL)`

export class FeedRepo extends Context.Service<FeedRepo, FeedRepoShape>()("@tanren/FeedRepo") {
  static readonly layer: Layer.Layer<FeedRepo, never, LocalStore> = Layer.effect(
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
      const whereIn = (sql: string, ids: ReadonlyArray<string>) =>
        ids.length === 0
          ? Effect.succeed([])
          : store.all(q(`${sql} IN (${placeholders(ids)})`, ...ids))

      /** The activities of a page of sessions, in the page's order. */
      const assemble = (page: ReadonlyArray<Session>) =>
        Effect.gen(function* () {
          const ids = page.map((session) => session.id)
          if (ids.length === 0) {
            return []
          }
          // Full history of every exercise in the page, so each PR flag is stable.
          const history = yield* liveSets(
            `AND s."exerciseId" IN (SELECT "exerciseId" FROM "workout_set"
             WHERE "deletedAt" IS NULL AND "sessionId" IN (${placeholders(ids)}))`,
            ...ids,
          )
          const marked = markByExercise(history).filter((set) => ids.includes(set.sessionId))
          const bySession = Arr.groupBy(marked, (set): string => set.sessionId)

          // Deleted exercises are read too: they still name their old sets.
          const exerciseRows = yield* whereIn(
            `SELECT * FROM "exercise" WHERE "id"`,
            Arr.dedupe(marked.map((set) => set.exerciseId)),
          ).pipe(Effect.flatMap(decodeRecords(ExerciseRow)))
          const exercises = new Map(exerciseRows.map((row): [string, Exercise] => [row.id, row]))

          const plannedRows = yield* whereIn(
            `SELECT * FROM "planned_session" WHERE "deletedAt" IS NULL AND "id"`,
            Arr.dedupe(Arr.getSomes(page.map((session) => session.plannedSessionId))),
          ).pipe(Effect.flatMap(decodeRecords(PlannedSessionRow)))
          const titles = new Map(plannedRows.map((row): [string, Label] => [row.id, row.name]))

          const completions = yield* whereIn(
            `SELECT * FROM "program_day_completion" WHERE "deletedAt" IS NULL AND "sessionId"`,
            ids,
          ).pipe(Effect.flatMap(decodeRecords(ProgramDayCompletionRow)))
          const enrollmentRows = yield* whereIn(
            `SELECT * FROM "program_enrollment" WHERE "id"`,
            Arr.dedupe(completions.map((completion) => completion.enrollmentId)),
          ).pipe(Effect.flatMap(decodeRecords(ProgramEnrollmentRow)))
          const programOf = new Map(enrollmentRows.map((row) => [row.id, row.programId]))
          const links = new Map(
            Arr.flatMap(completions, (completion) =>
              pipe(
                completion.sessionId,
                Option.zipWith(
                  Option.fromNullishOr(programOf.get(completion.enrollmentId)),
                  (sessionId, programId): [string, ProgramLink] => [
                    sessionId,
                    { programId, dayNumber: completion.dayNumber },
                  ],
                ),
                Option.toArray,
              ),
            ),
          )

          const now = yield* DateTime.now
          return Arr.flatMap(page, (session) =>
            Option.toArray(
              buildActivity({
                session,
                sets: Rec.get(bySession, session.id).pipe(Option.getOrElse(() => [])),
                exercises,
                plannedTitle: pipe(
                  session.plannedSessionId,
                  Option.flatMap((id) => Option.fromNullishOr(titles.get(id))),
                ),
                program: Option.fromNullishOr(links.get(session.id)),
                now,
              }),
            ),
          )
        })

      const activities = (limit: number) =>
        store
          .all(
            q(
              `${FEED_SESSION} ORDER BY ws."startedAt" DESC, ws."id" DESC LIMIT ?`,
              Math.max(0, Math.floor(limit)),
            ),
          )
          .pipe(Effect.flatMap(decodeRecords(SessionRow)), Effect.flatMap(assemble))

      const activity = (id: SessionId) =>
        store
          .all(q(`${FEED_SESSION} AND ws."id" = ?`, id))
          .pipe(
            Effect.flatMap(decodeRecords(SessionRow)),
            Effect.flatMap(assemble),
            Effect.map(Arr.head),
          )

      return FeedRepo.of({ activities, activity })
    }),
  )
}
