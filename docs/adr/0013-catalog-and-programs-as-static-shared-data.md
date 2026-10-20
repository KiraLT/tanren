# ADR-0013: Exercise catalog and built-in programs as static typed data in `packages/shared`, not DB rows

Date: 2026-10-21 · Status: **accepted** (Lead decision under owner delegation, 2026-10-21; plan Amendment 4) · v2 · Author: architect (designs: `docs/design/v2-catalog.md` §1–3, `docs/design/v2-programs.md` §1–2)

## Context

Amendment 4 asks for "all possible exercises in the gym with images" and a guided "Core 30"
program. The plan's data model has user-owned `exercise` rows (names + aliases + muscle groups,
synced, `userId` on every row) and `plan*` tables written by Claude through MCP. A 200–250 entry
catalog with illustrations and a 30-day program definition are reference data: identical for every
user, edited by commit, needed offline on first launch and by the MCP server and the Library
screen alike. Putting them in D1 would need admin writes, a sync path for non-user rows, and an
initial pull before the Library works.

## Decision

1. `CATALOG: ReadonlyArray<CatalogExercise>` (ten per-muscle-group data modules, `catalogId`
   slugs, `kind` reps|timed|distance per ADR-0007, muscles from the existing `MuscleGroup`, a new
   `CatalogEquipment` union, 2–4 instruction lines, `illustrationId`) and `PROGRAMS`
   (`Program` → `ProgramDay` → `ProgramItem`, `CORE30`) are typed constants in
   `packages/shared`, validated by tests in `pnpm check` (unique ids/names, taxonomy membership,
   Core 30 ids present as `timed`). The illustrations validator in `apps/mobile` checks that every
   `illustrationId` has a composed SVG and vice versa.
2. User `exercise` rows gain an optional `catalogId` (shared field, D1 column, mobile store column);
   `ExerciseLink.ensure(catalogId)` finds or creates the user's row. Users keep free-form names.
3. Program **progress** is user data and is synced: `programEnrollment` and `programDayCompletion`
   join `EntityName`/`SyncTable`/`SyncChange` after `set`, with LWW per data-model.md §10.2;
   completing a day logs an ordinary `session` + `set`s (`reps` = seconds for timed items).
4. One migration `0002_v2.sql` carries `exercise.catalog_id` and both tables; one engineer
   (V2-F1) owns `packages/db/migrations` for the step.
5. `search_exercises` is a read-scope MCP tool over `CATALOG` with zero D1 statements.

## Consequences

- No catalog table, endpoint or sync; a catalog or program change is a release (EAS Update / web
  export), which is acceptable for a single owner. The JS bundle grows by the data plus ≈ 1.2 MB
  of SVG strings; a budget check is part of the illustrations validator.
- Renaming a `catalogId` is a data migration for `exercise.catalog_id` (same rule as ADR-0007 §1
  for enum members); adding entries is additive.
- Team ports for the v2 wave (recorded here so the sheets agree): extras (part of team design)
  `wrangler dev` 8793 / web 8795; programs 8798 / 8799; catalog 8797 / 8796.
- Sheets: `docs/tasks/v2-catalog.md`, `docs/tasks/v2-illustrations.md`, `docs/tasks/v2-programs.md`.

## Alternatives considered

- Catalog rows in D1 synced like `exercise`: needs an admin writer and a first pull before offline
  use; duplicates 250 rows per user or breaks the "every row has `userId`" rule. Rejected.
- Per-user copies of the catalog on sign-up: duplication, no shared `catalogId` for MCP. Rejected.
- Programs as `plan` → `planWeek` rows written by a built-in generator: conflates Claude's plan
  with a fixed program and loses `rounds`/`seconds`/rest semantics. Rejected; a program day
  still produces a normal `session`, so history is unified.
- Metro `.svg` transformer for illustrations: unverified web parity; `SvgXml` strings chosen
  (v2-catalog.md §5).

Not decided here: per-user custom catalog entries; localisation; programs beyond Core 30.
