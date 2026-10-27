# Team nutri-food: quick-add + food log + Settings → Nutrition (v6, ADR-0025)
Status: DONE 15:41 (GO 15:07; 34 of 60 min) · team-lead opus · Lead sheet `docs/tasks/v6-nutrition.md`
("Team nutri-food", normative) · Design `docs/design/nutrition.md` §1, §4, §6, §7 · Forge `docs/design/ui-direction-final.md`, `docs/design/ui-polish.md`
Ports (probed 14:50, all free: `ps -ef | grep "port 903"` empty, curl 000): **N-Q1 web 9033** · **N-Q2 web 9035** · **N-Q2S worker 9034
(inspector 9534) + web 9035**. Never 8787/8790/8081/8991/9011/9012/9021/9031/9032.

Mission: quick-add sheet (`/health/add`, local `QUICK_ADD` catalog only, no external API in v1), `FoodLog` list with delete +
15 s Undo (pure component; nutri-today mounts it in `/health` at INT-N), Settings → Nutrition & goals (goal, body data,
derived targets from `nutritionTargets` with manual overrides winning, eat-back switch when Garmin is connected, Turn off).

Owned (charter): `apps/mobile/app/health/add.tsx`, `apps/mobile/app/settings/nutrition.tsx`, `apps/mobile/app/settings.tsx` (one row),
`apps/mobile/src/components/health/{FoodLog,QuickAddSheet}.tsx`, `apps/mobile/src/components/settings/{NutritionSection.tsx,nutritionCopy.ts,
nutritionCopy.test.ts}`, `apps/mobile/app/_layout.tsx` (modal `presentation` line for `health/add` only), `apps/mobile/CLAUDE.md` (our lines, team-lead).
Asked at HOLD (interim 14:58; see Decisions D1–D2): `src/components/health/{quickAddSheet,quickAddSheet.test,foodLog,foodLog.test}.ts`
instead of `{QuickAddSheet,FoodLog}.test.tsx`; new `src/hooks/useAddFood.ts`; new `src/components/settings/{nutritionSettings,
nutritionSettings.test,useNutritionSettings}.ts`.
Adjacent: nutri-today (`app/health.tsx`, `src/services/{FoodEntryRepo,NutritionRepo}.ts`, `src/hooks/useNutrition*.ts`,
`src/services/runtime.ts` layer lines, `iconPaths.ts`), N-F0 (`packages/shared/**`, `store/migrations.ts`, `services/{LocalStore,DataExport}.ts`),
nutri-server (`packages/db`, `apps/worker`), LEGAL-2b (`settings/{DataSection.tsx,dataCopy.ts}`, `components/legal/**`).
Forbidden (every brief): dependency changes, root config, files outside owned paths, `git commit|push|reset|checkout`, `rm -r*`,
`wrangler deploy|login|secret|d1 execute --remote|d1 migrations apply --remote|deploy --dry-run`, `eas *`, reading `.env*`.

## Task table
| id | title | role/model | depends | wave | box | status |
| --- | --- | --- | --- | --- | --- | --- |
| N-Q1 | QuickAddSheet + `/health/add` modal + FoodLog (code, tests, ui-check 390 + shots N20–N21) | engineer/opus | GO | W1 | 20 | done |
| N-Q2 | NutritionSection row + `/settings/nutrition` (code, tests, ui-check 390+1280, shots N22–N23) | engineer/opus | GO | W1 | 20 | done |
| N-Q2S | N-Q2 resume: eat-back Switch shot N24 on worker 9034 Garmin console mode, signed in | engineer/opus (resume) | N-Q2 | W2 | 10 | done |
| N-Q1W | N-Q1 resume: wire `useAddFood` → mobile `FoodEntryRepo.insert` if N-M1 was not in the tree during N-Q1 | engineer/opus (resume) | N-Q1, N-M1 | W2 | 5 | not needed |
| REV-1 | review N-Q1 + N-Q2 code (diff scope = owned paths) | reviewer/opus | N-Q1, N-Q2 | W2 | 8 | done APPROVE |
| N-QD | designer verdict on N20–N23 (+ N24 delta) — architect-as-designer | architect/fable | N-Q1, N-Q2 shots | W2 | 10 | done PASS (delta) |
| FIX-1 | blocking findings → same engineers (SendMessage) | engineer (resume) | REV-1, N-QD | W3 | 10 | done |
| REV-2 | delta pass over FIX-1 + N-Q2S/N-Q1W (last review row) + package gate quoted | reviewer/opus (resume) | FIX-1 | W3 | 5 | done APPROVE |
Team box 60 (Lead sheet): W1 20 → W2 10 → W3 10 + 5 → root gate + CLAUDE.md lines 3.

