import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { exercise } from "./exercise"
import { rowColumns, userSeqIndex } from "./sync"

/** `workout_session`: Better Auth owns `session`. `planned_session_id` is a soft link (no FK). */
export const workoutSession = sqliteTable(
  "workout_session",
  {
    ...rowColumns(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    plannedSessionId: text("planned_session_id"),
    notes: text("notes"),
  },
  (t) => [
    userSeqIndex("workout_session", t),
    index("workout_session_user_started_idx").on(t.userId, t.startedAt),
  ],
)

/** `workout_set`: `set` is an SQL keyword. `planned_set_id` is a soft link (no FK). */
export const workoutSet = sqliteTable(
  "workout_set",
  {
    ...rowColumns(),
    sessionId: text("session_id")
      .notNull()
      .references(() => workoutSession.id),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercise.id),
    order: integer("order").notNull(),
    weightKg: real("weight_kg").notNull(),
    reps: integer("reps").notNull(),
    rpe: real("rpe"),
    note: text("note"),
    plannedSetId: text("planned_set_id"),
    loggedAt: text("logged_at").notNull(),
  },
  (t) => [
    userSeqIndex("workout_set", t),
    index("workout_set_session_id_idx").on(t.sessionId),
    index("workout_set_user_exercise_logged_idx").on(t.userId, t.exerciseId, t.loggedAt),
  ],
)
