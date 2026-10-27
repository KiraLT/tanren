import { Array as Arr, Effect, Option, Schema, Struct } from "effect"
import { CatalogId, Slug } from "./catalog/taxonomy"
import { Label, LocalDate, Note, ROW_COLUMNS, rowFields, Text, Timestamp, Weekday } from "./common"
import { ProgramDayCompletionId, ProgramEnrollmentId, SessionId, UserProgramId } from "./ids"
import { DayNumber, dayDurationSeconds, Program, ProgramDay, ProgramId } from "./programs/Program"

/**
 * Synced program progress (v2-programs.md §2) and the user's own programs (ADR-0026,
 * programs-mcp.md §1). Built-in definitions are static: `programs/`.
 */

const Int = Schema.Number.check(Schema.isInt())

// ProgramSchedule / source

/** How often a user program is meant to be done: N days per week, or fixed weekdays. */
export const ProgramSchedule = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("daysPerWeek"),
    days: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 7 })),
  }),
  Schema.Struct({
    kind: Schema.Literal("weekdays"),
    weekdays: Schema.UniqueArray(Weekday).check(Schema.isMinLength(1)),
  }),
])
export type ProgramSchedule = typeof ProgramSchedule.Type

/** Where a program comes from, as the read model reports it. */
export const ProgramSource = Schema.Literals(["builtin", "mcp", "manual"])
export type ProgramSource = typeof ProgramSource.Type

/** What a `program` row may hold: built-ins have no row. */
export const UserProgramSource = Schema.Literals(["mcp", "manual"])
export type UserProgramSource = typeof UserProgramSource.Type

export const ProgramDays = Schema.Array(ProgramDay).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(84),
)
export type ProgramDays = typeof ProgramDays.Type

// UserProgram

export const UserProgramFields = {
  title: Label,
  /** Immutable; unique per user among live rows (D1 partial unique index). */
  slug: Slug,
  summary: Note,
  description: Schema.OptionFromNullOr(Text),
  days: ProgramDays,
  schedule: ProgramSchedule,
  /** Immutable. */
  source: UserProgramSource,
  version: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
}

/** A program the user owns (written by Claude over MCP or in the app's editor). */
export class UserProgram extends Schema.Class<UserProgram>("@tanren/shared/UserProgram")({
  ...rowFields(UserProgramId),
  ...UserProgramFields,
}) {}
export type UserProgramEncoded = (typeof UserProgram)["Encoded"]

export const UserProgramInsert = UserProgram.mapFields(Struct.omit(ROW_COLUMNS))
export type UserProgramInsert = typeof UserProgramInsert.Type

/** Exact partial: absent key = unchanged; the immutable `slug` / `source` and `version` are not patchable. */
export const UserProgramPatch = Schema.Struct({
  title: Schema.optionalKey(Label),
  summary: Schema.optionalKey(Note),
  description: Schema.optionalKey(Schema.OptionFromNullOr(Text)),
  days: Schema.optionalKey(ProgramDays),
  schedule: Schema.optionalKey(ProgramSchedule),
})
export type UserProgramPatch = typeof UserProgramPatch.Type

/**
 * The `programId` of a row: its UUID, lower-cased. A lower-case UUID is hex digits in dash-separated
 * groups (36 chars), which always satisfies `Slug`, so the brand constructor cannot fail here.
 */
export const programIdOfRow = (id: UserProgramId): ProgramId => ProgramId.make(id.toLowerCase())

/** A row as a `Program` definition, so the player and Today treat built-ins and rows alike. */
export const toProgram = (row: UserProgram): Program =>
  // `disableChecks`: every field comes from an already-decoded `UserProgram` (Note ⊂ Text, 84 ⊂ 365 days).
  new Program(
    {
      programId: programIdOfRow(row.id),
      name: row.title,
      tagline: row.summary,
      description: Option.getOrElse(row.description, () => row.summary),
      days: row.days,
    },
    { disableChecks: true },
  )

// ProgramEnrollment

export const EnrollmentStatus = Schema.Literals(["active", "paused", "completed", "abandoned"])
export type EnrollmentStatus = typeof EnrollmentStatus.Type

/** Replace exercise `from` (the original id in the program's days) with `to` for one enrollment. */
export const Swap = Schema.Struct({ from: CatalogId, to: CatalogId })
export type Swap = typeof Swap.Type

/** At most one swap per original exercise; the issue points at the first repeated `from`. */
const uniqueFrom = Schema.makeFilter((swaps: ReadonlyArray<Swap>) =>
  Option.match(
    Arr.findFirstIndex(swaps, (swap, i) => swaps.findIndex((s) => s.from === swap.from) !== i),
    {
      onNone: () => true,
      onSome: (i) => ({ path: [i, "from"], issue: "duplicate swap for the same exercise" }),
    },
  ),
)

export const Swaps = Schema.Array(Swap).check(Schema.isMaxLength(30), uniqueFrom)
export type Swaps = typeof Swaps.Type