## Frozen contracts (N-F0 symbol names pasted at GO)
- Shared: `QUICK_ADD`, `search` (§7), `QuickAddItem`, `FoodItem`, `FoodItems`, `totalsOf`, `FoodEntry`, `FoodEntryInsert`, `Meal`,
  `FoodSource`, `NutritionProfile`, `NutritionGoal`, `ActivityLevel`, `Sex`, `nutritionTargets(profile, today)`, `ProfilePatch.nutrition`.
  (exact names: GO)
- Mobile `FoodEntryRepo` (nutri-today N-M1, FROZEN 14:59, relayed by the Lead 15:01): `apps/mobile/src/services/FoodEntryRepo.ts`,
  `class FoodEntryRepo extends Context.Service<FoodEntryRepo, FoodEntryRepoShape>()("@tanren/FoodEntryRepo")`, layer in runtime.ts AppLayer.
  `type FoodEntryDraft = Omit<FoodEntryInsert, "kcal"|"proteinG"|"carbsG"|"fatG">` = { loggedAt: DateTime.Utc; meal; source; items; note: Option<Note> };
  the repo assigns id, userId, createdAt = updatedAt = now, deletedAt None, totals = totalsOf(items); writes dirty.
  `insert(draft) → Effect<FoodEntry, StoreError>` · `list({ from, to }) → Effect<ReadonlyArray<FoodEntry>, StoreError>` (live, [from, to), asc) ·
  `softDelete(id) → Effect<boolean, StoreError>` · `restore(id) → Effect<boolean, StoreError>`.
- Mobile `ProfileRepo.save(patch: ProfilePatch)` + `modify(f)` (`apps/mobile/src/services/ProfileRepo.ts:30`, `:33`).
- Provides (frozen the moment it compiles): `FoodLog({ entries, onDelete, onRestore })` from `src/components/health/FoodLog.tsx`.

## Assumes (cross-team, each re-read against its source 14:50)
- `FoodEntryRepo` mobile is nutri-today's (N-M1, box 15, same GO); until it is in the tree N-Q1 builds the pure parts and wires the hook last (N-Q1W if late).
- The quick-add write and the food log rows reach `/health` through nutri-today's hooks at INT-N; we own no hook nutri-today owns.
- `useProfile()` / `useProfileState()` exist (`src/hooks/useProfile.ts:21,60`).
- Garmin connected = `useIntegrationsOverview().state` Loaded and `overview.garmin.state === "connected"` (`src/hooks/useIntegrations.ts:32,201`;
  `IntegrationState` `connected|revoked|disconnected`, `packages/shared/src/integrations.ts:10`). The design's `useIntegrations().garmin.status`
  does not exist (grep 14:50).
- Runtime is `src/services/runtime.ts` (`runtime`, `failureMessage`); hook pattern `src/components/settings/useLocations.ts` (never rejects, error Option).
- Vitest runs only `src/**/*.test.ts` in node (`apps/mobile/vitest.config.ts` `include`), so `.test.tsx` files never run → pure `.ts` helpers carry the tests.
- `BannerTone` = `info|success|danger` (no `neutral`, `src/ui/Banner.tsx:10`); `IconButtonVariant` = `plain|filled`, no `tone` (`src/ui/IconButton.tsx:10`).
- `ActivityLevel` has FIVE values; design §6's "activity (4 at 358 = 89.5)" is a slip → 5 segments at 71.6 px (≥ 44) only if no label truncates, else radio `ListRow`s.
- Root Stack `app/_layout.tsx` is `<Stack screenOptions={{ headerShown: false }} />` (self-closing); `health/add` modal = one `Stack.Screen` child.
- New routes need `CI=1 node_modules/.bin/expo start` once to regenerate the git-ignored `.expo/types/router.d.ts` (typed routes).
- `app/health.tsx` (nutri-today) and `app/health/add.tsx` (ours) coexist like `settings.tsx` + `settings/integrations/`.
- Targets copy uses §4's pins (male 85 kg 180 cm 1990 moderate gain → 3,070 / 155 per N-F0 (design §4 said 3,080); comma grouping via shared `formatInt`, Lead 14:56); §8's "3 100 kcal · 170 g" predates §4 and is not a pin.
- Gallery badges: N20+ (nutri-today N1–N19); prefixes from `docs/design/screens/gallery.json`; fragments `docs/design/screens/NUTRI-Q{1,2}-rows.html`.

