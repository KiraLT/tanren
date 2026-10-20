# Real examples from `packages/shared/src`

Copied from the shipped code (S1-T10, 2026-10-19; trimmed where marked `// …`). If the source
changes, the source wins: update this file in the same task.

## Branded units: `common.ts`

```ts
export const WeightKg = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(1000),
  Schema.isMultipleOf(0.25),
).pipe(Schema.brand("WeightKg"))
export type WeightKg = typeof WeightKg.Type
```

## Sync columns and derivation: `common.ts`, `session.ts`

```ts
/** The keys `Insert`/`Patch` omit. */
export const ROW_COLUMNS = ["id", "userId", "createdAt", "updatedAt", "deletedAt"] as const

export const rowFields = <Id extends Schema.Constraint>(id: Id) => ({
  id,
  userId: UserId,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: Schema.OptionFromNullOr(Timestamp),
})

// session.ts
export class WorkoutSet extends Schema.Class<WorkoutSet>("@tanren/shared/WorkoutSet")({
  ...rowFields(SetId),
  ...WorkoutSetFields,
}) {}
export const WorkoutSetInsert = WorkoutSet.mapFields(Struct.omit(ROW_COLUMNS))
export const WorkoutSetPatch = WorkoutSet.mapFields(
  Struct.omit([...ROW_COLUMNS, "sessionId"]), // the parent key is immutable
).mapFields(Struct.map(Schema.optionalKey))
```

## Cross-field checks survive only if re-attached: `exercise.ts`

```ts
export class Exercise extends Schema.Class<Exercise>("@tanren/shared/Exercise")(
  Schema.Struct({ ...rowFields(ExerciseId), ...ExerciseFields }).check(aliasesAreDistinct),
) {}

/** `mapFields` drops struct-level checks, so the alias filter is attached again. */
export const ExerciseInsert = Exercise.mapFields(Struct.omit(ROW_COLUMNS)).check(aliasesAreDistinct)
```

## Errors: `errors.ts`

```ts
// NotFound, Forbidden, SyncConflict are the same shape with their own httpApiStatus.
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
```

## Sync union discriminated on `table`: `sync.ts`

```ts
const member = <T extends SyncTable, Row extends Schema.Constraint>(table: T, row: Row) =>
  Schema.Struct({ table: Schema.Literal(table), row })

/** One row of any synced table, discriminated on `table`. A soft delete is a row with `deletedAt: Some`. */
export const SyncChange = Schema.Union([
  member("profile", Profile),
  member("exercise", Exercise),
  // … plan, planWeek, plannedSession, plannedSet, session
  member("set", WorkoutSet),
])
export type SyncChange = typeof SyncChange.Type
```

## Exhaustive match on the union: `sync.test.ts`

```ts
const parentId = (change: SyncChange): Option.Option<string> =>
  Match.value(change).pipe(
    Match.discriminatorsExhaustive("table")({
      profile: () => Option.none(),
      exercise: () => Option.none(),
      plan: () => Option.none(),
      planWeek: ({ row }) => Option.some(row.planId),
      plannedSession: ({ row }) => Option.some(row.planWeekId),
      plannedSet: ({ row }) => Option.some(row.plannedSessionId),
      session: () => Option.none(),
      set: ({ row }) => Option.some(row.sessionId),
    }),
  )
```
