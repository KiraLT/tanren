# v3 — equipment & locations: one vocabulary, locations in the profile, Settings/Library/Today surfaces, MCP
Source: owner request 2026-10-21 10:50 · Status: building · Updated: 2026-10-21 · Baseline commit: 242f4e4
Design: `docs/design/equipment.md` (normative; §1 Taxonomy frozen 10:52) · ADR-0016 (accepted, Lead delegation)

## Decisions
- ADR-0016 One equipment vocabulary; locations in the profile row — accepted (Lead delegation)
- D1 `get_profile` is a 6th read tool (not an overview block) — accepted (Lead delegation); mcp.md counts 6/3/9
- D2 Legacy `equipment` column stays NOT NULL, always `'[]'`; no DROP COLUMN — accepted (Lead delegation)

## Tasks
| id | title | role / model | depends on | files (exclusive) | time box | status |
| --- | --- | --- | --- | --- | --- | --- |
| EQ-C | Catalog growth: ≥ 50 machine/cable/Smith entries, retag `machine` per §1, literal list in `taxonomy.ts` | engineer / sonnet | §1 frozen | `packages/shared/src/catalog/taxonomy.ts` (literal list + `EQUIPMENT_KIND` rows only), `catalog/data/*.ts`, `catalog/catalog.test.ts`, `catalog/taxonomy.test.ts` | 45 min | in flight |
| EQ-1 | Shared + db + worker: `Location`, profile fields, delete `EquipmentKind`, presets, availability, migration 0003, `get_profile`, `availableAt` | engineer / opus | EQ-C reported | `packages/shared/src/{ids,user,row,mcp,dataExport}.ts` (+tests), `packages/shared/src/catalog/{taxonomy.ts (delete EQUIPMENT_KIND/equipmentKindFor + its test), presets.ts, availability.ts, index.ts}` (+tests), `packages/db/src/schema/user.ts`, `packages/db/migrations/0003_locations.sql` + `meta/`, `packages/db/src/seed/month.ts`, `packages/db/src/repositories/Profile.ts` (+test), `packages/db/src/testing/fixtures.ts`, `apps/worker/src/mcp/{tools,writeTools,server}.ts` (+tests), `docs/design/mcp.md` §3–5 | 60 min | todo |
| EQ-2 | Mobile: `ProfileRepo`, store v3, Settings section + location editor, Library "At location" + "Needs", Today setup card, INT-X3 message | engineer / opus | §2–6 names (may start now; "own files green + foreign reds listed" until EQ-1 lands) | `apps/mobile/src/store/migrations.ts` (+test), `apps/mobile/src/services/ProfileRepo*.ts`, `apps/mobile/src/services/runtime.ts` (one layer line), `apps/mobile/src/hooks/useProfile.ts`, `apps/mobile/src/components/settings/{EquipmentSection,LocationEditor}.tsx`, `locationsState*.ts`, `apps/mobile/src/components/TodaySetupCard.tsx`, `TodayReady.tsx` (card slot), `apps/mobile/app/settings.tsx`, `apps/mobile/app/settings/location/[id].tsx`, `apps/mobile/src/library/{searchState*.ts,CatalogFilterBar.tsx,CatalogDetail.tsx,catalogFormat*.ts}`, `apps/mobile/CLAUDE.md` §settings/§library lines | 75 min | todo |
| EQ-I | Illustrations for EQ-C's new entries: `pnpm images:generate` → `images:shrink` → `images:map`; confirm skip-existing (generateIllustrations.ts:57 `existsSync`) and the RUN_CAP (`--all` if > cap) | engineer / sonnet | EQ-C reported | `apps/mobile/assets/exercises/**`, `apps/mobile/src/illustrations/generated/**` | 30 min (+ API wall time) | todo |
| EQ-R | Cross-package review: schema/row/migration consistency, legacy column encode, MCP counts, tests per §7, Biome/functional rules | reviewer / opus | EQ-1, EQ-2, EQ-I | read-only | 25 min | todo |
| EQ-X | Owner-recipe proof (`ui-check`): Settings → add Gym + Home → set Home active → Library shows "At Home", Leg Press hidden, toggle shows it with "Needs: legPress"; Today card gone after setup; `search_exercises {"availableAt":"active"}` via curl on the dev worker | qa / sonnet | EQ-R clean | none (writes `docs/tasks/v3-equipment.md` Log only) | 20 min | todo |