## Briefs (prepared at HOLD; GO fills the `<GO: …>` slots)

### N-Q1 — Quick-add sheet + `/health/add` + FoodLog
```
# Brief: N-Q1 — Quick-add sheet, /health/add modal, FoodLog component
Role: engineer   Model: opus   Step: v6 nutrition   Task sheet: docs/tasks/v6-nutrition/team-food.md
Time box: 20 min by `date` (at the box: stop, report what you have + gate output + what is left) · Report ≤ 40 lines

## Goal
The owner adds a typical food in three taps: /health/add searches the local QUICK_ADD catalog (no network, no external API in
v1), a tap opens an inline editor (multiplier Stepper, meal SegmentedControl, primary "Add 360 kcal"), Add writes one FoodEntry
(source "quick_add") through the mobile FoodEntryRepo and pops. FoodLog is a pure list component (delete + 15 s Undo) that
nutri-today mounts in /health at integration.

## Read first
- CLAUDE.md, apps/mobile/CLAUDE.md; skills expo-mobile, ui-check (Isolated stack, Measured baselines, Gallery check)
- docs/design/nutrition.md §1, §6 ("Quick-add" + the "food log" row + Delete/Undo paragraph), §7; docs/design/ui-direction-final.md; docs/design/ui-polish.md
- code: app/sign-in.tsx (48-high TextInput), src/ui/{ListRow.tsx (ListRow + ListGroup), Stepper.tsx, SegmentedControl.tsx, Button.tsx,
  Banner.tsx, IconButton.tsx, Page.tsx, AppBar.tsx}, src/components/settings/useLocations.ts (hook pattern), src/hooks/useLogSet.ts
- Facts (grep 14:50): `apps/mobile/vitest.config.ts` include = ["src/**/*.test.ts"] (node; .tsx tests never run) · runtime =
  src/services/runtime.ts (`runtime`, `failureMessage`) · `BannerTone = "info" | "success" | "danger"` (Banner.tsx:10) ·
  `IconButtonVariant = "plain" | "filled"`, no tone (IconButton.tsx:10) · app/_layout.tsx renders `<Stack screenOptions={{ headerShown: false }} />`
- Shared (N-F0, frozen, read /private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/nf0-exports.md — uncommitted tree, build on it): `QuickAddItem`, `QUICK_ADD` (23 rows, USDA SR Legacy; casein,
  protein bar, creatine dropped — design §7's 26 is stale, tests follow the data), `searchQuickAdd(query)` ("shake" → 2),
  `quickAddToFoodItem(item, multiplier): FoodItem` (nutrition/quickAdd.ts); `FoodItem`, `FoodItems` (1–20), `Totals`, `totalsOf(items)`,
  `FoodEntry`, `FoodEntryInsert`, `FoodEntryId`, `Meal` (breakfast|lunch|dinner|snack|supplement), `FoodSource` (mcp|manual|quick_add),
  `formatInt(n)` → "1,420" (nutrition.ts).
- FIRST EDIT (registry, Lead GO 15:07): add `export * from "./nutrition/quickAdd"` to packages/shared/src/index.ts with Edit (additive; N-F0 left it out).
- Mobile FoodEntryRepo (nutri-today N-M1, FROZEN 14:59, live in parallel): apps/mobile/src/services/FoodEntryRepo.ts, service tag
  `FoodEntryRepo` ("@tanren/FoodEntryRepo"); `type FoodEntryDraft = Omit<FoodEntryInsert, "kcal"|"proteinG"|"carbsG"|"fatG">` =
  { loggedAt: DateTime.Utc; meal: Meal; source: FoodSource; items: FoodItems; note: Option<Note> }; `insert(draft) → Effect<FoodEntry, StoreError>`
  (repo assigns id, userId, timestamps, totals = totalsOf(items); dirty) · `softDelete(id) / restore(id) → Effect<boolean, StoreError>`

## Scope
In: packages/shared/src/index.ts (ONE line, first edit) · apps/mobile/app/health/add.tsx (new) · src/components/health/QuickAddSheet.tsx · src/components/health/quickAddSheet.ts + .test.ts
(pure) · src/components/health/FoodLog.tsx · src/components/health/foodLog.ts + .test.ts (pure) · src/hooks/useAddFood.ts (new) ·
apps/mobile/app/_layout.tsx: ONE child `<Stack.Screen name="health/add" options={{ presentation: "modal" }} />` · captures in
docs/design/screens/ (UI-NUTRI-N20-*, UI-NUTRI-N21-*) + docs/design/screens/NUTRI-Q1-rows.html
Out: app/health.tsx and anything nutri-today owns (FoodEntryRepo/NutritionRepo services, useNutrition* hooks, runtime.ts layers,
NutritionStrip, iconPaths.ts) · packages/** · store/** · settings (N-Q2 is live in parallel on src/components/settings/**, app/settings*)
Registry: none expected; a one-line fill in an exhaustive consumer outside scope is granted — list it as `registry: <file>`.

## Interfaces / decisions already made
- Quick-add is local catalog data only (Lead ruling). Search = shared `searchQuickAdd` (case-insensitive substring on name + aliases, sorted by name).
- Scaling is shared: `quickAddToFoodItem(entry, multiplier): FoodItem` (N-F0, kcal int / grams 0.1, portion "1.5 × …") — never re-implement.
  quickAddSheet.ts (pure): multiplier 0.5–5 in 0.5 steps (`clampMultiplier`, `stepMultiplier`) · `addLabel(kcal)` → "Add 360 kcal" with
  shared `formatInt` (comma grouping, Lead 14:56: "Add 1,230 kcal") · `buildQuickAddDraft({ item, multiplier, meal, now })`
  → FoodEntryDraft { source: "quick_add", items: [scaled], meal, loggedAt: now, note: None } (the repo adds totals; the button label uses totalsOf) · default meal = item.meal.
- Editor: Stepper label + valueText ("×1.5") with the scaled portion/grams shown; SegmentedControl meal (5 values, 71.6 px each at 358 —
  no truncated label at 390, else shorter copy in quickAddSheet.ts); Button variant primary size lg (56). Search TextInput 48, radius.md.
- Page `wide` at desktop with AppBar title "Add food" + leading close IconButton (back; fallback `router.replace("/today")`).
- useAddFood.ts: `{ add(input) => Promise<boolean>, error: Option<string>, dismiss }`, never rejects (useLocations pattern); Effect =
  FoodEntryRepo.insert(buildQuickAddDraft(...)). Success → router.back(). If src/services/FoodEntryRepo.ts is not in the tree at
  minute 12 (`ls`), ship everything else and report "N-Q1W: hook wiring left"; you will be resumed.
- FoodLog.tsx: `export function FoodLog({ entries, onDelete, onRestore }: { readonly entries: ReadonlyArray<FoodEntry>; readonly
  onDelete: (id: FoodEntryId) => void; readonly onRestore: (id: FoodEntryId) => void })` — FROZEN signature (nutri-today imports it).
  ListGroup of ListRow title = items[0].name + (n > 1 ? " +n-1" : "") , subtitle "12:40 · 540 kcal · 38 g protein" (local time),
  trailing IconButton icon "trash" accessibilityLabel "Delete <title>"; delete calls onDelete at once and shows Banner tone "info"
  title "Entry deleted" action Undo → onRestore, gone after 15 s (timer cleared on unmount). Rows newest first. Empty → nothing rendered.
- foodLog.ts (pure): rowTitle, rowSubtitle(entry, zone), sortNewestFirst, undo reducer (delete → pending{id, until}; undo → restore id;
  tick ≥ until → cleared; a second delete replaces the pending one).
- No legacy (plan Amendment 23): no shim/alias/TODO-remove; engineer.md rule 15: any CLAUDE.md line is NOT yours (team-lead writes it).

## Done when
- [ ] tests (quickAddSheet.test.ts): sheet filter over `searchQuickAdd`: "shake" → 2 ids, "SHAKE" same, "" → all 23 sorted by name, unknown → []; quickAddToFoodItem ×1.5 via the
      sheet helpers: label "Add 180 kcal" for whey ×1.5; clamp 0.25 → 0.5, 6 → 5, step +0.5/−0.5 at bounds; addLabel 360 / 1230 ("Add 1,230 kcal");
      buildQuickAddDraft has source "quick_add", one scaled item, note None, loggedAt = now, and `{ ...draft, ...totalsOf(draft.items) }`
      decodes as the shared FoodEntryInsert (Schema.decodeUnknownSync on its encoded form).
      foodLog.test.ts: "+n" title, subtitle format, newest first, undo reducer: restore before expiry, expiry at 15 s, replace on 2nd delete.
- [ ] `pnpm -F @tanren/mobile check` (or test + typecheck + biome on your files) green — paste tail; reds outside scope listed with owner
- [ ] ui-check on dev server 9033 (`CI=1 EXPO_PUBLIC_DEV_USER_ID=<uuid> node_modules/.bin/expo start --web --port 9033`, pid file
      $S/N-Q1-expo.pid, guarded kill + `ps` re-check at the end): /health/add at 390 → type "shake" → 2 rows → tap Whey → ×1.5 →
      button reads "Add 180 kcal" → Add → pops (or, if N-Q1W pending, the button state only). `ab errors` empty. Bounding boxes of
      search, list, editor rows, Add button at 390 and 1280 pasted (prev.bottom ≤ next.top).
- [ ] shots: N20 (search "shake" list) and N21 (editor ×1.5) at 390 + 1280 × light + dark → docs/design/screens/UI-NUTRI-N20-quickadd-<w>-<scheme>.png,
      UI-NUTRI-N21-quickadd-edit-<w>-<scheme>.png; rows fragment NUTRI-Q1-rows.html (pattern LOGO-4-rows.html); `node docs/design/gallery.mjs
      docs/design/screens/NUTRI-Q1-rows.html docs/design/screens` output pasted (exit 0). Report line: `Data state: dev-server empty store ·
      Scheme: both · Commit: <sha> (<n> dirty) · Routes: /health/add`. engineer.md rule 14 self-check done (every PNG opened, both schemes).
- [ ] no files outside Scope changed; `grep -rn "legacy\|TODO remove\|deprecated" <your files>` → 0
Forbidden: dependency changes, root config, files outside Scope, `git commit|push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|
d1 execute --remote|d1 migrations apply --remote|deploy --dry-run`, `eas *`, reading `.env*`. Never kill a process you did not start.
## Report
engineer report format; exact commands + trimmed output.
```

