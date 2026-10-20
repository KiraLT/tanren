import { Schema } from "effect"
import { PageLimit, SyncTable, Timestamp } from "./common"
import { Exercise } from "./exercise"
import { Uuid } from "./ids"
import { Plan, PlannedSession, PlannedSet, PlanWeek } from "./plan"
import { Session, WorkoutSet } from "./session"
import { Profile } from "./user"

/** Parents first: the server applies a push in this order (§10.2). */
export const SYNC_TABLE_ORDER = [
  "profile",
  "exercise",
  "plan",
  "planWeek",
  "plannedSession",
  "plannedSet",
  "session",
  "set",
] as const satisfies ReadonlyArray<SyncTable>

export const MAX_PUSH_CHANGES = 500

const member = <T extends SyncTable, Row extends Schema.Constraint>(table: T, row: Row) =>
  Schema.Struct({ table: Schema.Literal(table), row })

/** One row of any synced table, discriminated on `table`. A soft delete is a row with `deletedAt: Some`. */
export const SyncChange = Schema.Union([
  member("profile", Profile),
  member("exercise", Exercise),
  member("plan", Plan),
  member("planWeek", PlanWeek),
  member("plannedSession", PlannedSession),
  member("plannedSet", PlannedSet),
  member("session", Session),
  member("set", WorkoutSet),
])
export type SyncChange = typeof SyncChange.Type
export type SyncChangeEncoded = (typeof SyncChange)["Encoded"]

/** Opaque, server-issued position in the server's sync order; clients store and echo it. */
export const SyncCursor = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(512)).pipe(
  Schema.brand("SyncCursor"),
)
export type SyncCursor = typeof SyncCursor.Type

export const AcceptedChange = Schema.Struct({ table: SyncTable, id: Uuid, updatedAt: Timestamp })
export type AcceptedChange = typeof AcceptedChange.Type
export type AcceptedChangeEncoded = (typeof AcceptedChange)["Encoded"]

export const RejectReason = Schema.Literals([
  "forbidden",
  "missingParent",
  "immutableFieldChanged",
  "invariantViolated",
])
export type RejectReason = typeof RejectReason.Type

export const RejectedChange = Schema.Struct({
  table: SyncTable,
  id: Uuid,
  reason: RejectReason,
  message: Schema.String,
})
export type RejectedChange = typeof RejectedChange.Type

export const PushRequest = Schema.Struct({
  changes: Schema.Array(SyncChange).check(Schema.isMaxLength(MAX_PUSH_CHANGES)),
})
export type PushRequest = typeof PushRequest.Type
export type PushRequestEncoded = (typeof PushRequest)["Encoded"]

export const PushResponse = Schema.Struct({
  accepted: Schema.Array(AcceptedChange),
  /** The server's winning rows; the client applies them locally. */
  conflicts: Schema.Array(SyncChange),
  rejected: Schema.Array(RejectedChange),
  serverTime: Timestamp,
})
export type PushResponse = typeof PushResponse.Type
export type PushResponseEncoded = (typeof PushResponse)["Encoded"]

/** `since: null` on the first pull. */
export const PullRequest = Schema.Struct({
  since: Schema.OptionFromNullOr(SyncCursor),
  limit: PageLimit,
})
export type PullRequest = typeof PullRequest.Type
export type PullRequestEncoded = (typeof PullRequest)["Encoded"]

export const PullResponse = Schema.Struct({
  changes: Schema.Array(SyncChange),
  /** Pass as `since` on the next pull. */
  cursor: SyncCursor,
  serverTime: Timestamp,
  hasMore: Schema.Boolean,
})
export type PullResponse = typeof PullResponse.Type
export type PullResponseEncoded = (typeof PullResponse)["Encoded"]
