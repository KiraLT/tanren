# @tanren/mobile

Expo SDK 58 + Expo Router app (iPhone via Expo Go, web via `expo start --web`): an offline-first logger on a local
expo-sqlite store with batched push/pull sync. Contracts live in `docs/design/` (`ls` it; `local-dev.md` §6a is the phone
recipe) and ADRs, not here.

## Boundaries

- Depends on `@tanren/shared` for every data shape; never imports `apps/worker` or `packages/db`. Budget, targets, insights, PR
  math and `Activity` come from shared only.
- Plain React components, **no Effect inside components**: Effect runs in `src/services/` behind one `runtime` and reaches
  screens through `src/hooks/` (`runtime.runCallback` + `onExit`, `runFailed` in `src/hooks/runExit.ts`). Promise APIs never reject.
- Screens import UI from `src/ui` ONLY; `colors.ts` is the one place with hex. Colours only from `useTheme().colors` / `useStyles`.

## Navigation (ADR-0029, navigation-v2.md)

- `APP_NAV` (`src/ui/appNav.ts`) = home · train · activity · you; `(tabs)/_layout.tsx` builds the tabs from it (hidden ≥ 900, where
  `AppBar` renders it) and `scripts/index-check.sh` compares `APP_NAV` names with the `(tabs)` route files: renaming a tab edits both.
- Home = one Up-next card + one Start. `useStartAction` / `startTarget` (`src/hooks/useStartWorkout.ts`,
  `src/components/today/upNext.ts`) decide Session / AddExercise / Program / Free / Done; the pager is `/home?workout=1`.
  Desktop `AppBar` Start comes from `AppBarStartContext` (provided in `(tabs)/_layout.tsx`, hidden on `/home` and `/train`).
  `AppBarNoticeContext` puts a control's failure line under the bar (Start's "Try again"); `StartButton` clears it on blur,
  unmount or target change.
- Home reads the feed once (`useTodayFeed` → `done` + `latest`). `ThisWeekCard` (`src/components/week/`, `tiles` | `rings`) is
  Home's and You's single `useWeekReview` read.
- Train: Plan · Programs · Library segments, `?view=plan|programs|library` is the source of truth (links use `/train?view=…`;
  `/plan`, `/programs`, `/library`, `/feed`, `/today` are not routes). You = Account · Insights · Setup · About, gear → `/settings`.
  `app/+not-found.tsx` redirects every unknown path to `/home`.
- Routes (`ls app` is the inventory; UI specs and QA capture sets are built from it). Not obvious from the names:
  `programs/play.tsx` needs `?enrollmentId=` and opens only an `active` enrollment (`nav={false}`);
  `programs/pick.tsx?pickFor=<programId>/<day>` and `programs/swap.tsx?enrollmentId=&from=` are sheets;
  `programs/[programId]/day/[n].tsx` is the read-only day preview; `activity/imported/[id].tsx` is an imported card;
  `health/add.tsx` is the one `Stack.Screen` modal child in `_layout.tsx`; `privacy`/`terms` are public (`isPublicRoute` in
  `authGate.ts`). Signed-out web renders `Landing` (`src/components/landing/`) from `_layout.tsx`.

## Layout gotchas

- `src/components/`: pure modules sit beside the `.tsx` under ANOTHER name (`Foo.tsx` + `foo.ts` collide on macOS, TS1261).
  `volumeFormat.ts` is the leaf (planFormat/progressFormat import it, never each other). Charts are hand-rolled react-native-svg.
- `src/ui/`: pure style tables each have a test; `iconPaths.ts` has no `chevronUp` (rotate `chevronDown`); `useConfirm`
  (`Confirm.tsx`): native Alert, Forge alertdialog on web (bare `Alert.alert` is a no-op on web).
- `src/services/`: `Integrations` and `AccountErasure` are provided per call, not in `runtime.ts`.
- `Page` owns the desktop aside frame (top `space.lg`, sides `gutter.desktop`): an aside never pads its own top or sides.

## Local store contract

- Quoted camelCase columns so the shared `*Row` codecs decode unchanged; extra columns `_dirty`, `_rejected`; table `sync_state`;
  no foreign keys. Versions: v1 synced tables · v2 programs progress + catalog link · v3 locations on `profile` · v4 `imported_activity`
  + `daily_health` (pull-only) · v5 `food_entry` + `profile.nutrition` · v6 `program` + `program_enrollment.swaps` · v7 `free_workout`
  (device-local) · v8 `program_day_progress` (device-local) · v9 `exercise_step` (device-local). Device-local tables have no `userId`
  and are never synced. `DataExporter` covers all 13 sync tables; `AccountErasure` wipes every table `sqlite_master` lists.