export const ProgramEnrollmentFields = {
  /** Immutable (server ignores changes). */
  programId: ProgramId,
  /** Immutable (server ignores changes). */
  startedOn: LocalDate,
  status: EnrollmentStatus,
  /** The next day to do; `days.length + 1` once completed. */
  currentDay: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 366 })),
  /** Per-enrollment exercise swaps; a wire row without the key (pre-v6 client) decodes as `[]`. */
  swaps: Swaps.pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
}

/** At most one live `active` enrollment per program and user (D1 partial unique index). */
export class ProgramEnrollment extends Schema.Class<ProgramEnrollment>(
  "@tanren/shared/ProgramEnrollment",
)({
  ...rowFields(ProgramEnrollmentId),
  ...ProgramEnrollmentFields,
}) {}
export type ProgramEnrollmentEncoded = (typeof ProgramEnrollment)["Encoded"]

export const ProgramEnrollmentInsert = ProgramEnrollment.mapFields(Struct.omit(ROW_COLUMNS))
export type ProgramEnrollmentInsert = typeof ProgramEnrollmentInsert.Type
/** Exact partial: absent key = unchanged; the immutable `programId` / `startedOn` are not patchable. */
export const ProgramEnrollmentPatch = Schema.Struct({
  status: Schema.optionalKey(EnrollmentStatus),
  currentDay: Schema.optionalKey(ProgramEnrollmentFields.currentDay),
  swaps: Schema.optionalKey(Swaps),
})
export type ProgramEnrollmentPatch = typeof ProgramEnrollmentPatch.Type

// ProgramDayCompletion

export const ProgramDayCompletionFields = {
  /** Parent (must exist, immutable). */
  enrollmentId: ProgramEnrollmentId,
  /** Immutable; one live completion per `(enrollmentId, dayNumber)` (D1 partial unique index). */
  dayNumber: DayNumber,
  completedAt: Timestamp,
  durationSeconds: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  /** The logged session (v2-programs.md §5); `None` if logging failed. A soft link, not a parent. */
  sessionId: Schema.OptionFromNullOr(SessionId),
}

export class ProgramDayCompletion extends Schema.Class<ProgramDayCompletion>(
  "@tanren/shared/ProgramDayCompletion",
)({
  ...rowFields(ProgramDayCompletionId),
  ...ProgramDayCompletionFields,
}) {}
export type ProgramDayCompletionEncoded = (typeof ProgramDayCompletion)["Encoded"]

export const ProgramDayCompletionInsert = ProgramDayCompletion.mapFields(Struct.omit(ROW_COLUMNS))
export type ProgramDayCompletionInsert = typeof ProgramDayCompletionInsert.Type
/** Exact partial: absent key = unchanged; the immutable parent key and `dayNumber` are not patchable. */
export const ProgramDayCompletionPatch = ProgramDayCompletion.mapFields(
  Struct.omit([...ROW_COLUMNS, "enrollmentId", "dayNumber"]),
).mapFields(Struct.map(Schema.optionalKey))
export type ProgramDayCompletionPatch = typeof ProgramDayCompletionPatch.Type

// Read model

export const MinutesRange = Schema.Struct({ min: Int, max: Int })
export type MinutesRange = typeof MinutesRange.Type

/** One program in a list (built-in or row), with the user's live enrollment if any. */
export const ProgramSummary = Schema.Struct({
  programId: ProgramId,
  title: Label,
  summary: Note,
  source: ProgramSource,
  version: Int,
  days: Int,
  /** `dayDurationSeconds / 60`, rounded, over all days. */
  minutesPerDay: MinutesRange,
  /** `None` for built-ins. */
  schedule: Schema.OptionFromNullOr(ProgramSchedule),
  enrollment: Schema.OptionFromNullOr(
    Schema.Struct({
      enrollmentId: ProgramEnrollmentId,
      status: EnrollmentStatus,
      currentDay: Int,
      startedOn: LocalDate,
    }),
  ),
})
export type ProgramSummary = typeof ProgramSummary.Type

/** Shortest and longest day of a program in whole minutes. */
export const minutesPerDay = (days: ReadonlyArray<ProgramDay>): MinutesRange => {
  const minutes = Arr.map(days, (day) => Math.round(dayDurationSeconds(day) / 60))
  return {
    min: Arr.reduce(minutes, Number.POSITIVE_INFINITY, (low, m) => Math.min(low, m)),
    max: Arr.reduce(minutes, 0, (high, m) => Math.max(high, m)),
  }
}

export interface ProgramMeta {
  readonly source: ProgramSource
  readonly version: number
  readonly schedule: Option.Option<ProgramSchedule>
}

/** Built-ins: `{ source: "builtin", version: 1, schedule: None }`; rows: their own columns. */
export const summarize = (
  program: Program,
  meta: ProgramMeta,
  enrollment: Option.Option<ProgramEnrollment>,
): ProgramSummary => ({
  programId: program.programId,
  title: program.name,
  summary: program.tagline,
  source: meta.source,
  version: meta.version,
  days: program.days.length,
  minutesPerDay: minutesPerDay(program.days),
  schedule: meta.schedule,
  enrollment: Option.map(enrollment, (row) => ({
    enrollmentId: row.id,
    status: row.status,
    currentDay: row.currentDay,
    startedOn: row.startedOn,
  })),
})
