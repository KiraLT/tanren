# v2 — team catalog: exercise catalog data, validation, `ExerciseLink`, Library screen, `search_exercises`
Source: docs/plan.md Amendment 4 · Status: planning · Updated: 2026-10-21 · Baseline commit: the Lead's post-step-5 commit
Design: `docs/design/v2-catalog.md` (normative) · UI tokens: `docs/design/design-system.md` + `apps/mobile/src/ui/**` (design architect) · starts after **V2-F1 and V2-F2** (team programs, `docs/tasks/v2-programs.md`) have reported.

## Team charter: catalog
Mission: `CATALOG` (200–250 typed exercises in ten data modules) ships in `@tanren/shared` with a validation test; user exercises link to it (`ExerciseLink`); the Library tab searches and filters it offline, shows the illustration + instructions and adds an exercise to today's session; Claude searches it with `search_exercises`.
Owned paths (exclusive): `packages/shared/src/catalog/**` except `taxonomy.ts` (F1's; additive edits announced), `packages/db/src/seed/catalog.ts` names/aliases only (keys were set by F1), `apps/mobile/src/services/ExerciseLink*.ts`, `apps/mobile/src/services/TodayRepo.ts` (add-from-catalog path only, announced), `apps/mobile/src/hooks/useCatalogSearch.ts`, `apps/mobile/src/library/**`, `app/(tabs)/library.tsx`, `app/library/**`, `apps/mobile/CLAUDE.md` §library. After the Lead's "mcp-oauth reported": `packages/shared/src/mcp.ts` (+test) additions and `apps/worker/src/mcp/tools.ts` + `tools.test.ts` + `server.ts` registration for `search_exercises`.
Adjacent with owners: `apps/mobile/src/illustrations/**`, `apps/mobile/assets/exercises/**`, `scripts/illustrations.ts` — team illustrations (`ExerciseIllustration.tsx` imports `ILLUSTRATIONS` from `../illustrations/generated`; until it exists, import a local empty map and announce). `runtime.ts` — one `ExerciseLink.layerNoDeps` line (MOBILE-2 owns `failureMessage`; programs adds its own line). `_layout.tsx`, `package.json` deps, `migrations.ts` — V2-F2 (done before start). `src/mcp/**`, `mcp.ts` — mcp-oauth until it reports. `packages/db/src/repositories/**` — mcp-oauth; catalog never edits (D1 insert of `catalog_id` flows through `ROW_KEYS`, **VERIFY** in C2's seed test).
Provides: `CATALOG`, `CATALOG_BY_ID`, `searchCatalog`, `CORE30_CATALOG_IDS`, `CatalogExercise`; `ExerciseLink` port (programs P5); `ExerciseIllustration` component (programs P4); `search_exercises` tool.
Assumes (cross-team, cited):
- programs/F1: `catalog/taxonomy.ts` exports `Slug`, `CatalogId`, `IllustrationId`, `ExerciseKind`, `CatalogEquipment`, `MovementPattern`, `equipmentKindFor` (v2-catalog.md §2); `exercise.catalogId` exists in shared, D1 and the mobile store (v2-catalog.md §4, v2-programs.md §2); barrel line `export * from "./catalog"` exists.
- programs/F2: `react-native-svg` installed; `app/(tabs)/library.tsx` stub + tab exist (v2-programs.md §6).
- illustrations: `apps/mobile/src/illustrations/generated/index.ts` exports `ILLUSTRATIONS: Readonly<Record<IllustrationId, string>>` (v2-catalog.md §5); its validator, not ours, checks SVG coverage.
- design: `apps/mobile/src/ui/**` primitives and tokens exist when C4 starts (design-system.md); `Screen` keeps `aside` (expo-mobile skill).
- mcp-oauth: `readTools`/`registerTool` pattern of mcp.md §4 + cloudflare-workers skill unchanged; C5 appends, removes nothing.
Runtime proof (C4 and once before the team report): `pnpm -F @tanren/worker exec wrangler dev --port 8797 &` → `EXPO_PUBLIC_API_URL=http://localhost:8797 pnpm web:export` → serve on **8796** → `ui-check`: `/library`, type "ohp", open Overhead Press (illustration or placeholder visible, 2–4 instruction lines), filter muscle=core, "Add to today's session" → `/today` lists it; both widths. C5: `tools/call search_exercises {"query":"row"}` via curl on 8797 returns ≥ 3 results.
Docs: `apps/mobile/CLAUDE.md` §library (team-lead) · `docs/design/mcp.md` §3 tool list + one wire example (C5) · corrections to v2-catalog.md through the team-lead with a Log line.
Budget: ≤ 3 engineers in parallel · one reviewer for the team (after C4; C5 delta if later) · ≤ 2 review rounds · target ≤ 110 min wall-clock.
Forbidden: never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine. Ports other than 8796/8797. Renaming/removing a `MuscleGroup` member (ADR-0007: additive only). Editing illustrations, programs, MOBILE-2 or mcp-oauth paths before their gates.
Report: team report format from `.claude/agents/team-lead.md`; list announced one-line edits.

## Decisions
- D1 Catalog is static typed data in `packages/shared`, not DB rows; user rows link by optional `catalogId` — accepted (Lead delegation); ADR-0013.
- D2 Muscles reuse `MuscleGroup`; equipment is a new catalog-specific union mapped to `EquipmentKind` — accepted (Lead delegation).
- D3 `illustrationId` defaults to `catalogId`; coverage checked by the illustrations validator — accepted (Lead delegation).
- D4 `search_exercises` is a read-scope tool with 0 D1 statements — accepted (Lead delegation).

## Tasks
| id | title | role/model | group | files | depends on | done when |
| --- | --- | --- | --- | --- | --- | --- |
| V2-C0 | `CatalogExercise`, `core30Ids.ts`, `index.ts` builder + `searchCatalog`, `catalog.test.ts` harness (bounds relaxed to ≥ 0 until data lands), `data/` skeleton with ten empty modules | engineer/opus | A | `shared/src/catalog/**` | F1 | `pnpm -F @tanren/shared check` green; test enforces rules 2–5 of §2 on whatever data exists |
| V2-C1a…j | data module `<group>.ts` per §3 table (ten tasks; ≤ 3 at once) | engineer/sonnet | A (after C0) | one `data/<group>.ts` each | C0 | module decodes, ≥ 12 entries, no dup across catalog (`pnpm -F @tanren/shared test`) |
| V2-C2 | seed names/aliases aligned with catalog; `catalog.test` bounds set to 200–300; `catalogId` round-trips through D1 `ROW_KEYS` (workerd test) | engineer/sonnet | B | `seed/catalog.ts`, `catalog.test.ts`, one workerd test in `packages/db` | all C1 | root `pnpm check` green |
| V2-C3 | `ExerciseLink` service + runtime line + node:sqlite tests | engineer/opus | A (∥ C1; first dispatch, programs P5 waits on it) | `services/ExerciseLink*.ts`, runtime line | F1, F2 | three branches of §4 tested (by catalogId, by name/alias → patch, insert) |
| V2-C4 | Library tab: search/filter/detail/add; `ExerciseIllustration` with placeholder; two-column aside | engineer/opus | B (after design foundation) | `app/(tabs)/library.tsx`, `app/library/**`, hooks, components | C0, C3, design foundation | ui-check proof per charter on :8796 |
| V2-C5 | `search_exercises`: shared schemas, `MCP_TOOLS`, worker tool + tests, mcp.md §3 | engineer/sonnet | C (after Lead's "mcp-oauth reported") | `mcp.ts`, `mcp.test.ts`, `src/mcp/{tools,server}.ts`, tests, `docs/design/mcp.md` | C2, mcp-oauth | curl proof; `tools/list` shows 8 tools for read scope |
| V2-REV | one reviewer | reviewer/opus | after C4 (delta after C5) | diff of owned paths | — | APPROVE |

## Done-criteria (team)
- `CATALOG.length` 200–300; validation test green; every `CORE30_CATALOG_IDS` present as `timed`.
- Library proof pasted; "Add to today" creates an `exercise` row with `catalogId` (dirty) and it appears on Today.
- `search_exercises` served and documented; root `pnpm check` green.

## Frozen contracts
v2-catalog.md §2 schemas and `searchCatalog`, §3 module table + `CORE30_CATALOG_IDS`, §4 `ExerciseLink`, §5 `ILLUSTRATIONS` map + `ExerciseIllustration` props, §6 tool schemas.

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`
- 2026-10-21 · created from architect breakdown

## Briefs (each adds the charter's Forbidden line and `Report: engineer format, gate output pasted`)
### V2-C0 (opus, Time box 30 min)
Read v2-catalog.md §1–3. Load `effect-conventions`. Write `catalog/CatalogExercise.ts` (fields, two struct checks), `catalog/core30Ids.ts` (the frozen 24 ids as `const` + `CORE30_CATALOG_IDS: ReadonlyArray<CatalogId>`), `catalog/data/{chest,back,shoulders,arms,legs,hips,core,fullBody,cardio,mobility}.ts` each exporting an empty typed array with a header comment naming its scope and id rule, `catalog/index.ts` (build `CATALOG` by decoding specs once; `CATALOG_BY_ID`, `findCatalogExercise`, `searchCatalog` ranking per §2), `catalog.test.ts` (rules 2–5; rule 1 and "≥ 12 per module" asserted only when the module is non-empty — C2 tightens). Add 3 sample entries in `core.ts` (`plank`, `side-plank`, `dead-bug`) so search tests run. Done: `pnpm -F @tanren/shared check` green, pasted.
### V2-C1<x> (sonnet, Time box 15 min each) — template
Read v2-catalog.md §2–3 and `catalog/data/core.ts` as the example. Fill `data/<group>.ts` with the §3 scope and count (±3), id rule, 2–4 instructions each, aliases with common gym synonyms, `kind` per §2 (`timed` for holds/mobility, `distance` for cardio distance work), `equipment` from `CatalogEquipment` (empty = bodyweight). Run `pnpm -F @tanren/shared test`; fix duplicates the test reports (another module may already own a name — rename yours with the implement prefix, never edit theirs). Done: test green for your module, count in the report.
### V2-C2 (sonnet, 20 min) — align `seed/catalog.ts` names/aliases with the catalog entries (keys fixed by F1); set `catalog.test` bounds; workerd test in `packages/db` that an inserted exercise with `catalogId` round-trips through `SyncStore` pull. Root `pnpm check`.
### V2-C3 (opus, 30 min) — v2-catalog.md §4 service with `layerNoDeps`; the three branches; dirty-marks; `StoreEvents` emit; one `AppLayer` line in `runtime.ts` (announce). node:sqlite tests via `SqlDriver.testing`.
### V2-C4 (opus, 45 min) — v2-catalog.md §7; `ExerciseIllustration` (`SvgXml`, placeholder when id missing; **VERIFY** `SvgXml` on web); `useCatalogSearch` 150 ms debounce; filter chips from `MuscleGroup`/`CatalogEquipment`; detail route; "Add to today" via `ExerciseLink.ensure` + TodayRepo add path; load `frontend-design:frontend-design`, `expo:expo-router`; ui-check proof both widths on :8796.
### V2-C5 (sonnet, 25 min, gated on "mcp-oauth reported") — v2-catalog.md §6; follow the `readTools` pattern and the cloudflare-workers skill (encoded Standard Schema input, `readOnlyHint`, 0 statements comment); tests in `tools.test.ts` + `mcp.test.ts`; `docs/design/mcp.md` §3 list + wire example; curl proof on 8797.
