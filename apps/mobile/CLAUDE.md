# @tanren/mobile

Expo SDK 58 + Expo Router app (iPhone via Expo Go, web via `expo start --web`).
A fast offline-first logger: local expo-sqlite store, batched push/pull sync
with the worker, Today and Plan screens, web export.

## Boundaries

- Depends on `@tanren/shared` for every data shape (entities, `*Row` codecs,
  sync envelope). Never imports from `apps/worker` or `packages/db`.
- React components are plain React; **no Effect inside components**. Effect
  runs only in `src/services/` behind one `runtime` and is exposed through
  `src/hooks/`.
- Everything on Today works with no network; sync is a background concern.

## Layout

```
app/          ROUTE INVENTORY — every route, kept complete by whoever adds one (the task that adds a route
              adds its line); UI specs, QA capture sets and the owner's gallery are built from this list.
  _layout.tsx, index.tsx, sign-in.tsx, auth/callback.tsx (native sign-in deep link),
  (tabs)/_layout.tsx (five themed tabs, hidden at desktop), (tabs)/{feed,today,plan,programs,library}.tsx
  root Stack: activity/[sessionId].tsx, library/[catalogId].tsx, programs/play.tsx (Player, `nav={false}`),
  progress/{index,[exerciseId]}.tsx, settings.tsx, settings/location/[id].tsx,
  settings/integrations/{index,[provider]}.tsx
  Not a route but owner-visible: the magic-link email (apps/worker `magicLinkEmail`, EMAIL-1).
src/
  ui/         the design system (docs/design/design-system.md); screens import UI from `src/ui` only:
              tokens + colors (the only hex), ThemeProvider/useTheme/useStyles, Page, AppBar (+ `APP_NAV`
              desktop nav), Text, Card, Button, IconButton, Icon, ListRow, Stepper, SegmentedControl,
              StatusPill, TimerRing, EmptyState, Banner, Skeleton, `interaction.ts` (web hover/focus);
              Forge (docs/design/ui-direction-final.md): `controls.ts` pure style tables (+ test), `iconPaths.ts`
              glyph table, ListGroup (+ `useGrouped`), ToggleChip, ProgressRing, SegmentBar, SetDots; fonts Barlow
              Condensed 700/800 (`assets/fonts/`, `useFonts` in `app/_layout.tsx`)
  services/   SqlDriver (+ .testing), LocalStore, TodayRepo, PlanWeekRepo, FeedRepo, StoreEvents,
              CurrentUser, SyncEngine, SyncTransport, MockSyncServer, apiBaseUrl, magicLink, runtime,
              HistoryRepo (Progress reads: live sets of live sessions, ≤ 3 SELECTs per method) over
              pure progressMath (epley1Rm, SetScore, markPrs, local-Monday weekStartOf),
              ProgramRepo (enrol/active/todayFor/complete → completion + session + sets), PhaseAlerts
              (+ .notifications adapter)
  player/     playerMachine (pure), cues, playerEffects, useProgramDay, components/{ProgramHome,PlayerView}
              — team programs; route app/programs/play.tsx, hook src/hooks/usePlayer.ts
  store/      migrations, seed (demo rows, _dirty=0), localUser (LOCAL_USER_ID), syncQueries
  hooks/      useToday, usePlanWeek, useLogSet (Promise<boolean>; never rejects), useSync,
              useRestTimer, useLayoutMode / useBreakpoint (+ pure layoutMode), useSignedIn, useSendMagicLink
  library/    CatalogList/Filter/Detail, ExerciseIllustration (webp or fallback tile), MuscleMapImage (webp or SVG), illustration.ts
  illustrations/ imagePrompt (pure half of the generator), images.ts (generated map), muscleMap/
  components/ SetList, ExercisePage, ExercisePager, RestTimerBar, TodayReady, PlanWeek, PlanDayRow,
              PlannedSessionCard (+ SessionBlocks), stepMath, setRows, planFormat, planSelection,
              planWeekFixture (tests only), feed/; built on `src/ui`
scripts/     generateIllustrations, shrinkImages, imageMap, contactSheet, muscleMapSheet, resolveTs
assets/illustrations/  <catalogId>.webp (512x512) + style.md
public/_headers (COOP/COEP, copied into dist/ by `expo export`)
expo-types.d.ts (typed routes, committed) · metro.config.js (wasm asset) · vitest.config.ts
```