### N-Q2 — Settings → Nutrition & goals
```
# Brief: N-Q2 — NutritionSection row + /settings/nutrition
Role: engineer   Model: opus   Step: v6 nutrition   Task sheet: docs/tasks/v6-nutrition/team-food.md
Time box: 20 min by `date` · Report ≤ 40 lines

## Goal
Settings gets a "Nutrition & goals" row (subtitle = goal label · targets, or Off) opening /settings/nutrition: goal, weight,
optional height / birth year / sex, activity, derived targets (shared nutritionTargets; manual overrides win), eat-back Switch only
when Garmin is connected, Save, Turn off. Saving writes profile.nutrition through the mobile ProfileRepo (offline, dirty → syncs).

## Read first
- CLAUDE.md, apps/mobile/CLAUDE.md; skills expo-mobile, ui-check
- docs/design/nutrition.md §1 (NutritionProfile), §4 (targets + pins), §6 ("Settings → Nutrition" paragraph); ui-direction-final.md; ui-polish.md
- code: app/settings.tsx (Columns main: Account, Integrations, Equipment), src/components/settings/{EquipmentSection.tsx, SettingsSection.tsx,
  useLocations.ts, settingsCopy.ts + .test.ts}, app/settings/location/[id].tsx (sub-page pattern), src/services/ProfileRepo.ts (`save` :30,
  `modify` :33), src/hooks/useProfile.ts (`useProfileState` :21), src/hooks/useIntegrations.ts (`useIntegrationsOverview` :201, garmin :32),
  src/ui/{Stepper,SegmentedControl,StatRow,ListRow,Button}.tsx
- Facts (grep 14:50): vitest include ["src/**/*.test.ts"] (node) · IntegrationState = connected|revoked|disconnected
  (packages/shared/src/integrations.ts:10) · the design's `useIntegrations().garmin.status` does NOT exist → use useIntegrationsOverview ·
  ActivityLevel has five values (the design's "4 at 358" is a slip)
- Shared (N-F0, frozen, read /private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/nf0-exports.md): user.ts `NutritionGoal` (gain_muscle|lose_weight|maintain), `ActivityLevel`
  (sedentary|light|moderate|active|extra), `Sex` (male|female), `NutritionProfile` {goal, bodyWeightKg, heightCm Opt, birthYear Opt, sex Opt,
  activityLevel, eatBackActive (default false), kcalTarget Opt, proteinTargetG Opt}; `ProfilePatch.nutrition` optionalKey (None/null clears);
  nutrition.ts `nutritionTargets(profile, today: LocalDate): { kcal, proteinG }` (overrides already win inside), `formatInt(n)` → "1,420".

## Scope
In: apps/mobile/app/settings/nutrition.tsx (new) · src/components/settings/NutritionSection.tsx (new) · src/components/settings/nutritionCopy.ts
+ .test.ts (labels, subtitle) · src/components/settings/nutritionSettings.ts + .test.ts (pure draft ↔ NutritionProfile, validation, Effect
`saveNutrition`) · src/components/settings/useNutritionSettings.ts (hook) · apps/mobile/app/settings.tsx: ONE line `<NutritionSection />`
after `<EquipmentSection />` (+ its import) · captures UI-NUTRI-N22-*, UI-NUTRI-N23-* + docs/design/screens/NUTRI-Q2-rows.html
Out: app/health*, src/components/health/** (N-Q1 live in parallel), DataSection/dataCopy (LEGAL-2b), packages/**, services/**, hooks/** (read only)
Registry: one-line fills outside scope granted; list as `registry: <file>`.

## Interfaces / decisions already made
- Targets: shared nutritionTargets(profile, today) with today = device-local LocalDate; overrides win (kcalTarget / proteinTargetG Some).
- Screen (Page `wide`, AppBar "Nutrition & goals" + back; Loading | Ready in the same frame): SegmentedControl goal (Gain muscle /
  Lose weight / Maintain — pinned copy), Stepper weight 0.5 kg (30–300), height (1 cm, 120–230) and birth year (1920–2020) each with an
  explicit unset state ("—" + "Add"/"Clear"; engineer picks, designer rules), SegmentedControl sex (Male / Female / Skip), activity (5 values;
  no truncated label at 390 — else radio ListRows with subtitles), derived targets StatRow variant "tile" 2 items (kcal, protein; "Custom"
  marker when overridden) with "Edit" → override Steppers (kcal step 50, 800–8000; protein step 5, 20–500) + "Use derived" reset,
  ListRow "Eat back active calories" / "Adds Garmin active calories to the day's budget" trailing RN Switch (44 tap, default off) shown only
  when garmin.state === "connected", primary "Save" (enabled when the draft is valid and differs), "Turn off" (only when nutrition is Some)
  → ProfilePatch { nutrition: None }. 1280: Columns like Settings (form main, targets + eat-back side) or one column in `wide` — engineer
  picks, shows boxes.
- NutritionSection: SettingsSection with one ListRow title "Nutrition & goals", subtitle from nutritionCopy, chevron → /settings/nutrition.
- Hook: `useNutritionSettings()` → `{ save(next: Option<NutritionProfile>) => Promise<boolean>, error: Option<string>, dismiss }`, never
  rejects (useLocations pattern); reads via useProfileState.
- No legacy (plan Amendment 23). Any CLAUDE.md line is NOT yours (team-lead writes it).

## Done when
- [ ] nutritionCopy.test.ts pins: goal labels; activity labels; subtitle "Gain muscle · 3,070 kcal · 155 g" for §4's pin (male 85 kg 180 cm
      1990 moderate gain, today 2026-10-27; numbers via shared `formatInt`, comma grouping, Lead 14:56), "Lose weight · 2,060 kcal · 185 g"
      fallback pin (85 kg, light, no height), override variant (kcalTarget 2800, proteinTargetG 170 → "· 2,800 kcal · 170 g"), None → "Off".
- [ ] nutritionSettings.test.ts: draft → NutritionProfile encode/decode round-trip; weight 29.5 / 300.5 → validation failure with the field named;
      unset height → None; eatBackActive default false kept; `saveNutrition(Option.some(p))` then ProfileRepo.get → nutrition Some(p) and
      `saveNutrition(Option.none())` clears it, on the SqlDriver.testing layer (pattern ProfileRepo.test.ts); its failure path (ProfileRepo
      error) surfaces as the typed failure.
- [ ] `pnpm -F @tanren/mobile check` (or test + typecheck + biome on your files) green — paste tail; reds outside scope listed with owner
- [ ] ui-check dev server 9035 (`CI=1 EXPO_PUBLIC_DEV_USER_ID=<uuid> node_modules/.bin/expo start --web --port 9035`, pid file
      $S/N-Q2-expo.pid, guarded kill + `ps` re-check): Settings shows the row "Off" → open → goal Gain, 85 kg, 180 cm, 1990, Male, Moderate →
      tile reads 3,070 / 155 → Save → back: subtitle "Gain muscle · 3,070 kcal · 155 g" → reload → still there → Edit override 2,800 →
      tile 2,800 "Custom" → Turn off → "Off". `ab errors` empty. Bounding boxes of every control row at 390 and 1280 pasted.
- [ ] shots: N22 (Settings with the row, nutrition Some) and N23 (/settings/nutrition filled, derived) at 390 + 1280 × light + dark →
      docs/design/screens/UI-NUTRI-N22-settings-<w>-<scheme>.png, UI-NUTRI-N23-nutrition-<w>-<scheme>.png; NUTRI-Q2-rows.html;
      gallery.mjs check output pasted. Report line: `Data state: dev-server empty store · Scheme: both · Commit: <sha> (<n> dirty) ·
      Routes: /settings, /settings/nutrition`. engineer.md rule 14 self-check (every PNG opened, no ellipsis at 390).
- [ ] no files outside Scope changed; `grep -rn "legacy\|TODO remove\|deprecated" <your files>` → 0
Forbidden: dependency changes, root config, files outside Scope, `git commit|push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|
d1 execute --remote|d1 migrations apply --remote|deploy --dry-run`, `eas *`, reading `.env*`. Never kill a process you did not start.
## Report
engineer report format; exact commands + trimmed output.
```

