import { Schema, SchemaIssue } from "effect"
import { EntityName, SyncTable, Timestamp } from "./common"
import { Uuid } from "./ids"

export const ValidationIssue = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Number])),
  message: Schema.String,
})
export type ValidationIssue = typeof ValidationIssue.Type

const formatMessage = SchemaIssue.makeFormatterDefault()
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

/** Standard Schema segments are a `PropertyKey` or `{ key }`; the wire keeps strings and numbers. */
const toPathKey = (segment: PropertyKey | { readonly key: PropertyKey }): string | number => {
  const key = typeof segment === "object" ? segment.key : segment
  return typeof key === "number" ? key : String(key)
}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  // A row UUID, or a slug for the static entities (`catalogExercise`, built-in `program`).
  { entity: EntityName, id: Schema.String },
  { httpApiStatus: 404 },
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  /** Human-readable; never leaks other users' data. */
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { message: Schema.String, issues: Schema.Array(ValidationIssue) },
  { httpApiStatus: 400 },
) {
  /** For `X.makeEffect` failures, which are a bare `SchemaIssue.Issue`. */
  static fromIssue(issue: SchemaIssue.Issue): ValidationError {
    return new ValidationError({
      message: formatMessage(issue),
      issues: formatIssues(issue).issues.map((entry) => ({
        path: (entry.path ?? []).map(toPathKey),
        message: entry.message,
      })),
    })
  }

  /** For `Schema.decodeUnknownEffect` failures. */
  static fromSchemaError(error: Schema.SchemaError): ValidationError {
    return ValidationError.fromIssue(error.issue)
  }
}

/**
 * The session store or auth service could not be asked (D1 down, Better Auth rejected or failed to
 * start). Any authenticated route and `/api/auth/*` can answer it, so it is part of the API
 * contract: 503, not 500 and not 401 (a signed-in client must not drop its session over an outage).
 */
export class SessionStoreUnavailable extends Schema.TaggedError<SessionStoreUnavailable>()(
  "SessionStoreUnavailable",
  { message: Schema.String },
  { httpApiStatus: 503 },
) {}

/**
 * Why an email provider did not take a message: a 4xx (`rejected`, e.g. an unverified sender),
 * a 5xx or other non-2xx (`provider_error`), no response at all (`transport`), or a worker
 * misconfiguration such as a missing API key (`not_configured`).
 */
export const EmailFailureReason = Schema.Literals([
  "rejected",
  "provider_error",
  "transport",
  "not_configured",
])
export type EmailFailureReason = typeof EmailFailureReason.Type

/**
 * The upstream email provider failed, so no magic link went out: 502. Carries only the provider
 * name and a short reason, never the recipient address, the API key or the provider's raw reply.
 */
export class EmailDeliveryFailed extends Schema.TaggedError<EmailDeliveryFailed>()(
  "EmailDeliveryFailed",
  { provider: Schema.String, reason: EmailFailureReason },
  { httpApiStatus: 502 },
) {}

/** An unexpected server bug (a defect). Generic on purpose: the details go to the log only. */
export class InternalError extends Schema.TaggedError<InternalError>()(
  "InternalError",
  {},
  { httpApiStatus: 500 },
) {}

/** Optimistic concurrency for single-row writes; batched sync reports LWW outcomes instead. */
export class SyncConflict extends Schema.TaggedError<SyncConflict>()(
  "SyncConflict",
  { table: SyncTable, id: Uuid, clientUpdatedAt: Timestamp, serverUpdatedAt: Timestamp },
  { httpApiStatus: 409 },
) {}