## Local store contract

- Quoted camelCase columns so the shared `*Row` codecs decode records
  unchanged; extra columns `_dirty`, `_rejected`; table `sync_state`;
  schema version via `PRAGMA user_version`; no foreign keys.
- Writes go through `TodayRepo` (serialised by a semaphore) and emit
  `StoreEvents`, which reloads Today.
- Sync (`SyncEngine.background`, run by `useSync`): on mount, every 60 s, and 500 ms
  (`PUSH_DEBOUNCE`) after `requestSync`, which `useLogSet` sends after every logged set
  (taps in the window share one push; offline fails once, then waits for the loop); pull applies a
  row only if strictly newer, push conflicts tie to the server; accepted /
  rejected marks apply only if `updatedAt` is unchanged since the push.
  An undecodable dirty row is flagged `_rejected = "invalid"` (warning logged, not retried) while
  healthy rows push in the same pass; an unplanned session is reused only on the local date it
  started; `TodayRepo.exerciseChoices` (swap / add) skips tombstoned exercises, Today does not.
  Transport methods are `sendChanges` / `fetchChanges`: the noMutation
  plugin is purely syntactic and flags any `x.push(...)` / `pop` / `shift` /
  `unshift` / `splice` / `sort` / `reverse` / `fill` call. Convention: never
  name an own method after one of these; for third-party ones
  (`router.push`) suppress the one line with
  `// biome-ignore lint/plugin/noMutation: <reason>`.
- Owner (INT-2): `CurrentUser.signedIn` is resolved once when the runtime
  is built (dev override `EXPO_PUBLIC_DEV_USER_ID`, else Better Auth
  `GET /api/auth/get-session`, else the stored `sync_state` `ownerUserId`
  when offline). Signed out: rows carry `LOCAL_USER_ID` and the demo seed
  runs. Signed in: no seed; `SyncEngine.rekeyLocalUser` (one batch, under
  the sync lock, skipped when `ownerUserId` already matches) moves local rows
  to the user before the first sync. Sign-in UI: `/sign-in` (step 7). "Different user on the
  same device" (full wipe) is not built yet.

## Expo facts

- tsconfig extends `expo/tsconfig.base.json` (with the `.json` suffix) and
  `../../tsconfig.base.json`; `typedRoutes` on (else `expo start` rewrites
  tsconfig). Isolated pnpm linker, no metro `watchFolders`.
- v2 deps (V2-F2, all in Expo Go, pinned from SDK 58 `bundledNativeModules.json`):
  `expo-notifications` (plugin, `enableRemoteNotifications: false`: local only), `expo-haptics`,
  `expo-audio`, `expo-keep-awake`, `expo-secure-store`; store migration v2 adds `exercise.catalogId`,
  `program_enrollment`, `program_day_completion`. `expo-widgets` (dev build only, ADR-0012) and
  its `app.json` plugin are added by V2-P7, not before.
- Ids from `expo-crypto` behind an app `IdGenerator` (Hermes
  `crypto.randomUUID` unverified).
- Web: sqlite wasm needs cross-origin isolation (COOP `same-origin` + COEP).
  The dev server sends the headers; the exported build ships them in
  `public/_headers`, which Expo copies into `dist/` and the assets-only Worker
  (`apps/worker/wrangler.web.jsonc`, SPA fallback) applies, also under
  `wrangler dev`. Credentialed CORS fetches to the API work under the COEP
  value in `_headers` (proven S7-P4).