### N-Q2S (resume of N-Q2) — eat-back shot N24
Worker 9034 (`--inspector-port 9534 --persist-to $S/N-Q2S-state --var GARMIN_MODE:console --var ALLOWED_ORIGINS:http://localhost:9035
--var BETTER_AUTH_URL:http://localhost:9034 --var MCP_RESOURCE_URL:http://localhost:9034/mcp`, migrations applied to the persist dir first)
+ dev server 9035 with `EXPO_PUBLIC_API_URL=http://localhost:9034`; sign in by magic link, connect Garmin in console mode, then shoot
/settings/nutrition with the Switch row (N24, 390 + 1280 × light + dark), toggle it, Save, reload → on. Stop both by pid files. 10 min.

## Decisions (for the Lead to ratify)
- D1 (14:58, Lead YES 14:57) Tests in pure `.ts` siblings (`quickAddSheet.ts`, `foodLog.ts`, `nutritionSettings.ts` + `.test.ts`) instead of the charter's
  `{QuickAddSheet,FoodLog}.test.tsx`: vitest includes only `src/**/*.test.ts` in node; changing that is package config (forbidden).
- D2 (14:58, Lead YES 14:57) Two hook files the charter does not list: `src/hooks/useAddFood.ts` (quick-add write; components run no Effect) and
  `src/components/settings/useNutritionSettings.ts` (pattern `useLocations.ts`). Disjoint from nutri-today's `useNutritionDay/Week`.
