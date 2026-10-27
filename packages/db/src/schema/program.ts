import { sql } from "drizzle-orm"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { rowColumns, userSeqIndex } from "./sync"

/**
 * The user's own programs (ADR-0026, programs-mcp.md §2); built-ins are static in `@tanren/shared`
 * and have no row. `days` and `schedule` are JSON text; `slug` and `source` are immutable.
 */
export const program = sqliteTable(
  "program",
  {
    ...rowColumns(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary").notNull(),
    description: text("description"),
    days: text("days").notNull(),
    schedule: text("schedule").notNull(),
    source: text("source").notNull(),
    version: integer("version").notNull(),
  },
  (t) => [
    userSeqIndex("program", t),
    // One live program per slug and user.
    uniqueIndex("program_user_slug_unique").on(t.userId, t.slug).where(sql`${t.deletedAt} IS NULL`),
  ],
)

/** Program progress (v2-programs.md §2); `program_id` is a built-in slug or a `program` row id. */
export const programEnrollment = sqliteTable(
  "program_enrollment",
  {
    ...rowColumns(),
    programId: text("program_id").notNull(),
    startedOn: text("started_on").notNull(),
    status: text("status").notNull(),
    currentDay: integer("current_day").notNull(),
    swaps: text("swaps").notNull().default("[]"),
  },
  (t) => [
    userSeqIndex("program_enrollment", t),
    // At most one live active enrollment per program and user.
    uniqueIndex("program_enrollment_user_program_active_unique")
      .on(t.userId, t.programId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.status} = 'active'`),
  ],
)

/** `session_id` is a soft link to `workout_session` (no FK): `None` when logging failed. */
export const programDayCompletion = sqliteTable(
  "program_day_completion",
  {
    ...rowColumns(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => programEnrollment.id),
    dayNumber: integer("day_number").notNull(),
    completedAt: text("completed_at").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    sessionId: text("session_id"),
  },
  (t) => [
    userSeqIndex("program_day_completion", t),
    // One live completion per enrollment day.
    uniqueIndex("program_day_completion_enrollment_day_unique")
      .on(t.enrollmentId, t.dayNumber)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
)