- Web is single-tab in v1: `runtime.ts` `openPageStore` fails a second live tab with
  `DatabaseInUse` after `LOCK_TIMEOUT` (cached by `ManagedRuntime`: the copy asks for a reload),
  aborts or releases the Web Lock on interrupt, failed open or scope close, and retries only
  the bfcache "Access Handle" open failure (`isAccessHandleError`).
- `EXPO_PUBLIC_API_URL` is inlined at export time (local export:
  `http://localhost:8787`; production: `https://api.tanren.me`). `__DEV__` is
  false in an export (no dev prefills).
- Breakpoints (`breakpointFor` / `useBreakpoint`, width from `useWindowDimensions`): phone < 600,
  tablet 600–899, desktop >= 900. Phone: one full-width column, bottom tabs. Tablet: one column
  centred at `contentMaxWidth` 600, gutter 24, bottom tabs. 390 and 768 trees are unchanged by the
  desktop work. Desktop: the tab bar is hidden (`tabBarStyle display none`) and `AppBar` renders the
  nav (`APP_NAV`: Feed, Today, Plan, Programs, Library; active from `usePathname()`) itself, so
  every screen with an `AppBar` gets it.
  Desktop columns (docs/design/ui-desktop.md §2–§3): `columnsFor(width, split)` (`src/ui/columns.ts`,
  the one place with the maths) centres a `pageMaxWidth` 1136 page (gap 24, gutter 32) and splits it
  `"7/5"` (default, focus left) · `"5/7"` (master-detail) · `"6/6"`; main is rounded to the 4-pt
  grid. Pinned: at 1280 (page 1136) 7/5 = 648/464, 5/7 = 464/648, 6/6 = 556/556; at 900 (page 900)
  7/5 = 512/364, 5/7 = 364/512, 6/6 = 436/440. `Page` takes `aside` + `split` (two columns, main
  `role="main"`, aside `role="complementary"`) or `wide` (a 1136 page with no aside, whose children
  lay themselves out with `Columns`); `Columns` / `useColumns` live in `src/ui/ColumnsView.tsx`
  (below desktop `Columns` stacks). Without `aside` or `wide` the page is the single 600 column.
  Master-detail 5/7: Library (list + `CatalogDetail`, `inline` hero only when the aside's inner width
  fits 584, i.e. at 1280 not 900) and Progress (exercise list + `ExerciseDetail`, aside only when the
  list is Ready). Today aside = Session list (`sessionRows`: one `ListRow` per exercise with state
  disc and n/m sets) + the current exercise's SetList + RestTimerBar ring (neutral arc; read-only,
  no Log set button); Plan aside = the selected session's card (tap selects; default today's, else
  next upcoming, else first). Settings is `wide` with `Columns 6/6`, the location editor `wide`
  with `Columns 5/7`, `/progress/[exerciseId]` `wide` with a split detail. Loading, empty, not-found
  and failed states never pass `wide` or `aside`: they stay one 600 column. Ready states render
  their own `Page`.
- Theme and design: colours only from `useTheme().colors` / `useStyles` (`src/ui/colors.ts` is the one
  place with hex; light and dark follow the device or `useThemePreference`). Web hover/focus come
  from `usePressableInteraction` (`onHoverIn/Out` state, `:focus-visible` gated `outline*` ring in
  `colors.focus`): RNW's `hovered` flag is not typed. Never pass `accessibilityElementsHidden` /
  `importantForAccessibility` to a DOM-backed element (react-native-svg `Svg`, `Animated.View`): wrap
  it in a `View` (React warns about unknown DOM props on web). A child of `Link asChild` must have an
  object `style`, not an array (expo-router Slot shim throws, and in an export the page is just blank).
- Plan screen reads only `PlanWeekRepo.currentWeek` (live active plan, live
  week with `weekStart <= today < weekStart + 7`, any weekday — ADR-0007),
  no endpoint. Status: done (live workout_session links it) > today > missed
  > upcoming. No `userId` filter (one owner per device after re-key).