- D3 (14:58) Ports: Q1 web 9033, Q2 web 9035, Q2S worker 9034 — a stack per task (ui-check), all probed free.
- D4 (14:58) N-Q2S split from N-Q2 (GM-6S pattern): the connected-Garmin state needs a signed-in worker; N-Q2 shoots the dev-server states.

- D5 (15:22) Pure files named `quickAddMath.ts` / `foodLogRows.ts` (not quickAddSheet/foodLog: TS1261 case collision with the .tsx on macOS).
- D6 (15:31) Designer rulings applied: meal = 5 ToggleChips (full words); activity = 5 radio ListRows; Activity heads the side column at desktop; "Not set" + Add/Clear; birth-year caption "age N"; Turn off = text button.
- D7 (15:31) Numbers stay comma-grouped via shared `formatInt` (Lead 14:56) — designer's thin-space nit rejected.
- D8 (15:36) Eat-back row: whole row pressable, Switch hidden from a11y/focus (aria-hidden + inert spread, commented); row role stays button with ", on/off" in the label.
- D9 (15:31) REV-1 #6 accepted as known limit: the settings draft is seeded once; a pull mid-edit is overwritten by Save (comment at the seed).

## Design truth-up (for the Lead → docs/design/nutrition.md)
- §6 `useIntegrations().garmin.status` → `useIntegrationsOverview()` + `garmin.state === "connected"`.
- §6 `Banner tone="neutral"` does not exist (info|success|danger); `IconButton tone` does not exist (plain|filled).
- §6 activity "4 at 358 = 89.5" → five values; and a 5-option SegmentedControl scrolls (MAX_FIXED_OPTIONS 4): meal is ToggleChips, activity radio rows.
- §7 26 rows / "shake" → 3 → 23 rows / "shake" → 2 (N-F0 USDA verification); whey 106 kcal ("Add 159 kcal" at ×1.5).
- §4/§8 pins → 3,070 / 155 (N-F0), comma grouping; §8's "3 100 kcal · 170 g" is stale.

