import { Schema } from "effect"

/**
 * `POST /api/account/delete` answer (ADR-0024, docs/design/legal.md §1.7): every row of the caller
 * is physically erased from D1. Only `true` is a valid answer; a failure is an error status.
 */
export const AccountDeleted = Schema.Struct({ deleted: Schema.Literal(true) })
export type AccountDeleted = typeof AccountDeleted.Type