- Sign-in: `/sign-in` posts `/api/auth/sign-in/magic-link` with
  `credentials: "include"` and an absolute `<origin>/today` callbackURL
  (Better Auth `trustedOrigins` = worker `ALLOWED_ORIGINS`); the link's
  redirect is a full page load, so the runtime rebuilds and `CurrentUser`
  resolves the session. Adding a route needs one `expo start` to regenerate
  `.expo/types/router.d.ts`, else `tsc` rejects `Link href`. **Native sign-in works via a
  one-time code** (docs/design/native-auth.md): the emailed link opens in Safari, whose "Open Tanren"
  button deep-links `exp://…/--/auth/callback?code=…` into Expo Go; `NativeSession` exchanges the code
  (PKCE verifier) at `POST /api/native/session` and keeps the session token in `expo-secure-store`,
  sent as `Authorization: Bearer` (`withSession`). Web keeps the cookie flow above. Phone recipe:
  `docs/design/local-dev.md` §6a (`pnpm dev:phone`). Live Activities still need a dev build, not
  Expo Go.
- Sign-in gate (ADR-0019): `app/_layout.tsx` calls `useAuthGate(usePathname())` (web and native). `gateFor`
  (`src/services/authGate.ts`, pure) says `"sign-in"` only with no account (`gateAccount`: resolved user,
  dev override, else stored owner) AND `localSetCount` = 0 AND a route outside `/sign-in`, `/auth/*`.
  The layout renders nothing while loading, keeps the `Stack` mounted but invisible while gated and
  `<Redirect href="/sign-in" />`s. An expired session or an offline start is not a gate; sign-out keeps
  local sets, so it does not lock the user out. Proof: `ab network route "<api>/**" --abort` then a direct
  load (the dev server is unreachable under `set offline on`, so that only proves client navigation).
- API base: `EXPO_PUBLIC_API_URL`, else Expo `hostUri` host with `:8787`,
  else `http://localhost:8787`.

## Programs (v2, team programs — docs/design/v2-programs.md)

- Definitions are static shared data (`CORE30` in `@tanren/shared` `programs/`); progress is the
  synced `program_enrollment` / `program_day_completion` rows. `ProgramRepo.complete` writes the
  completion, bumps `currentDay` (only `day === currentDay` is accepted, any other day → `StoreError`
  `DayOutOfOrder { expected, got }`; non-active enrollment → `EnrollmentNotActive`), and logs one ordinary `session` + one `set` per *performed* item-round
  (`CompletionInput.performedItems`, round-major; the player counts it, an early Finish logs less)
  (`reps` = seconds, `weightKg` 0, `order` from 0, `loggedAt` = planned item end ≤ now) in one dirty
  batch; exercises come from `ExerciseLink.ensure` (team catalog); ids missing from the catalog are
  skipped, none left → `sessionId` None. A repeat for the same day writes nothing.
- Player: `playerMachine` is pure (`step(config)(state, event)`), remaining = `endsAtMs − nowMs`,
  a late `tick` chains every elapsed phase from the previous deadline; duration excludes pauses.
  `phaseKey` also changes on pause/resume, so cues compare `_tag`s (`cues.ts`). `usePlayer` ticks
  every 250 ms and on `AppState → active`; `KeepAwake` is mounted in `app/programs/play.tsx` only
  while Working/Resting. The play screen latches the day it opened with.
- `PhaseAlerts` (port, ADR-0012): one pending local notification at the phase end; the layer loads
  `expo-notifications` via dynamic `import()` (node tests never load it; web or failed import →
  no-op). No foreground notification handler. Live Activity adapter (P7) not built (gated).