Parallel groups: {EQ-C} → {EQ-1, EQ-I} with EQ-2 overlapping from now (foreign reds allowed until EQ-1) → EQ-R → EQ-X.
`taxonomy.ts` owner: EQ-C until it reports, then EQ-1. Nobody else edits it.

## Frozen contracts
- `CatalogEquipment` literal list and groups: design §1 (36 literals, `machine` removed).
- `Location`, `LocationId`, `ProfileFields.locations/activeLocationId`, `EQUIPMENT_GROUPS`, `LOCATION_PRESETS`, `isAvailableWith`, `missingEquipment`, `activeLocation`, `CatalogFilter.availableEquipment`: design §2, §4.
- Migration 0003 SQL and mobile store v3: design §3.
- `get_profile`, `SearchExercisesInput.availableAt`, `MCP_TOOLS` order (read slice 6): design §5.

## Assumes (cited)
- `addCatalogToToday` returns `false` when the exercise is already in today's session (apps/mobile/src/services/addCatalogToToday.ts:13 `Effect<boolean, …>`; INT-X3 finding).
- The illustration pipeline skips ids that already have a file (apps/mobile/scripts/generateIllustrations.ts:57).
- Profile sync is whole-row (packages/shared/src/sync.ts:34; ADR-0016 §Decision 2).

## Done-criteria
### EQ-C
- [ ] ≥ 50 new entries tagged only with §1 literals; `machine` absent from `taxonomy.ts` and all data; `EQUIPMENT_KIND` has a row per literal (EQ-1 deletes it later); `pnpm check` green; report lists the Machine Lateral Raise decision (§1 VERIFY).
### EQ-1
- [ ] `EquipmentKind`, `Equipment`, `equipmentKindFor`, `EQUIPMENT_KIND` gone (`grep -rn` finds nothing outside docs); `Location`/`LocationId`/new `ProfileFields` exactly per §2; filters' issue paths tested.
- [ ] `ProfileRow` round-trip emits `equipment: "[]"`; the report states which §2 option was used.
- [ ] `0003_locations.sql` matches §3 byte-for-byte except drizzle-kit whitespace; snapshot + journal updated; db tests pass on a fresh D1; seed has Gym + Home, active Gym.
- [ ] `get_profile`, `availableAt`, `update_profile` description; `MCP_TOOLS` read slice 6; mcp.md counts 6/3/9 + wire example; tests per §7.
- [ ] `pnpm check` green.
### EQ-2
- [ ] Store v3 applies on a v2 database (test); `ProfileRepo.save` creates with device tz and marks dirty (test); `locationsState` reducer tested per §6.
- [ ] Settings shows "Equipment & locations" with presets, editor route works; Library "At <name>" chip default on, "Needs: …" on detail; Today setup card until a location exists; "Already in today's session" message on duplicate add.
- [ ] Every UI import from `src/ui` barrel; tokens only; both widths; `pnpm check` green (foreign reds listed if EQ-1 not landed).
### EQ-I
- [ ] Every new catalog id has a 512 px webp and a `generated` map entry; validator passes; assets diff ≤ EQ-C count × 60 KB; no `.env*` read by the engineer (the script reads its own key).
### EQ-R
- [ ] Reviewer report: zero blocking; each §7 test present; Biome plugins clean; mcp.md and equipment.md consistent with code.
### EQ-X
- [ ] ui-check transcript of the recipe above pasted into the Log; curl output with ≥ 1 result and 0 `legPress` entries when Home is active.

