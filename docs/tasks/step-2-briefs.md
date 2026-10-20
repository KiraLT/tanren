# Step 2 briefs — D1 schema, migrations, seed

Source: `docs/design/db.md` (DB), ADR-0006 (proposed), `docs/design/local-dev.md` (LD),
`docs/design/data-model.md` (DM). Order: **T1 ∥ T2** → **T3** → **T4 ∥ T5**. Gate: `pnpm check` green, output in report.

## S2-T1 Drizzle schema + first migration (engineer / sonnet)
Time box: 15 min · Report ≤ 40 lines
- Files: `packages/db/{package.json,drizzle.config.ts,src/schema/{user,exercise,plan,session,sync}.ts,migrations/**}`,
  `pnpm-workspace.yaml` (catalog pins: `drizzle-orm 0.45.4`, `drizzle-kit 0.31.11`, `@effect/sql-d1 4.0.5`,
  `wrangler 4.151.2`), `apps/worker/wrangler.jsonc` only if absent (LD §1: binding `DB`, name `tanren`,
  placeholder `database_id`, `migrations_dir: "../../packages/db/migrations"`).
- Do: tables, columns, FKs, indexes exactly per DB §1–§2 (row columns incl. `server_seq`; no CHECK on enums;
  `CHECK (id = user_id)` on profile). `drizzle-kit generate --name init`; expression/partial indexes via
  `--custom` if drizzle-kit cannot express them. Script `generate` in packages/db.
- Done: `wrangler d1 migrations apply tanren --local` (from `apps/worker`) succeeds; report the
  `sqlite_master` list of tables + indexes; `pnpm check` green. VERIFY: Biome/GritQL rules accept the Drizzle files.

## S2-T2 Row codecs in shared (engineer / sonnet) — parallel with T1
Time box: 15 min · Report ≤ 40 lines
- Files: `packages/shared/src/{row.ts,row.test.ts,index.ts}`.
- Do: per DB §5 — `XRow` for the 8 synced entities (JSON columns via `Schema.fromJsonString`), `ROW_TABLE`
  map, `ROW_KEYS` per table (camelCase record keys, used by T3's parity test). VERIFY: `Schema.decodeTo`
  composition compiles; decode must yield the `X` class instance.
- Done: round-trip tests per entity (DB record → `X` → identical record), invalid JSON fails with
  SchemaError, `Option.none` ↔ `null`; `pnpm check` green.

## S2-T3 D1 layer, test harness, ProfileRepo + ExerciseRepo (engineer / opus) — after T1, T2
Time box: 15 min · Report ≤ 40 lines
- Files: `packages/db/{vitest.config.ts,wrangler.test.jsonc,src/{client,errors,syncClock,index}.ts,
  src/repositories/{Profile,Exercise,index}.ts,src/testing/setup.ts,*.test.ts}`.
- Do: DB §3, §6, §8. First prove the harness: `@cloudflare/vitest-plugin@1.4.6` + `@effect/vitest`
  `it.effect` inside workerd with a migrated D1 (VERIFY); if not, the Node `getPlatformProxy` fallback (DB §8).
  VERIFY `D1Client.batch` signature from installed types; record findings in packages/db/CLAUDE.md.
  Sync-clock bump + upsert pattern in `syncClock.ts`, reused by every `put`.
- Done: tests for user scoping, Forbidden on foreign userId, unique `lower(name)` index, `server_seq`
  increasing across batches, immutable columns kept on upsert, table/codec column parity for all 8 tables;
  `pnpm check` green. This task freezes the repo pattern T4 copies.

## S2-T4 PlanRepo + SessionRepo (engineer / sonnet) — after T3
Time box: 15 min · Report ≤ 40 lines
- Files: `packages/db/src/repositories/{Plan,Session}.ts` + tests, `repositories/index.ts` (`Repositories.layer`).
- Do: DB §6 surface (`currentPlan`, `listSessions({from,to})`, `listSets`, `put*` per table), following
  T3's pattern exactly; sort by DM §11.2; writes parents-first.
- Done: tests for FK rejection of a missing parent (whole batch rolls back), one-active-plan index,
  `plan_week (plan_id, week_start)` uniqueness, `currentPlan` assembly order, user scoping; `pnpm check` green.

## S2-T5 Seed generator + runner (engineer / sonnet) — generator may start after T2; runner after T4
Time box: 15 min · Report ≤ 40 lines
- Files: `packages/db/src/seed/{month.ts,seededIdGenerator.ts,month.test.ts}`, `apps/worker/scripts/seed.ts`,
  `apps/worker/package.json` (scripts `db:migrate`, `db:seed`, `db:reset` per LD §1; dev dep `tsx 4.23.15`),
  root `package.json` passthrough scripts.
- Do: DB §7 content and determinism (`Random.withSeed`, seeded UUIDs, timestamps from `endDate` only).
- Done: test: same `(seed, endDate)` → deep-equal output; every row decodes with its shared schema; counts in
  the DB §7 ranges. `pnpm db:reset` runs locally and a `wrangler d1 execute tanren --local --command
  "SELECT count(*) FROM workout_set"` result is in the report; `pnpm check` green.