- `EXPO_PUBLIC_PLAYER_SPEED` (export-time inlined) divides every duration — browser proofs only.
- The Today "Core 30 · Day N" banner belongs in `src/components/TodayReady.tsx` (design's file).
- Phone layout (pair mobile-A, ratified r3, `docs/design/reviews/UI-PmobileA-r3.md`; measured at 390):
  Today setup row = 56–60-px `ListRow` on a `surface` group (`surfaceRaised` equals the page
  background in light); weight/reps blocks 92 high, gap 24, unit as `caption`; `SetDots
  variant="pill"` (10×6, current set 16×6 accent). Player: body `space-between`, pause 64 filled
  `surface`, prev/next 48, "Next · <exercise> <s>" caption (`nextAfterWork`, `playerMachine.ts`),
  clock `Text variant="clock"` 64/68, `TimerRing` stroke 10 (local `RING_STROKE`), the eyebrow ring
  dropped on phone (tablet/desktop keep it). Plan: rest rows 52, one-line session items and day
  header, `StatRow` week stats (done = sessions with status done; a rep range counts its minimum),
  section gap 24. Programs: `ProgressRing` with the day number (stroke 3), not-enrolled "What's
  inside" list. Open (UI-P-left): `Stepper` unit slot (the "kg" caption still sits under the
  numeral), Plan session row 172 vs 156 (card padding 11 vs 8), Programs hero 56 vs 104, `Page`
  `sectionGap` default 16 (24 wanted).

## Commands

`pnpm -F @tanren/mobile web` · `dev` (Expo Go) · `test` · `typecheck` · UI acceptance via the `ui-check` skill (agent-browser).
Web build: `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm web:export` → `apps/mobile/dist/` (git-ignored) · `pnpm web:serve` (= `wrangler dev -c wrangler.web.jsonc --port 8790`) · `pnpm -F @tanren/worker exec wrangler deploy --dry-run -c wrangler.web.jsonc`. Stopping a wrangler started via pnpm: kill its children too (`pkill -P <pid>`).
Load `expo:expo-overview` before Expo work; our rules win on conflict.
Parallel proofs: export to a scratch dir and serve it with `wrangler dev -c wrangler.web.jsonc --port <n> --assets <dir>` (the config hardcodes `../mobile/dist`); a new route needs `CI=1 expo start --port <n>` until `.expo/types/router.d.ts` lists it.

## Illustrations

- Exercise images are generated, not drawn: `pnpm images:generate [--samples | --only <id,…> | --all]`
  (`scripts/generateIllustrations.ts`) calls OpenAI `gpt-image-1` (1024², medium, webp) from the prompt
  template in `assets/illustrations/style.md` and the catalog entry (`src/illustrations/imagePrompt.ts`;
  per-id wording in `PROMPT_INSTRUCTIONS` / `NAME_OVERRIDES`). The key is `OPENAI_API_KEY` in the
  git-ignored `apps/mobile/.env.images`, read only by that script (`node --env-file-if-exists`); agents
  never open the file. Runs are capped at 8 images unless `--all`; existing files are skipped.
- Add `--transparent` (RGBA, works on both themes) and `--out <dir>` (generate into a scratch dir, then copy over the assets) for a full regeneration.
- Then `pnpm images:shrink` (sharp, 512² q75 + alphaQuality 80, idempotent: files <= 520 px are skipped; 3.9 MB for 291) and
  `pnpm images:map` (rewrites `src/illustrations/images.ts`, a literal `require` per webp that Metro
  bundles; `src/library/illustration.test.ts` checks the map against the files and the catalog).
  `assets/illustrations/_contact-sheet.html` is the reviewer preview.
- `ExerciseIllustration` shows `IMAGES[catalogId]` on the library detail, or a neutral placeholder when
  an id has no file. The safety system refuses some ids at random (`cable-crunch` three times, then
  passed in the IMG-4 transparent run; `cable-chest-press`, `standing-cable-crunch` once): rerun the
  failed ids. All 291 catalog ids have a transparent file (IMG-4). `frog-pump` and `cable-shrug` needed `NAME_OVERRIDES` / `PROMPT_INSTRUCTIONS` rewording.