## Log
- 2026-10-21 10:52 · architect: §1 Taxonomy frozen; EQ-C tagging against it
- 2026-10-21 10:57 · architect: design §2–7, ADR-0016, this sheet created
- 2026-10-21 11:01 · EQ-C: +56 catalog entries (235 → 291; legs 44, core 37, arms 33, back 32, chest/hips 29, shoulders 26, cardio 18), `machine` literal removed, 24 former `machine` entries + 3 pulldowns + 3 rack lifts retagged, 36 literals per §1; `pnpm check` green (114 files, 1178 tests); one worker test limit widened
- 2026-10-21 11:04 · EQ-2: shared additive landed — `LocationId`, `Location`, `Locations`, `ProfileFields.locations/activeLocationId` (decode default `[]`/None for a missing key + constructor defaults, `Exercise.catalogId` pattern, so fixtures/seed/worker compile unchanged; EQ-1 may drop the defaults), Profile = `Schema.Class(Struct.check(uniqueLocationIds, activeLocationExists))` (Session pattern, paths tested), `ProfileRow.locations` (json) + `activeLocationId` (nullable text), `catalog/presets.ts`, `catalog/availability.ts`, `CatalogFilter.availableEquipment`; `equipment`/`EquipmentKind` untouched. **D1 profile writes/reads need migration 0003** (ROW_KEYS.profile now has both columns); shared gate 288 tests green, workspace typecheck clean; dataExport.test fixture +2 keys
- 2026-10-21 11:08 · EQ-2 (time box, partial): mobile store v3 (+test), `ProfileRepo` (+test, `ProfileInvalid`, runtime line), `locationsState` (+test), `searchState.atLocation`/`toFilter(state, active)` (+test) done; UI (useProfile, EquipmentSection, LocationEditor, route, FilterBar chip, Detail "Needs", TodaySetupCard), "Already in today's session" and ui-check not started. Finding: `TodayRepo.addExercise` returns `true` for a duplicate and `false` for **no session** (TodayRepo.ts:361-379), so the sheet's §Assumes is wrong; the message needs a 3-way result there
- 2026-10-21 11:09 · EQ-I: +57 webps = 56 new entries + frog-pump (233 -> 290 of 291; only `cable-crunch` still refused, `frog-pump` now generated via its NAME_OVERRIDES, `cable-shrug` needed a name + wording override), `images:shrink` 57 shrunk (4.60 -> 2.56 MB), assets 3.1M, `images:map` 290; mobile gate red only in EQ-2 file `DataExport.test.ts`
- 2026-10-21 11:12 · EQ-2a: useProfile landed — `apps/mobile/src/hooks/useProfile.ts` `useProfile(): Option.Option<Profile>` (re-read on every StoreEvents bump; failed read keeps last value); mobile tsc clean
- 2026-10-21 11:16 · EQ-2a: Settings side done — `EquipmentSection` (between Account and Appearance), `LocationEditor` + route `/settings/location/[id]`, `useLocations` over `applyLocations`/`addPresetLocation` (in locationsState.ts, +4 tests); smoke at 390 on an isolated dev server (:8188, signed out, local store): Add home → editor (Dumbbell/Kettlebell/Bench/Pull-up bar/Band checked) → rename Garage → Barbell checked → Add gym → Set active → list "Edit Garage" / "Edit Gym, active", survives reload, `ab errors` empty; `pnpm -F @tanren/mobile check` green (60 files, 537 tests)
- 2026-10-21 11:19 · EQ-2b: `TodayRepo.addExercise` → `AddExerciseResult` "added" | "alreadyPlanned" | "noSession" (tests for all three), consumers matched exhaustively; Library "At <name>" chip (checkbox, on by default, hidden without active location), detail "Needs: …" muted line, "Added" / "Already in today's session" muted notice (3 s, stays on the detail instead of navigating to Today), `TodaySetupCard` on Today while no location; facet overrides for `assistedPullUpMachine`/`gluteHamDeveloper`; root `images:shrink`; imagePrompt comments. Smoke at 390 (:8097 dev server, signed out): card → /settings → Add home → Library chip "At Home" checked 116 exercises, off → 291; leg-press detail "Needs: Leg press"; add twice → "Added" then "Already in today's session", gone after 3 s; Today without the card, Dumbbell Bench Press appended. `pnpm -F @tanren/mobile check` green (60 files, 537 tests)
