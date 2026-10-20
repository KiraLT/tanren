# @tanren/db

Persistence for Cloudflare D1: Drizzle table definitions, SQL migrations, the
Effect SQL client layer (`@effect/sql-d1`; no `@effect/sql-drizzle`, ADR-0006), and
repository services. Only `apps/worker` depends on this package.

## Boundaries

- Depends on `@tanren/shared`, `effect`, `@effect/sql-d1`, `drizzle-orm` (schema only).
  Nothing from `apps/`.
- Every synced table has `id`, `user_id`, `created_at`, `updated_at`, `deleted_at`, `server_seq`
  (`rowColumns()` in `schema/sync.ts`; docs/design/db.md).
  Every query is scoped by `userId`; there is no unscoped read path.
- Soft deletes only. Sync is last-write-wins on `updated_at`.
- Table shapes mirror the schemas in `@tanren/shared`; the schema is the
  truth, the table follows. Suggested table names are in
  `docs/design/data-model.md` §1: `workout_session` and `workout_set` (Better
  Auth owns `session`; `set` is an SQL keyword), snake_case columns.
- Better Auth must be configured to issue UUID user ids so `UserId` is one
  brand across auth and domain rows (step 3).

## Layout

```
src/
  index.ts            public surface: client, errors, repositories, syncClock
  schema/*.ts         Drizzle tables, one file per aggregate (+ parity.test.ts)
  client.ts           D1Layer(db): D1Client.layer, snake_case <-> camelCase
  errors.ts           PersistenceError (Data.TaggedError, internal) + persistenceError(op)
  syncClock.ts        bumpClock, upsertRow, makePut: the one write path every put uses
  repositories/*.ts   Context.Service per aggregate; index.ts merges them in Repositories.layer
  testing/            setup.ts (migrations), env.d.ts (Cloudflare.Env), fixtures.ts (test-only)
migrations/           drizzle-kit generated SQL, applied with wrangler
drizzle.config.ts · vitest.config.ts · wrangler.test.jsonc
```

## Repository pattern (S2-T3; copy it)

- `class XRepo extends Context.Service<XRepo, XRepoShape>()("@tanren/XRepo", { make })` with
  `static readonly layer = Layer.effect(this, this.make)`: requires `D1Client` only.
- Reads: `SqlSchema.findOneOption/findAll` with `Result: XRow` (shared codec), every statement has
  `user_id = ${userId}`; map errors with `Effect.mapError(persistenceError("x.op"))`.
- Writes: `put: makePut(sql, "<syncTable>", XRow, { table: ROW_TABLE.t, keys: ROW_KEYS.t,
  immutable: ["parentId"] })`. It fails with `Forbidden` before writing if a row's userId differs,
  then runs one `D1Client.batch`: clock bump + one `INSERT … ON CONFLICT (id) DO UPDATE` per row
  (SET skips id/userId/createdAt/immutable, `WHERE t.user_id = excluded.user_id`).
- Any constraint violation (FK, unique, CHECK) aborts the whole batch, clock bump included:
  `PersistenceError`.
- Register: add `XRepo.layer` to `Layer.mergeAll(...)` in `repositories/index.ts` and `export *`.
- Tests (`repositories/X.test.ts`): `it.effect(...).pipe(Effect.provide(TestLayer))` with
  `TestLayer` and the row builders (`exercise`, `plan`, `session`, … all 8 entities) from
  `testing/fixtures.ts`; `userA`/`userB`, `t1`/`t2` for owners and timestamps. Failures:
  `const error = yield* Effect.flip(repo.put(...))` then `expect(error._tag).toBe("Forbidden" |
  "PersistenceError")`. One D1 per file, shared by its tests: every test gets its own ids.

## Verified facts (S2-T3, 2026-10-20)

- `D1Client.batch: <const S extends ReadonlyArray<Statement<any>>>(statements: S) =>
  Effect<{ [K in keyof S]: Success<S[K]> }, SqlError>` (`@effect/sql-d1@4.0.5` `.d.ts`); it takes
  plain `sql\`…\`` statements, transforms included. D1 runs it as one transaction (tested).
- `@cloudflare/vitest-plugin@1.4.6` runs `@effect/vitest` `it.effect` inside workerd. Config:
  `cloudflareTest(async () => ({ wrangler: { configPath }, miniflare: { bindings: {
  TEST_MIGRATIONS: await readD1Migrations("./migrations") } } }))`; setup file
  `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` (`cloudflare:test`), `env` from
  `cloudflare:workers`. Storage is isolated per test file, shared by the tests in a file: give
  every test its own ids. The project name comes from `test.name`.
- Types: tsconfig `types: ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types"]`;
  bindings typed by merging into `Cloudflare.Env` (`src/testing/env.d.ts`).
- Struct decoding ignores excess keys, so `SELECT *` (with `server_seq`) decodes via `XRow`.

## Migrations (S2-T1)

- Schema change: edit `src/schema/*.ts`, then `pnpm -F @tanren/db generate --name <slug>` (drizzle-kit
  0.31.11 writes `migrations/NNNN_<slug>.sql` + `meta/*.json`). It expresses expression and partial
  unique indexes (`lower(name)`, `WHERE deleted_at IS NULL`) itself; use `--custom` only if it cannot.
  Never hand-edit a generated migration or `meta/`; add a new one.
- Apply locally from `apps/worker`: `wrangler d1 migrations apply tanren --local`
  (`wrangler.jsonc` binds `DB`, `migrations_dir: ../../packages/db/migrations`).
- `migrations/` is Biome-ignored (generated SQL + meta JSON); the Drizzle files in `src/schema` are not.
- `pnpm-workspace.yaml` `allowBuilds` (esbuild, workerd) lets their postinstall run; without it
  `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`. Add a package there only when it has a native postinstall.

## Commands

`pnpm -F @tanren/db check` (package gate: biome → typecheck → workerd tests) · `pnpm -F @tanren/db generate`
(drizzle-kit) · `pnpm -F @tanren/db test` (workerd, ~5 s)

## Status

Step 2 (2026-10-20): schema + migration 0000, D1Layer, sync clock, Profile/Exercise/Plan/Session repos (44 workerd tests), deterministic seed (`pnpm db:reset` → 16 sessions / 276 sets for the dev user). Migration 0001 = Better Auth tables (camelCase columns, uuid ids, ISO text timestamps; never sync). SyncStore (atomic push → per-change rejection, cursor pull across 8 tables; 61 workerd tests). Worker consumes it since INT-1.