- Muscle maps (IMG-5b/5c): per-exercise gpt-image-1 images in `assets/musclemaps/<catalogId>.webp`
  (384 px square, transparent, front and back figure side by side; generator `scripts/generateMuscleMap.ts`,
  shrink `scripts/shrinkMuscleMaps.ts`, index `scripts/muscleMapIndex.ts` writes
  `src/illustrations/muscleMapImages.ts`, a `require` per file). `MuscleMapImage` (`src/library/`) shows
  the file for a catalog id (`muscleMapImageFor`, pure, takes the map) and falls back to the SVG
  `MuscleMap` (front view) with the entry's primary/secondary muscles when the id has no file
  (`MISSING_MUSCLE_MAPS` is empty since IMG-6: 291 of 291; a map text-to-image paints wrongly is redone with
  `muscle:generate --out <dir> --catalog <id> --reference <goodId|auto>`, an `/v1/images/edits` recolour of a
  good map; edits default to `gpt-image-1.5` (override `MUSCLE_EDIT_MODEL`) because `gpt-image-1` is refused on
  `/v1/images/edits` for this account, probed 2026-10-26); used in
  `CatalogHero` (160 px slot) and the Progress exercise detail (176 px). `ExerciseIllustration`'s fallback tile
  is `surfaceRaised` inside a `ListGroup` (`useGrouped()` from `src/ui`).
- The body diagram is `src/illustrations/muscleMap/` (front/back silhouettes, 22 regions, primary and
  secondary highlights from the catalog taxonomy). `MuscleMap view`: `"both"` (default, square, front +
  back) or `"front"` / `"back"` (cropped to one figure, about 0.38 × `size` wide); `scripts/muscleMapSheet.ts` writes its git-ignored
  preview. The old hand-built SVG pipeline (scenes, rig, `illustrations:check`) is retired.
- Logo candidates (LOGO-1): `pnpm logo:generate [--only A1,C2] [--transparent] [--out <dir>]`
  (`scripts/generateLogo.ts`, same key loading as the other generators) writes nine 1024² png icon candidates
  (A forged kanji stroke, B anvil and spark, C forged T; three variants each) into the git-ignored
  `assets/brand/candidates/`; `pnpm -F @tanren/mobile logo:sheet` (no key) builds
  `docs/design/screens/LOGO-1-sheet.png` (3x3, labelled) and `LOGO-1-sheet-small.png` (60 and 29 px renders on
  paper and graphite). `gpt-image-1` is refused on `/v1/images/generations` for this account (probed 2026-10-26),
  so every call falls back once to `gpt-image-1.5` (a refused call is not billed, but counts as an API call); the
  request sends `background: "opaque"` because `auto` returned alpha for 2 of 9 icons.

