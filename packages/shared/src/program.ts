import { Schema, Struct } from "effect"
import { LocalDate, ROW_COLUMNS, rowFields, Timestamp } from "./common"
import { ProgramDayCompletionId, ProgramEnrollmentId, SessionId } from "./ids"
import { DayNumber, ProgramId } from "./programs/Program"

/** Synced program progress (v2-programs.md §2). The definitions are static: `programs/`. */

// ProgramEnrollment

export const EnrollmentStatus = Schema.Literals(["active", "completed", "abandoned"])
export type EnrollmentStatus = typeof EnrollmentStatus.Type

export const ProgramEnrollmentFields = {
  /** Immutable (server ignores changes). */
  programId: ProgramId,
  /** Immutable (server ignores changes). */
  startedOn: LocalDate,
  status: EnrollmentStatus,
  /** The next day to do; `days.length + 1` once completed. */
  currentDay: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 366 })),
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
export const ProgramEnrollmentPatch = ProgramEnrollment.mapFields(
  Struct.omit([...ROW_COLUMNS, "programId", "startedOn"]),
).mapFields(Struct.map(Schema.optionalKey))
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
