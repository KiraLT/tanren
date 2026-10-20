import {
  type Exercise,
  ExerciseRow,
  LocalDate,
  type Plan,
  type PlannedSession,
  PlannedSessionRow,
  type PlannedSet,
  PlannedSetRow,
  PlanRow,
  type PlanWeek,
  PlanWeekRow,
  type Weekday,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, pipe } from "effect"
import { decodeRecords, LocalStore } from "./LocalStore"
import type { StoreError } from "./SqlDriver"
import { localToday } from "./TodayRepo"

/** One exercise of a planned session with its planned sets, in order (DM §11.2 blocks). */
export interface PlannedExerciseBlock {
  readonly exercise: Exercise
  readonly sets: ReadonlyArray<PlannedSet>
}

/**
 * `done` = a live `workout_session` links to it; otherwise `today` when scheduled today, `missed`
 * when scheduled earlier, else `upcoming`.
 */
export type PlannedSessionStatus = "done" | "today" | "upcoming" | "missed"

export interface PlanDay {
  readonly date: LocalDate
  readonly weekday: Weekday
  readonly sessions: ReadonlyArray<{
    readonly plannedSession: PlannedSession
    readonly status: PlannedSessionStatus
    readonly blocks: ReadonlyArray<PlannedExerciseBlock>
  }>
}

export interface PlanWeekView {
  readonly plan: Plan
  readonly week: PlanWeek
  /** Exactly 7, `days[0].date === week.weekStart` (ADR-0007: any weekday, never Monday-snapped). */
  readonly days: ReadonlyArray<PlanDay>
  /** Sessions with `scheduledDate` None, rendered after the days. */
  readonly unscheduled: ReadonlyArray<PlanDay["sessions"][number]>
}

export interface PlanWeekRepoShape {
  /** The live week of the live active plan covering today; `None` when there is none. */
  readonly currentWeek: Effect.Effect<
    Option.Option<PlanWeekView>,
    StoreError,
    DateTime.CurrentTimeZone
  >
}

type PlanSessionEntry = PlanDay["sessions"][number]

/** `getUTCDay` numbering: 0 = Sunday. */
const WEEKDAYS_FROM_SUNDAY: ReadonlyArray<Weekday> = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
]

/** A `LocalDate` as UTC midnight, so day arithmetic never meets a DST shift. */
const utcMidnight = (date: LocalDate): DateTime.Utc =>
  // A `LocalDate` is a checked calendar date, so this ISO string always parses.
  DateTime.makeUnsafe(`${date}T00:00:00.000Z`)

/** Calendar arithmetic on `LocalDate` (negative `days` go back). */
export const addDays = (date: LocalDate, days: number): LocalDate =>
  // Formatting a valid DateTime always yields a valid `YYYY-MM-DD` (same as `localToday`).
  LocalDate.make(DateTime.formatIsoDate(DateTime.add(utcMidnight(date), { days })))

export const weekdayOf = (date: LocalDate): Weekday =>
  pipe(
    Arr.get(WEEKDAYS_FROM_SUNDAY, DateTime.getPartUtc(utcMidnight(date), "weekDay")),
    // `weekDay` is always 0…6, so the fallback is unreachable.
    Option.getOrElse((): Weekday => "sun"),
  )

export const statusOf = (
  plannedSession: PlannedSession,
  today: LocalDate,
  doneIds: ReadonlySet<string>,
): PlannedSessionStatus =>
  doneIds.has(plannedSession.id)
    ? "done"
    : Option.match(plannedSession.scheduledDate, {
        onNone: () => "upcoming",
        onSome: (date) => (date === today ? "today" : date < today ? "missed" : "upcoming"),
      })

/**
 * DM §11.2: a session's exercises are its planned sets grouped by `exerciseId`, ordered by the
 * smallest `order` in each group. `sets` must already be sorted by `(order, id)`. A group whose
 * exercise row is missing locally is skipped.
 */
export const blocksOf = (
  sets: ReadonlyArray<PlannedSet>,
  exercises: ReadonlyArray<Exercise>,
): ReadonlyArray<PlannedExerciseBlock> =>
  pipe(
    Arr.dedupe(sets.map((set) => set.exerciseId)),
    Arr.map((exerciseId) =>
      Option.map(
        Arr.findFirst(exercises, (exercise) => exercise.id === exerciseId),
        (exercise): PlannedExerciseBlock => ({
          exercise,
          sets: sets.filter((set) => set.exerciseId === exerciseId),
        }),
      ),
    ),
    Arr.getSomes,
  )