- Final mark (LOGO-2, owner pick J3: kanji 力, off-white first stroke, amber `#F59E0B` hook, on graphite `#16181D`):
  `pnpm logo:generate --final --out <dir>` makes `F-icon`, `F-paper`, `F-mark` at quality `high` (about $0.60 per
  attempt; a second attempt goes to another `--out`); `F-mark` (`background: transparent`) came back as a glow
  twice, so it is unused. `pnpm exec node scripts/generateLogo.ts --export <dir>` (no key; `<dir>` holds the
  chosen `F-icon.png` + `F-paper.png`) keys the glyph out of them (alpha from the distance to the corner
  background, strokes recoloured to the exact brand colours, so the icon background is exactly `#16181D`,
  not the model's drifted `#282B33`), trims it and writes the tracked `assets/brand/{icon,adaptive-icon,
  splash-icon,favicon,mark,mark-paper}.png` and `public/icons/{icon-192,icon-512,maskable-512,apple-touch-180}.png`
  (`app.json` icon/splash/adaptiveIcon/favicon point at them). The first stroke is off-white: use `mark.png` only
  on dark surfaces and `mark-paper.png` (paper tile) on light ones (`app/sign-in.tsx`). `candidates/` stays ignored.

## v2 extras (progress, settings, PWA; docs/design/v2-extras.md)

- Routes: `/progress` (root Stack, reached from the Feed AppBar chart button; exercise list, desktop aside);
  `/progress/[exerciseId]` (root Stack detail; a direct load with no data goes back to `/progress`);
  `/settings` (root Stack, reached from the gear `IconButton` "Settings" in the Feed AppBar, not a tab);
  `/settings/integrations` + `/settings/integrations/[provider]` (v4 Strava, docs/design/integrations.md §8:
  `Integrations` service, `useIntegrations` hooks, `src/components/integrations/`, copy in
  `components/settings/integrationsCopy.ts`; the service layer is provided per call, not in `runtime.ts`).
- `HistoryRepo` (`src/services/HistoryRepo.ts`): local store only, live rows only, 8 Monday-based weeks;
  a PR is a set that strictly beats every earlier set.
- `progressMath`: Epley e1RM (`epley1Rm`, `SetScore`, `markPrs`) (PR math re-exported from `@tanren/shared`). `useHistory` (`src/hooks`): the Progress screens' hook over `HistoryRepo` (exercises + one exercise's history; session lists are `FeedRepo`'s).
- `chartGeometry` (`src/components/progress/`): pure geometry for the hand-rolled `react-native-svg`
  charts (`WeekBars`, `Sparkline`); no chart library.
- `Account` (`src/services/Account.ts`): `session`, `signOut`, `forgetOwner`.
- `DataExporter` (`src/services/DataExport.ts`): named so because `DataExport` is the shared schema;
  covers all 10 sync tables. Web downloads `tanren-export-YYYY-MM-DD.json`; the native row reads
  "Export on the web app".
- Theme preference: `useThemePreference` from `src/ui`; persisted on web in `localStorage["tanren.theme"]`
  (`themePreferenceStore.web.ts`); native keeps it for the session only.
- Sign-out policy: server first (`POST /api/auth/sign-out`; native goes through `withSession`), then
  `forgetOwner`, then `NativeSession.clear` (a failed forget keeps the token: `SignOutFailed("server")`; a 401 from the POST means the server session is already gone and counts as success). Local rows are kept. Web then does a full reload to `/today`;
  native shows the banner "Signed out. Reopen the app to finish." Offline or non-2xx gives `SignOutFailed`
  and nothing local changes. A different user on the same device is not built. The sign-out runtime proof
  is pending INT-X.
- PWA: `public/manifest.json` (`theme_color` and `background_color` #16181D = the LOGO-2 icon graphite) and
  `public/icons/{icon-192, icon-512, maskable-512, apple-touch-180}.png` (exported from the final mark, see
  Illustrations; the old `icon.svg` and `apple-touch-icon.png` are gone). `public/index.html` comes from `expo customize` (works under the isolated linker)
  and carries a `biome-ignore lint/a11y/useValidLang` comment for the `%LANG_ISO_CODE%` placeholder: re-add
  it after any re-customize. `src/pwa/manifest.test.ts` keeps the manifest and `index.html` colours equal to the brand graphite. There is no
  service worker (an offline shell would be a Workbox step).
- Verified 2026-10-21 (X5): `Page.getInstallabilityErrors` returns `[]` with no service worker (CDP via
  `agent-browser get cdp-url`); Workers static assets serve `manifest.json` as `application/json`;
  `crossOriginIsolated` stays true.

## v4 feed (ADR-0017, docs/design/feed.md)

- Tab order: Feed · Today · Plan · Programs · Library (`APP_NAV`, first tab = `/feed`, icon `flame`).
- Routes: `/feed` (`app/(tabs)/feed.tsx`; AppBar has the Progress chart button and the Settings gear),
  `/activity/[sessionId]` (root Stack detail), `/progress` (root Stack, `app/progress/index.tsx`, Back
  falls back to `/feed`; the old Sessions segment is gone).
- Data: `Activity` / `buildActivity` live in `@tanren/shared` (`activity.ts`); `FeedRepo`
  (`src/services/FeedRepo.ts`: `activities(limit)`, `activity(id)`, PR marking per exercise) over
  `useFeed` / `useActivity` (`src/hooks/useFeed.ts`, built on `useStoreRead` from `useHistory`).
- UI: `src/components/feed/` (`feedGroups`, `ActivityCard`, `ActivityDetail` + its pieces
  `ActivityHead/Muscles/Tiles/Exercises`, `detailText`, `feedSelection`).
  `HistoryRepo` serves only Progress (`exercises`, `exercise`).
- Desktop: Feed is `Page aside split="5/7"` (card press selects, `effectiveActivity` = pick or newest;
  an in-progress card still opens `/today`); the aside is only built when the feed is Ready with
  items, so Loading/Empty/Failed stay one 600 column. `ActivityDetail layout="split"` shows four tiles
  in a row when the column is >= 480 inner (`tilesPerRow`), else 2x2 (below 1024 every split is 6/6).
  `/activity/[sessionId]` is `Page wide` + `Columns 7/5` from the same pieces at desktop.

## Status

Step 6 (2026-10-20, company mode): M1–M4 done, 51 tests, reviewed. INT-2b
(2026-10-20): web ↔ local worker proven end to end with agent-browser, no code
change: magic link → cookie → get-session → re-key → pull → log set → push →
server pull shows it. `localhost:8081` and `:8787` are the same site, so the
SameSite=Lax cookie rides `credentials: "include"`. The seed plan has no session
on Tuesdays: to test Today on a rest day, launch agent-browser with e.g.
`TZ=Pacific/Kiritimati` (Chrome inherits `TZ`). Open: a manual rest → swipe
pass on a phone in Expo Go (offline logging; native sign-in arrived with native-auth, see above).

Step 7 (2026-10-20, team plan-web): Plan screen (PlanWeekRepo + usePlanWeek),
two-column layout at ≥ 900 px, web export served by the assets-only Worker on
:8790 with COOP/COEP, sign-in screen (S7-P6). Proven with agent-browser on the
exported build at 390 and 1280 px. Web OPFS + bfcache (S7-P1 fix): on a full cross-route
navigation Chrome bfcaches the old page, whose sqlite worker keeps the OPFS
access handle, so the new page's open failed and `ManagedRuntime` cached the
failure. `runtime.ts` `PageSqlDriver` takes a page-lifetime Web Lock named
after the database (evicts the bfcached holder; 10 s timeout; skipped on
native) and retries the open (250 ms × 20). Two live tabs still cannot share
the store (second tab fails after 10 s): open product decision.

INT-A (2026-10-20): owner recipe proven on the export via root `pnpm dev`
(`docs/design/local-dev.md` §Owner recipe). Gap: `logSet` does not call
`syncNow()`, so a logged set reaches the server only on the next ~60 s loop.

v2 design + extras (2026-10-21, team design): `src/ui` design system (tokens, light/dark,
theme preference, 15 primitives + Icon, desktop `AppBar` nav), Today/Plan/Sign-in/auth callback
restyled, legacy `components/{theme,Screen,BigButton}` deleted; Progress tab, Settings, PWA
manifest. Proven on the export at 390/768/1280 light+dark (30 screenshots). `EmptyState` carries
`minHeight: 240` in the primitive (UI-FIX-1), so it renders inside `Page scroll` and `FlatList`
empty components without per-screen patches. Stale Metro after edits: restart the server,
`--clear` is not enough. Empty-state proofs in the browser: signed out always seeds the demo
plan, so use Library "no results" or a signed-in empty account.

INT-X1 (2026-10-21, partial, time-boxed): on the export via `pnpm dev`, root gate green (1172 tests);
magic-link sign-in, Library search/filter/detail and "Add to today's session" (stays on the detail and shows "Added" / "Already in today's session" for 3 s since EQ-2b; before that it navigated to Today)
proven at 390 px. Library detail then showed the placeholder (the SVG map was empty; since replaced by generated webps, see Illustrations). Not proven: the added exercise visible on Today,
Programs player, Progress PR, Settings export/sign-out, dark/1280.