- Writes go through the repos (`TodayRepo` serialised by a semaphore) and emit `StoreEvents`, which reloads Today.
- `TodayRepo.finishSession` sets `finishedAt` (no-op for unknown/finished/zero-set sessions). `SyncEngine` runs
  `finishStaleSessions(now)` (`STALE_SESSION_HOURS` 3) only after a complete `pullLoop`, never at startup (an un-pulled device
  would back-date `finishedAt`).
- Sync (`SyncEngine.background` via `useSync`): on mount, every 60 s, and `PUSH_DEBOUNCE` 500 ms after `requestSync`. Pull applies a
  row only if strictly newer; push conflicts tie to the server; marks apply only if `updatedAt` is unchanged; an undecodable dirty
  row gets `_rejected = "invalid"`, not retried. Transport methods are `sendChanges`/`fetchChanges`. Signed out makes no API call:
  sync rounds and `useGarminConnected` run via `whenSignedIn`; only the gate's `get-session` probe calls out.
- Owner: `CurrentUser.signedIn` resolves once per runtime (dev `EXPO_PUBLIC_DEV_USER_ID`, else Better Auth / `NativeSession`, else
  stored `sync_state.ownerUserId`). Signed out: rows carry `LOCAL_USER_ID` and the demo seed runs; signed in:
  `SyncEngine.rekeyLocalUser` moves them first.

## Expo facts

- tsconfig extends `expo/tsconfig.base.json` (with `.json`) and `../../tsconfig.base.json`; `typedRoutes` on. A new route needs one
  `CI=1 expo start --port <n>` to regenerate `.expo/types/router.d.ts`, else `tsc` rejects `Link href`. Stale Metro after
  edits (esp. `src/ui`): restart; `--clear` is not enough.
- Native deps are Expo Go ones pinned from SDK 58 `bundledNativeModules.json`. `expo-widgets` / Live Activities need a dev
  build (ADR-0012): not added.
- Web: sqlite wasm needs COOP + COEP (dev server sends them, export ships `public/_headers`, applied by `apps/worker/wrangler.web.jsonc`).
  `EXPO_PUBLIC_API_URL` (else `hostUri` host `:8787`) and `EXPO_PUBLIC_PLAYER_SPEED` are inlined at export; `__DEV__` is false in an
  export. Web is single-tab: `PageSqlDriver` holds a Web Lock; a second tab fails with `DatabaseInUse` after `LOCK_TIMEOUT`.
- Breakpoints (`useBreakpoint`): phone < 600, tablet 600–899 (one 600 column), desktop ≥ 900. Column maths only in `src/ui/columns.ts`
  (splits `"7/5"` default · `"5/7"` · `"6/6"`). `Page` takes `aside` + `split` or `wide`; Loading/Empty/Failed states never pass
  either. `cardStyle` keeps a 1 px border in dark so both schemes measure the same.
- Gotchas: never pass `accessibilityElementsHidden` / `importantForAccessibility` to `Svg` / `Animated.View` (wrap in a `View`); a
  child of `Link asChild` needs an object `style`; RN web ignores `hitSlop` (keep 44-px Pressables); a button inside a `Card` uses
  `variant="raised"`; web hover/focus via `usePressableInteraction`.
- The seed plan has no Tuesday session: rest-day proofs run agent-browser with `TZ=Pacific/Kiritimati`. Signed out always seeds the
  demo plan: empty-state proofs need a signed-in empty account.
- Auth (ADR-0022): web = magic-link cookie flow (full-load redirect). Native = code at `/auth/callback?code=` → `NativeSession`
  (PKCE, SecureStore `tanren.*`, only a 401 clears the pair; a failed sign-out revoke waits in `tanren.pendingRevoke`). Gate
  (ADR-0019): `gateFor` says `"sign-in"` only with no account AND `localSetCount` = 0 AND a non-public route.
- Tests: vitest runs only `src/**/*.test.ts`; a `.test.tsx` never runs, so pure logic lives in a `.ts` with its test.

## Programs (programs-mcp.md, programs-player-v2.md, ADR-0026)

