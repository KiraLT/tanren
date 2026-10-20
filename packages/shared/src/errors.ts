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
  { entity: EntityName, id: Uuid },
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

/** Optimistic concurrency for single-row writes; batched sync reports LWW outcomes instead. */
export class SyncConflict extends Schema.TaggedError<SyncConflict>()(
  "SyncConflict",
  { table: SyncTable, id: Uuid, clientUpdatedAt: Timestamp, serverUpdatedAt: Timestamp },
  { httpApiStatus: 409 },
) {}
