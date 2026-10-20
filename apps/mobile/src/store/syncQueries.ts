import { ROW_TABLE, SyncTable } from "@tanren/shared"
import { upsertStatement } from "../services/LocalStore"
import type { SqlRecord, SqlStatement } from "../services/SqlDriver"

/** `sync_state` key holding the opaque pull cursor. */
export const PULL_CURSOR_KEY = "pullCursor"

const quoted = (table: SyncTable): string => `"${ROW_TABLE[table]}"`

/** Dirty rows not flagged as rejected (a local edit clears `_rejected`, making them pushable). */
export const pushableRows = (table: SyncTable, limit: number): SqlStatement => ({
  sql: `SELECT * FROM ${quoted(table)} WHERE "_dirty" = 1 AND "_rejected" IS NULL ORDER BY "updatedAt", "id" LIMIT ?`,
  params: [limit],
})

export const countPushable = (table: SyncTable): SqlStatement => ({
  sql: `SELECT COUNT(*) AS "n" FROM ${quoted(table)} WHERE "_dirty" = 1 AND "_rejected" IS NULL`,
  params: [],
})

/**
 * Accepted by the server: clean, adopt the server's `updatedAt`. Guarded on the pushed
 * `updatedAt`, so a local edit made while the push was in flight stays dirty.
 */
export const markAccepted = (
  table: SyncTable,
  id: string,
  pushedUpdatedAt: string,
  serverUpdatedAt: string,
): SqlStatement => ({
  sql: `UPDATE ${quoted(table)} SET "_dirty" = 0, "_rejected" = NULL, "updatedAt" = ? WHERE "id" = ? AND "updatedAt" = ?`,
  params: [serverUpdatedAt, id, pushedUpdatedAt],
})

/** Rejected by the server: keep it dirty and flag it; unchanged rows are not re-sent. */
export const markRejected = (
  table: SyncTable,
  id: string,
  pushedUpdatedAt: string,
  reason: string,
): SqlStatement => ({
  sql: `UPDATE ${quoted(table)} SET "_rejected" = ? WHERE "id" = ? AND "updatedAt" = ?`,
  params: [reason, id, pushedUpdatedAt],
})

/**
 * Last-write-wins upsert of a remote row, written clean. `updatedAt` is always stored as
 * `DateTime.formatIso` output (fixed-width ISO, `Z`), so string comparison orders it in time.
 * `strict` (pull): only a strictly newer row replaces a local one. Not strict (push conflict):
 * ties go to the server (data model §11.5). Extends `upsertStatement` with an upsert `WHERE`.
 */
export const lwwUpsert = (
  table: SyncTable,
  record: SqlRecord,
  options: { readonly strict: boolean },
): SqlStatement => {
  const base = upsertStatement(table, record, false)
  const operator = options.strict ? ">" : ">="
  return {
    sql: `${base.sql} WHERE excluded."updatedAt" ${operator} ${quoted(table)}."updatedAt"`,
    params: base.params,
  }
}

export const readCursor: SqlStatement = {
  sql: `SELECT "value" FROM "sync_state" WHERE "key" = ?`,
  params: [PULL_CURSOR_KEY],
}

const writeState = (key: string, value: string): SqlStatement => ({
  sql: `INSERT INTO "sync_state" ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"`,
  params: [key, value],
})

export const writeCursor = (cursor: string): SqlStatement => writeState(PULL_CURSOR_KEY, cursor)

/** `sync_state` key holding the `UserId` the local rows were last re-keyed to. */
export const OWNER_USER_ID_KEY = "ownerUserId"

export const readOwner: SqlStatement = {
  sql: `SELECT "value" FROM "sync_state" WHERE "key" = ?`,
  params: [OWNER_USER_ID_KEY],
}

const statement = (sql: string, ...params: ReadonlyArray<string>): SqlStatement => ({ sql, params })

/**
 * Moves the local rows from `localUserId` to the signed-in `userId` (team-mobile.md, "INT-2:
 * LOCAL_USER_ID re-key procedure"). Run all of it in one batch. 1. mark the demo parents that
 * dirty rows reference dirty, child to parent, so dirtiness propagates up the chain; 2. drop the
 * rest of the clean demo seed (profile included); 3. re-key every surviving row and clear
 * `_rejected` (profile: `id` = `userId`, both columns); 4. drop the pull cursor, so the first pull
 * fetches the whole history, and record the owner, so a re-run for the same user is skipped.
 */
export const rekeyStatements = (
  localUserId: string,
  userId: string,
): ReadonlyArray<SqlStatement> => {
  const tables = SyncTable.literals.map(quoted)
  const markReferencedParents = [
    `UPDATE "planned_set" SET "_dirty" = 1 WHERE "id" IN (SELECT "plannedSetId" FROM "workout_set" WHERE "_dirty" = 1)`,
    `UPDATE "planned_session" SET "_dirty" = 1 WHERE "id" IN (SELECT "plannedSessionId" FROM "workout_session" WHERE "_dirty" = 1 UNION SELECT "plannedSessionId" FROM "planned_set" WHERE "_dirty" = 1)`,
    `UPDATE "plan_week" SET "_dirty" = 1 WHERE "id" IN (SELECT "planWeekId" FROM "planned_session" WHERE "_dirty" = 1)`,
    `UPDATE "plan" SET "_dirty" = 1 WHERE "id" IN (SELECT "planId" FROM "plan_week" WHERE "_dirty" = 1)`,
    `UPDATE "exercise" SET "_dirty" = 1 WHERE "id" IN (SELECT "exerciseId" FROM "workout_set" WHERE "_dirty" = 1 UNION SELECT "exerciseId" FROM "planned_set" WHERE "_dirty" = 1)`,
  ].map((sql) => statement(sql))
  const dropCleanSeed = tables.map((table) =>
    statement(`DELETE FROM ${table} WHERE "userId" = ? AND "_dirty" = 0`, localUserId),
  )
  const rekey = SyncTable.literals
    .filter((table) => table !== "profile")
    .map((table) =>
      statement(
        `UPDATE ${quoted(table)} SET "userId" = ?, "_rejected" = NULL WHERE "userId" = ?`,
        userId,
        localUserId,
      ),
    )
  const rekeyProfile = statement(
    `UPDATE "profile" SET "id" = ?1, "userId" = ?1, "_rejected" = NULL WHERE "id" = ?2`,
    userId,
    localUserId,
  )
  return [
    ...markReferencedParents,
    ...dropCleanSeed,
    ...rekey,
    rekeyProfile,
    statement(`DELETE FROM "sync_state" WHERE "key" = ?`, PULL_CURSOR_KEY),
    writeState(OWNER_USER_ID_KEY, userId),
  ]
}
