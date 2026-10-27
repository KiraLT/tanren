import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Array as Arr, Effect } from "effect"
import { TestLayer } from "../testing/fixtures"
import { AccountErasure, ERASED_TABLES, type ErasedTable } from "./AccountErasure"

const T = "2026-10-27T10:00:00.000Z"
const userOf = (n: number) =>
  UserId.make(`00000000-0000-4000-8000-${(7000 + n).toString().padStart(12, "0")}`)
/** A row id unique per user and table slot. */
const idOf = (n: number, slot: number) =>
  `00000000-0000-4000-9${slot.toString().padStart(3, "0")}-${(7000 + n).toString().padStart(12, "0")}`

const run = (statements: ReadonlyArray<D1PreparedStatement>) =>
  Effect.promise(() => env.DB.batch([...statements]))

/** One row in every table of `ERASED_TABLES` (two in `verification`: magic link + one-time token). */
const seedUser = (n: number) => {
  const u = userOf(n)
  const id = (slot: number) => idOf(n, slot)
  const p = (query: string, ...values: ReadonlyArray<string | number>) =>
    env.DB.prepare(query).bind(...values)
  const row = `?, ?, '${T}', '${T}', NULL, 1`
  return run([
    p(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'T', ?, 1, '${T}', '${T}')`,
      u,
      `User${n}@Example.com`,
    ),
    p(
      `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, '${T}', ?, '${T}', '${T}', ?)`,
      id(1),
      `token-${n}`,
      u,
    ),
    p(
      `INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, 'credential', ?, '${T}', '${T}')`,
      id(2),
      u,
      u,
    ),
    p(
      `INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, '${T}', '${T}', '${T}')`,
      id(3),
      `magic-${n}`,
      JSON.stringify({ type: "magic-link", email: `user${n}@example.com`, name: "" }),
    ),
    p(
      `INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, '${T}', '${T}', '${T}')`,
      id(4),
      `one-time-token:hash-${n}`,
      `token-${n}`,
    ),
    p(`INSERT INTO sync_clock (user_id, seq) VALUES (?, 1)`, u),
    p(
      `INSERT INTO profile (id, user_id, created_at, updated_at, deleted_at, server_seq, goals, constraints, available_days, equipment, timezone) VALUES (?, ?, '${T}', '${T}', NULL, 1, '[]', '[]', '[]', '[]', 'UTC')`,
      u,
      u,
    ),
    p(
      `INSERT INTO exercise (id, user_id, created_at, updated_at, deleted_at, server_seq, name, aliases, muscle_groups) VALUES (${row}, 'Row', '[]', '[]')`,
      id(5),
      u,
    ),
    p(
      `INSERT INTO plan (id, user_id, created_at, updated_at, deleted_at, server_seq, name, goal, start_date, status) VALUES (${row}, 'P', 'g', '2026-10-26', 'active')`,
      id(6),
      u,
    ),
    p(
      `INSERT INTO plan_week (id, user_id, created_at, updated_at, deleted_at, server_seq, plan_id, week_start) VALUES (${row}, ?, '2026-10-26')`,
      id(7),
      u,
      id(6),
    ),
    p(
      `INSERT INTO planned_session (id, user_id, created_at, updated_at, deleted_at, server_seq, plan_week_id, "order", name) VALUES (${row}, ?, 0, 'Day')`,
      id(8),
      u,
      id(7),
    ),
    p(
      `INSERT INTO planned_set (id, user_id, created_at, updated_at, deleted_at, server_seq, planned_session_id, exercise_id, "order", target_reps) VALUES (${row}, ?, ?, 0, '5')`,
      id(9),
      u,
      id(8),
      id(5),
    ),
    p(
      `INSERT INTO workout_session (id, user_id, created_at, updated_at, deleted_at, server_seq, started_at) VALUES (${row}, '${T}')`,
      id(10),
      u,
    ),
    p(
      `INSERT INTO workout_set (id, user_id, created_at, updated_at, deleted_at, server_seq, session_id, exercise_id, "order", weight_kg, reps, logged_at) VALUES (${row}, ?, ?, 0, 50, 5, '${T}')`,
      id(11),
      u,
      id(10),
      id(5),
    ),
    p(
      `INSERT INTO program_enrollment (id, user_id, created_at, updated_at, deleted_at, server_seq, program_id, started_on, status, current_day) VALUES (${row}, 'core-30', '2026-10-26', 'active', 1)`,
      id(12),
      u,
    ),
    p(
      `INSERT INTO program_day_completion (id, user_id, created_at, updated_at, deleted_at, server_seq, enrollment_id, day_number, completed_at, duration_seconds) VALUES (${row}, ?, 1, '${T}', 900)`,
      id(13),
      u,
      id(12),
    ),
    p(
      `INSERT INTO integration (id, user_id, provider, status, external_id, display_name, access_token, refresh_token, expires_at, scope, created_at, updated_at) VALUES (?, ?, 'strava', 'active', 'x', 'X', 'v1.a.b', 'v1.a.b', '${T}', 's', '${T}', '${T}')`,
      id(14),
      u,
    ),
    p(
      `INSERT INTO activity_export (id, user_id, provider, session_id, status, next_attempt_at, created_at, updated_at) VALUES (?, ?, 'strava', ?, 'pending', '${T}', '${T}', '${T}')`,
      id(15),
      u,
      id(10),
    ),
  ])
}

/** Rows of user `n` in `table`: by user column, by id for `user`, by seeded identifier for `verification`. */
const countOf = (n: number, table: ErasedTable) => {
  const where =
    table === "user"
      ? "id = ?"
      : table === "verification"
        ? "identifier IN ('magic-' || ?, 'one-time-token:hash-' || ?)"
        : table === "session" || table === "account"
          ? `"userId" = ?`
          : "user_id = ?"
  const marker = table === "verification" ? String(n) : userOf(n)
  const values = table === "verification" ? [marker, marker] : [marker]
  return Effect.promise(() =>
    env.DB.prepare(`SELECT count(*) AS n FROM "${table}" WHERE ${where}`)
      .bind(...values)
      .first<{ readonly n: number }>(),
  ).pipe(Effect.map((result) => result?.n ?? -1))
}

const countsOf = (n: number) =>
  Effect.forEach(ERASED_TABLES, (table) =>
    Effect.map(countOf(n, table), (count) => [table, count] as const),
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)))

const expected = (count: number) =>
  Object.fromEntries(
    Arr.map(ERASED_TABLES, (table) => [table, table === "verification" ? count * 2 : count]),
  )

describe("AccountErasure", () => {
  it.effect("lists every table that carries a user column in the migrated schema", () =>
    Effect.gen(function* () {
      const tables = yield* Effect.promise(() =>
        // D1 denies `pragma_table_info` (SQLITE_AUTH); the stored DDL includes ALTER-added columns.
        env.DB.prepare(
          `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`,
        ).all<{ readonly name: string; readonly sql: string }>(),
      )
      const withUserColumn = Arr.map(
        Arr.filter(tables.results, (t) => /[`"](user_id|userId)[`"]\s+text/.test(t.sql)),
        (t) => t.name,
      )
      const listed = Arr.filter(ERASED_TABLES, (t) => t !== "user" && t !== "verification")
      expect(withUserColumn).toEqual(expect.arrayContaining([...listed]))
      expect(withUserColumn).toHaveLength(listed.length)
    }),
  )

  it.effect("erases every row of one user and leaves the other user's rows alone", () =>
    Effect.gen(function* () {
      yield* seedUser(1)
      yield* seedUser(2)
      expect(yield* countsOf(1)).toEqual(expected(1))
      yield* (yield* AccountErasure).deleteUser(userOf(1))
      expect(yield* countsOf(1)).toEqual(expected(0))
      expect(yield* countsOf(2)).toEqual(expected(1))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("erasing an unknown user is a no-op", () =>
    Effect.gen(function* () {
      yield* seedUser(3)
      yield* (yield* AccountErasure).deleteUser(userOf(99))
      expect(yield* countsOf(3)).toEqual(expected(1))
    }).pipe(Effect.provide(TestLayer)),
  )
})
