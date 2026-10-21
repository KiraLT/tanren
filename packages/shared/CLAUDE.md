# @tanren/shared

The vocabulary of the whole system: Effect Schemas for every entity, branded
IDs, domain errors, and the sync protocol types. Both `apps/worker` and
`apps/mobile` import from here; `packages/db` maps these schemas to tables.

**Normative design: `docs/design/data-model.md`** (fields, wire shapes,
constraints, derivation pattern, sync envelope, invariants, test
expectations). Implement it verbatim; propose changes through the Lead.

## Boundaries

- Runtime dependency: `effect` only. No React, no Cloudflare, no Drizzle,
  no Node built-ins. Must run unchanged in Workers, Expo (Hermes) and web.
- Exports only through `src/index.ts` (and sub-paths listed in
  `package.json#exports`). No deep imports from other packages.
- Pure: no I/O, no `Date.now()` / `Math.random()` outside explicitly injected
  services. Schemas, constructors, and pure functions only.

## Layout

```
src/
  index.ts            barrel: re-exports every module below
  ids.ts              branded UUIDs: UserId, ExerciseId, PlanId, PlanWeekId,
                      PlannedSessionId, PlannedSetId, SessionId, SetId;
                      IdGenerator service (live: crypto.randomUUID; test: seeded)
  common.ts           Timestamp = Schema.DateTimeUtcFromString (DateTime.Utc in
                      TS, ISO string on the wire), LocalDate, Label/Note/Text
                      (trimmed, bounded), Rpe (1–10 step 0.5), WeightKg (0.25
                      steps), Reps (int ≥ 0), OrderIndex, Weekday, EntityName,
                      SyncTable, ROW_COLUMNS + rowFields(IdSchema)
  user.ts             User, Profile (goals, constraints, availableDays, locations + activeLocationId,
                      ADR-0016; the row codec keeps the legacy `equipment` column, always "[]")
  exercise.ts         Exercise (name, aliases, muscleGroups), MuscleGroup union
  plan.ts             Plan, PlanWeek, PlannedSession, PlannedSet
  currentPlan.ts      CurrentPlan: active plan + live weeks/sessions/sets (GET /plans/current, MCP)
  session.ts          Session, WorkoutSet (weight, reps, rpe, note, plannedSetId?)
                      — never `Set`: it shadows the global and Biome rejects it
  sync.ts             SyncChange union discriminated on `table`, PushRequest /
                      PushResponse, PullRequest (opaque SyncCursor) / PullResponse
  row.ts              DB row codecs (XRow: DB record ↔ entity), ROW_TABLE, ROW_KEYS
  testing.ts          test-only helpers (not exported): accepts/rejects/failingPaths/roundTrips/wireRoundTrips
  errors.ts           Schema.TaggedError types shared across tiers, each with
                      httpApiStatus (NotFound 404, Forbidden 403,
                      ValidationError 400, SyncConflict 409)
  *.test.ts           colocated tests (decode/encode round-trips, brands)
```

## Conventions

- One file per aggregate. Entity schema named after the entity
  (`Session`), its ID in `ids.ts`, create input `SessionInsert` derived with
  `Session.mapFields(Struct.omit(ROW_COLUMNS))` (re-attach struct checks).
  A patch (`SessionPatch`) is never derived: it is an explicit
  `Schema.Struct` of `Schema.optionalKey(<bare field schema>)` entries, and
  its test asserts `{}` decodes to zero keys. A derived patch keeps every
  decoding default (`withDecodingDefaultKey`, `OptionFromOptionalNullOr`),
  so `{ name }` decoded with `catalogId: None` / `locations: []` and every
  `update_profile` / exercise patch wiped those columns (v3: ProfilePatch
  fixed in 229fbdb, ExercisePatch in EQ-F3). Domain code builds instances
  with `Session.makeEffect(...)`; `new Session(...)` only in tests and
  fixtures.
- Catalog size: `catalog/catalog.test.ts:90` caps `CATALOG` at 285–300 (291
  after v3); raise the cap in the brief that adds entries.
  `apps/worker/src/mcp/tools.test.ts:305` ranks the query "row" with
  `limit: 500` and couples to catalog size.
- Every row-like schema includes the sync columns: `id`, `userId`,
  `createdAt`, `updatedAt`, `deletedAt: Option`. Use `Schema.OptionFromNullOr`
  at the boundary so JSON carries `null` and TypeScript carries `Option`.
- Unions are discriminated on `_tag` or `type` and matched exhaustively.
- Export the inferred type beside the schema: `export type Session = typeof
  Session["Type"]` (and `["Encoded"]` when the wire shape differs).
- Follow `.claude/skills/effect-conventions/SKILL.md`; every snippet there
  compiled under Effect 4.0.5 and TypeScript 7.0.2.

## Commands

`pnpm -F @tanren/shared test` · `pnpm -F @tanren/shared typecheck`

## Status

Step 1 complete (2026-10-20): all modules implemented per `docs/design/data-model.md`, 116 tests, reviewed. Test helpers live in `src/testing.ts` (not exported).