/** Pure assembly of the view; `sessions` sorted by `(order, createdAt, id)`, `sets` by `(order, id)`. */
export const buildView = (input: {
  readonly plan: Plan
  readonly week: PlanWeek
  readonly today: LocalDate
  readonly sessions: ReadonlyArray<PlannedSession>
  readonly sets: ReadonlyArray<PlannedSet>
  readonly exercises: ReadonlyArray<Exercise>
  readonly doneIds: ReadonlySet<string>
}): PlanWeekView => {
  const entries = input.sessions.map(
    (plannedSession): PlanSessionEntry => ({
      plannedSession,
      status: statusOf(plannedSession, input.today, input.doneIds),
      blocks: blocksOf(
        input.sets.filter((set) => set.plannedSessionId === plannedSession.id),
        input.exercises,
      ),
    }),
  )
  const days = Arr.makeBy(7, (offset): PlanDay => {
    const date = addDays(input.week.weekStart, offset)
    return {
      date,
      weekday: weekdayOf(date),
      sessions: entries.filter((entry) =>
        Option.contains(entry.plannedSession.scheduledDate, date),
      ),
    }
  })
  return {
    plan: input.plan,
    week: input.week,
    days,
    unscheduled: entries.filter((entry) => Option.isNone(entry.plannedSession.scheduledDate)),
  }
}

const q = (sql: string, ...params: ReadonlyArray<string | number | null>) => ({ sql, params })
const placeholders = (values: ReadonlyArray<string>) => values.map(() => "?").join(", ")

export class PlanWeekRepo extends Context.Service<PlanWeekRepo, PlanWeekRepoShape>()(
  "@tanren/PlanWeekRepo",
) {
  static readonly layer: Layer.Layer<PlanWeekRepo, never, LocalStore> = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore

      /** `weekStart <= today < weekStart + 7`, i.e. `weekStart` in `[today - 6, today]`. */
      const coveringWeek = (today: LocalDate) =>
        store
          .all(
            q(
              `SELECT pw.* FROM "plan_week" pw
               JOIN "plan" p ON p."id" = pw."planId"
               WHERE p."status" = 'active' AND p."deletedAt" IS NULL AND pw."deletedAt" IS NULL
                 AND pw."weekStart" <= ? AND pw."weekStart" >= ?
               ORDER BY pw."weekStart" DESC, pw."id" LIMIT 1`,
              today,
              addDays(today, -6),
            ),
          )
          .pipe(Effect.flatMap(decodeRecords(PlanWeekRow)), Effect.map(Arr.head))

      /** Rows of `table` whose `column` is one of `ids`, skipping the query when there are none. */
      const whereIn = (sql: string, ids: ReadonlyArray<string>, tail = "") =>
        ids.length === 0
          ? Effect.succeed([])
          : store.all(q(`${sql} IN (${placeholders(ids)}) ${tail}`, ...ids))

      const assemble = (week: PlanWeek, today: LocalDate) =>
        Effect.gen(function* () {
          const plans = yield* store
            .all(q(`SELECT * FROM "plan" WHERE "id" = ?`, week.planId))
            .pipe(Effect.flatMap(decodeRecords(PlanRow)))
          const sessions = yield* store
            .all(
              q(
                `SELECT * FROM "planned_session" WHERE "planWeekId" = ? AND "deletedAt" IS NULL
                 ORDER BY "order", "createdAt", "id"`,
                week.id,
              ),
            )
            .pipe(Effect.flatMap(decodeRecords(PlannedSessionRow)))
          const sessionIds = sessions.map((session) => session.id)
          const sets = yield* whereIn(
            `SELECT * FROM "planned_set" WHERE "deletedAt" IS NULL AND "plannedSessionId"`,
            sessionIds,
            `ORDER BY "order", "id"`,
          ).pipe(Effect.flatMap(decodeRecords(PlannedSetRow)))
          const exercises = yield* whereIn(
            `SELECT * FROM "exercise" WHERE "id"`,
            Arr.dedupe(sets.map((set) => set.exerciseId)),
          ).pipe(Effect.flatMap(decodeRecords(ExerciseRow)))
          const done = yield* whereIn(
            `SELECT DISTINCT "plannedSessionId" AS "id" FROM "workout_session"
             WHERE "deletedAt" IS NULL AND "plannedSessionId"`,
            sessionIds,
          )
          const doneIds = new Set(
            done.flatMap((row) => (typeof row.id === "string" ? [row.id] : [])),
          )
          return Option.map(Arr.head(plans), (plan) =>
            buildView({ plan, week, today, sessions, sets, exercises, doneIds }),
          )
        })

      const currentWeek = Effect.gen(function* () {
        const today = yield* localToday
        const week = yield* coveringWeek(today)
        return yield* Option.match(week, {
          onNone: () => Effect.succeed(Option.none<PlanWeekView>()),
          onSome: (found) => assemble(found, today),
        })
      })

      return PlanWeekRepo.of({ currentWeek })
    }),
  )
}
