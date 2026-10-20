import { Array as Arr, Effect, Option, pipe } from "effect"
import { type SqlDriverShape, type SqlStatement, StoreError } from "../services/SqlDriver"

/**
 * Local schema (team contract): one table per synced entity, named by `ROW_TABLE`, with the
 * camelCase record keys of the shared `*Row` codecs as quoted column names, so a selected record
 * decodes unchanged. Every table adds `_dirty` (1 = not yet pushed) and `_rejected` (the server's
 * reject reason). No foreign keys: children may arrive before their parents (data model §10.3).
 * Migrations are append-only; `PRAGMA user_version` holds how many have been applied.
 */
const syncColumns = `"createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  "deletedAt" TEXT,
  "_dirty" INTEGER NOT NULL DEFAULT 0,
  "_rejected" TEXT`

const table = (name: string, columns: string): string =>
  `CREATE TABLE IF NOT EXISTS "${name}" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  ${columns},
  ${syncColumns}
)`

const dirtyIndex = (name: string): string =>
  `CREATE INDEX IF NOT EXISTS "${name}_dirty" ON "${name}" ("_dirty") WHERE "_dirty" = 1`

const TABLES = [
  "profile",
  "exercise",
  "plan",
  "plan_week",
  "planned_session",
  "planned_set",
  "workout_session",
  "workout_set",
] as const

const v1: ReadonlyArray<string> = [
  table(
    "profile",
    `"goals" TEXT NOT NULL,
  "constraints" TEXT NOT NULL,
  "availableDays" TEXT NOT NULL,
  "equipment" TEXT NOT NULL,
  "timezone" TEXT NOT NULL`,
  ),
  table(
    "exercise",
    `"name" TEXT NOT NULL,
  "aliases" TEXT NOT NULL,
  "muscleGroups" TEXT NOT NULL,
  "notes" TEXT`,
  ),
  table(
    "plan",
    `"name" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "status" TEXT NOT NULL`,
  ),
  table(
    "plan_week",
    `"planId" TEXT NOT NULL,
  "weekStart" TEXT NOT NULL,
  "intent" TEXT`,
  ),
  table(
    "planned_session",
    `"planWeekId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "scheduledDate" TEXT,
  "notes" TEXT`,
  ),
  table(
    "planned_set",
    `"plannedSessionId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "targetWeightKg" REAL,
  "targetReps" TEXT NOT NULL,
  "targetRpe" REAL,
  "restSeconds" INTEGER,
  "note" TEXT`,
  ),
  table(
    "workout_session",
    `"startedAt" TEXT NOT NULL,
  "finishedAt" TEXT,
  "plannedSessionId" TEXT,
  "notes" TEXT`,
  ),
  table(
    "workout_set",
    `"sessionId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "weightKg" REAL NOT NULL,
  "reps" INTEGER NOT NULL,
  "rpe" REAL,
  "note" TEXT,
  "plannedSetId" TEXT,
  "loggedAt" TEXT NOT NULL`,
  ),
  `CREATE TABLE IF NOT EXISTS "sync_state" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "planned_session_date" ON "planned_session" ("scheduledDate")`,
  `CREATE INDEX IF NOT EXISTS "planned_set_session" ON "planned_set" ("plannedSessionId")`,
  `CREATE INDEX IF NOT EXISTS "workout_session_planned" ON "workout_session" ("plannedSessionId")`,
  `CREATE INDEX IF NOT EXISTS "workout_set_session" ON "workout_set" ("sessionId")`,
  ...TABLES.map(dirtyIndex),
]

/** Append only. Never edit a shipped migration. */
export const MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [v1]

const statement = (sql: string): SqlStatement => ({ sql, params: [] })

export const userVersion = (driver: SqlDriverShape): Effect.Effect<number, StoreError> =>
  driver.all(statement("PRAGMA user_version")).pipe(
    Effect.flatMap((rows) =>
      pipe(
        Arr.head(rows),
        Option.flatMap((row) => Option.fromNullishOr(row.user_version)),
        Option.filter((value): value is number => typeof value === "number"),
        Option.match({
          onNone: () =>
            Effect.fail(new StoreError({ cause: "PRAGMA user_version returned no number" })),
          onSome: Effect.succeed,
        }),
      ),
    ),
  )

/** Applies every pending migration, each in its own transaction together with its version bump. */
export const migrate = (driver: SqlDriverShape): Effect.Effect<void, StoreError> =>
  userVersion(driver).pipe(
    Effect.flatMap((current) =>
      Effect.forEach(
        MIGRATIONS.slice(current),
        (sqls, offset) =>
          driver.batch([
            ...sqls.map(statement),
            statement(`PRAGMA user_version = ${current + offset + 1}`),
          ]),
        { discard: true },
      ),
    ),
  )
