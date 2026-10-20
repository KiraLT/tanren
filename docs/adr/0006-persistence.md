# ADR-0006: Persistence — Drizzle for schema and migrations, `effect/sql` for queries

Date: 2026-10-20 · Status: **accepted** (Lead decision under owner delegation, 2026-10-20; plan Amendment 3) · Step 2 · Author: architect

Decision confirmed 2026-10-20: already built on; the root gate (`pnpm check`) is green at 307 tests with Drizzle-generated migrations and `effect/sql` repositories in `packages/db` and `apps/worker`.

## Context

The plan names `@effect/sql-d1` + `@effect/sql-drizzle`. Under Effect 4.0.5 (ADR-0004)
`@effect/sql-d1@4.0.5` exists but `@effect/sql-drizzle` has no v4 build (peers `effect ^3.22`,
`drizzle-orm <0.50`). Drizzle 1.0-rc ships `drizzle-orm/effect-d1`, but it is undocumented and, on
the `rc` tag (1.0.0-rc.4), crashes at module load with effect 4.0.5 (`Schema.TaggedErrorClass` no
longer exists); it worked only on the preview build `1.0.0-rc.5-5935859`
(`docs/research/2026-10-19-cloudflare-core.md` §0.2, §3). Drizzle stable is 0.45.4 / kit 0.31.11.
Option (a), Drizzle for schema only plus `effect/sql` + `D1Client` for queries, ran end to end in a
spike on Effect 4.0.5.

## Decision

1. **Table definitions** in Drizzle `sqlite-core` (`drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`,
   exact pins in the pnpm catalog). Drizzle is a schema DSL and migration generator only; no Drizzle
   query builder or Drizzle runtime in repositories.
2. **Migrations**: `drizzle-kit generate` → flat `packages/db/migrations/NNNN_name.sql`, applied
   with `wrangler d1 migrations apply tanren --local` (tracked in `d1_migrations`). Hand-written SQL
   goes through `drizzle-kit generate --custom`; never `wrangler d1 migrations create`, never
   `drizzle-kit push/migrate`.
3. **Queries**: `effect/sql` (`SqlClient` tagged templates, `SqlSchema.findAll/findOneOption`)
   over `D1Client.layer` from `@effect/sql-d1@4.0.5`, with hand-written SQL; rows decode through
   Effect Schema row codecs defined in `@tanren/shared`. Multi-statement writes use
   `D1Client.batch` (a D1 batch is one SQL transaction), never `withTransaction`.

Reason (3 sentences): Option (b) is undocumented and broken on its published `rc` tag with our
pinned Effect, so adopting it would tie the project to a preview build. Option (a) uses only
released, pinned packages and decodes rows with the same schemas as the wire, so there is one source
of truth for every shape. The SQL we need is small (user-scoped reads, upserts, one pull query), so
a query builder buys little.

## Consequences

- Drizzle tables and the shared schemas are two descriptions of one row; a test in `@tanren/db`
  checks that every table's columns match its row codec's keys (drift fails the gate).
- SQL strings are not type-checked; every repository method has a test against a real local D1.
- Better Auth (step 3) can still use its Drizzle adapter or built-in D1 adapter; its tables are
  generated into `src/schema/auth.ts` and migrated the same way.
- Revisit when Drizzle 1.0 is GA with a documented `effect-d1` driver.

## Alternatives considered

- (b) `drizzle-orm@rc` `effect-d1`: rejected for now (above).
- `@effect/sql-drizzle` on Effect 3: would undo ADR-0004.
- `effect/sql` `Migrator.fromRecord` instead of drizzle-kit: no D1 migrator ships in
  `@effect/sql-d1`; wrangler's migration tracking is the supported path on D1.
- `SqlModel.makeRepository`: needs `Model.Class` from unstable `effect/schema`, a second entity
  definition style beside `Schema.Class`; not adopted.

Not decided here: the Better Auth adapter choice (step 3).