- Built-ins (`PROGRAMS`) + the owner's live `program` rows. Statuses `active | paused | completed | abandoned` (several active, one
  per program). `complete` accepts only `day === currentDay` (`DayOutOfOrder`). The schedule is a sequence: a missed day stays due,
  one day per local calendar day (`DayDoneToday`); `ActiveProgram.doneToday` hides Start everywhere and is read against
  `DateTime.now`, so `usePrograms` and `useDueToday` also re-read on refocus (`useRefocusCount`).
- Sets: `RepsItem.sets` (1–10, decoding default 1); `expandDay` turns a day into `Step`s (one round = every item's sets in order);
  machine state is `round` + `stepIndex`, cues index `round * stepsPerRound + stepIndex`; `complete` writes one set per step.
  `PlayerProgress { round, rounds, item, items, set, sets, step, steps }` feeds the header "Exercise i/n · Set s/k".
- Resume: `DayProgressRepo` (v8) saves a `DaySnapshot` on every player phase change; `complete` / abandon clear it; `snapshotFits`
  rejects a stale one (day or items changed). `ActiveProgram.inProgress` → `continueLabel`: "Continue day N · k of m done".
- Swaps live on the enrollment keyed by the ORIGINAL catalog id; mid-workout `mergeDay` renames only open item-rounds, done rounds
  keep `performedIds` (history is never rewritten).
- Player: `playerMachine` is pure, a late `tick` chains every elapsed phase; `phaseKey` changes on pause/resume. `PhaseAlerts` loads
  `expo-notifications` by dynamic `import()`. Editor: no draft, every change writes `ProgramRepo.save` (version + 1).

## Weight entry (weight-entry.md)

`src/ui/Stepper.tsx` `onCommit` turns the numeral into tap-to-type (Enter, blur or native Done commit; Escape cancels); callers parse
with `stepMath` `parseWeight` / `parseReps`. The weight step is `useStep(stepKeyOf(exercise), equipmentOf(catalogId))`; an override is
kept per exercise in `exercise_step` (v9, `StepRepo`).

## Feed, Progress, Garmin, Nutrition

- `FeedRepo.activities(limit)` → `FeedItem` `{_tag:"session"|"imported"}`; `activity(id)` is session-only. `HistoryRepo` serves only
  Progress (a PR strictly beats every earlier set).
- Garmin (`GarminCard`): the token is component state, cleared after every attempt; Connect has its own 30 s timeout
  (`GARMIN_CONNECT_TIMEOUT_SECONDS`, others 5 s). The Worker's "today" is UTC: Today can read "Burned: no data" 00:00–02:00 EET.
- `NutritionRepo.day(date)` / `.week(monday)` read in `CurrentTimeZone` (insights read the 7 days ENDING the date). Budget = goal
  intake (burn is information); eat-back only when `eatBackActive`; insights ≤ 3.
- `HealthModule` (→ `/health`): `metaLine` never shows bpm (resting HR only on `/health`, plan Amendment 26); 358 × 214 without an
  insight, 236 with one line. Settings → Nutrition: the draft is seeded once (a pull mid-edit is lost on
  Save).

## Illustrations and brand

- Generated, not drawn: `pnpm images:generate [--only <id,…> | --all] [--transparent]` → `images:shrink` → `images:map` (rewrites
  `images.ts`); `muscle:generate`; `logo:generate --w1-export <png>` rebuilds the icon set without a paid run. Key =
  `OPENAI_API_KEY` in git-ignored `.env.images`. Use `gpt-image-1.5` (`gpt-image-1` is refused), `background:
  "opaque"` for icons; rerun ids the safety filter refuses.
- PWA: `manifest.json` + `index.html` colours = brand graphite `#16181D`; `public/index.html` needs its `biome-ignore
  lint/a11y/useValidLang` comment re-added after a re-`expo customize`. `scripts/serviceWorker.ts` writes `dist/sw.js` AFTER
  `expo export`.

## Commands

`pnpm -F @tanren/mobile web` · `dev` (Expo Go) · `test` · `typecheck` · UI acceptance via the `ui-check` skill (agent-browser).
Web build: `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm -F @tanren/mobile export:web` → `apps/mobile/dist/` · `pnpm web:serve`
(= `wrangler dev -c wrangler.web.jsonc --port 8790`). Start servers through the bare binary with a pid file
(`node_modules/.bin/wrangler dev … & echo $! > $S/<task>-web.pid`), stop by that pid, never `pkill`. Parallel proofs: export to a
scratch dir and serve with `--port <n> --assets <dir>` (the config hardcodes `../mobile/dist`). Load `expo:expo-overview` before
Expo work; our rules win on conflict.