## Escalations
(none)

## Integration checklist (items outside our owned paths; INT-N pastes these)
- [ ] `apps/mobile/src/ui/ListRow.tsx` (src/ui owner) · optional `accessibilityRole`/`accessibilityState` override so the eat-back row announces as a switch · verify: snapshot shows `switch [checked]` once.
- [ ] `apps/mobile/app/health.tsx` (nutri-today) · render `<FoodLog entries={day.entries} onDelete={softDelete} onRestore={restore} />`
      from `src/components/health/FoodLog.tsx` with nutri-today's FoodEntryRepo actions · verify: ui-check /health delete → Undo → row back.

## Log
- 2026-10-27 14:09 · skeleton written (architect).
- 2026-10-27 14:58 · HOLD: prepared (charter, design §1/§4/§6/§7, ui-check, engineer.md rules 14–17 read; ports 9033/9034/9035 probed free; briefs N-Q1/N-Q2 written; interim sent).
- 2026-10-27 14:57 · Lead: D1 + D2 ratified; FoodEntryRepo signature to be relayed from nutri-today ≤ 5 min after GO; design slips → report "design truth-up".
- 15:07 · GO received (N-F0 exports at $S/nf0-exports.md; barrel line to N-Q1; pin 3,070/155; budget 2 engineers).
- 15:12→15:22 · W1 · N-Q1 · engineer/opus · afa1a3b8777411ca7 · 198k tok · 96 tools · r1 · DONE 10 min: /health/add + QuickAddSheet + FoodLog + useAddFood wired (FoodEntryRepo landed), 19 tests, mobile check 1147 green, ui-check 9033, N20/N21 shots. Renamed pure files quickAddMath.ts / foodLogRows.ts (TS1261 casing).
- 15:12→15:21 · W1 · N-Q2 · engineer/opus · ad128ce00bcba5239 · 186k tok · 65 tools · r1 · DONE 8.6 min: /settings/nutrition + NutritionSection + copy/settings/hook, 14 tests, mobile check green, ui-check 9035, N22/N23 shots.
- 15:22 · W2 dispatch: N-Q2S resume (ad128ce00bcba5239, worker 9034 + web 9035) ∥ REV-1 reviewer/opus ∥ N-QD architect/fable (one message). N-Q1W not needed.
- 15:22→15:24 · W2 · REV-1 · reviewer/opus · a296c1317822fdbfd · 105k tok · 15 tools · APPROVE, gate green (1147), 3 should + 3 nit.
- 15:24→15:31 · W2 · N-QD · architect/fable · a5fbba5159990a54d · 90k tok · 18 tools · N20 PASS 4 · N21 FIX 3 (meal chips) · N22 PASS 4 · N23 FIX 3 (desktop Activity → side) · 10 nits.
- 15:27 · W3 routed: FIX-1 N-Q1 resume (chips, alias delete, subtitle, empty-query full list N25, desktop list kept, focus ring; re-shoot N20/N21/N25) ∥ N-Q2 addendum into the running N-Q2S (Activity → side, hint gate, birth-year age unit, Clear, Turn off, tokens; re-shoot N23 + N24). Rejected: thin-space nit (Lead ruling comma formatInt). Accepted limit: REV-1 #6 draft seeded once.
- 15:27→15:34 · W3 · FIX-1 N-Q1 (resume afa1a3b8777411ca7) · DONE 6.5 min: meal ToggleChips, filterQuickAdd deleted, subtitle, N25 full list, desktop list kept, focus ring; mobile 1175 green; N20/N21 re-shot, N25 added.
- 15:24→15:36 · W2/W3 · N-Q2S + FIX-1 N-Q2 (resume ad128ce00bcba5239) · DONE 11.7 min: worker 9034 console Garmin, eat-back on→Save→reload on; Activity → side; hint gate; age caption; Clear; Turn off text; tokens; Switch target/track/thumb defects fixed; N23 re-shot, N24 added.
- 15:36→15:37 · REV-2 delta (resume a296c1317822fdbfd) · APPROVE, mobile check 1181 green; should: eat-back Switch a11y; nit: radiogroup.
- 15:37→15:40 · N-QD delta (resume a5fbba5159990a54d) · N20 4.5 · N21 4.5 · N22 4 · N23 4.5 · N24 4 · N25 4.5 — all PASS; nits: dark thumb white, number format (Lead ruling: comma stays).
- 15:38→15:39 · tidy resumes: N-Q1 radiogroup role · N-Q2 Switch hidden from a11y/focus (aria-hidden + inert wrapper; native accessibilityElementsHidden). Dark thumb deferred (would need a re-shot round).
- 15:40 · team-lead gates: mobile test 99 files / 1184 passed; mobile tsc + root pnpm check red ONLY in v6b programs files (app/(tabs)/programs.tsx typed routes, app/programs/[programId].tsx, packages/shared program.test.ts expectTypeOf); biome ci 353 files clean. apps/mobile/CLAUDE.md v6 nutri-food section written. Team report sent.
