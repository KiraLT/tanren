import { sql } from "drizzle-orm"
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { exercise } from "./exercise"
import { rowColumns, userSeqIndex } from "./sync"

export const plan = sqliteTable(
  "plan",
  {
    ...rowColumns(),
    name: text("name").notNull(),
    goal: text("goal").notNull(),
    startDate: text("start_date").notNull(),
    status: text("status").notNull(),
  },
  (t) => [
    userSeqIndex("plan", t),
    // At most one live active plan per user.
    uniqueIndex("plan_user_active_unique")
      .on(t.userId)
      .where(sql`${t.status} = 'active' AND ${t.deletedAt} IS NULL`),
  ],
)

export const planWeek = sqliteTable(
  "plan_week",
  {
    ...rowColumns(),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id),
    weekStart: text("week_start").notNull(),
    intent: text("intent"),
  },
  (t) => [
    userSeqIndex("plan_week", t),
    index("plan_week_plan_id_idx").on(t.planId),
    uniqueIndex("plan_week_plan_week_start_unique")
      .on(t.planId, t.weekStart)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
)

export const plannedSession = sqliteTable(
  "planned_session",
  {
    ...rowColumns(),
    planWeekId: text("plan_week_id")
      .notNull()
      .references(() => planWeek.id),
    order: integer("order").notNull(),
    name: text("name").notNull(),
    scheduledDate: text("scheduled_date"),
    notes: text("notes"),
  },
  (t) => [
    userSeqIndex("planned_session", t),
    index("planned_session_plan_week_id_idx").on(t.planWeekId),
  ],
)

export const plannedSet = sqliteTable(
  "planned_set",
  {
    ...rowColumns(),
    plannedSessionId: text("planned_session_id")
      .notNull()
      .references(() => plannedSession.id),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercise.id),
    order: integer("order").notNull(),
    targetWeightKg: real("target_weight_kg"),
    targetReps: text("target_reps").notNull(),
    targetRpe: real("target_rpe"),
    restSeconds: integer("rest_seconds"),
    note: text("note"),
  },
  (t) => [
    userSeqIndex("planned_set", t),
    index("planned_set_planned_session_id_idx").on(t.plannedSessionId),
    index("planned_set_exercise_id_idx").on(t.exerciseId),
  ],
)
