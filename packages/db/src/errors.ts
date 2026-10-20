import { Data } from "effect"

/** Internal: a failed query or row codec. Never crosses the wire; step 3 maps it to a 500. */
export class PersistenceError extends Data.TaggedError("PersistenceError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** Wraps `SqlError` / `SchemaError` from one repository operation. */
export const persistenceError = (operation: string) => (cause: unknown) =>
  new PersistenceError({ operation, cause })
