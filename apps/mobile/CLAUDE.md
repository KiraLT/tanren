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
app/
  _layout.tsx, index.tsx, sign-in.tsx, auth/callback.tsx (native sign-in deep link),
  progress/[exerciseId].tsx (root Stack detail), settings.tsx (root Stack),
  (tabs)/_layout.tsx (five themed tabs, hidden at desktop), (tabs)/{today,plan,programs,library,progress}.tsx
src/
  ui/         the design system (docs/design/design-system.md); screens import UI from `src/ui` only:
              tokens + colors (the only hex), ThemeProvider/useTheme/useStyles, Page, AppBar (+ `APP_NAV`
              desktop nav), Text, Card, Button, IconButton, Icon, ListRow, Stepper, SegmentedControl,
              StatusPill, TimerRing, EmptyState, Banner, Skeleton, `interaction.ts` (web hover/focus)
  services/   SqlDriver (+ .testing), LocalStore, TodayRepo, PlanWeekRepo, StoreEvents,
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
  components/ SetList, ExercisePage, ExercisePager, RestTimerBar, TodayReady, PlanWeek, PlanDayRow,
              PlannedSessionCard (+ SessionBlocks), stepMath, setRows, planFormat, planSelection,
              planWeekFixture (tests only); built on `src/ui`
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
  centred at `contentMaxWidth` 560, gutter 24, bottom tabs. Desktop (`layoutModeFor` = two-column):
  `Page` renders `aside` (max 480, gap 24) only then, the tab bar is hidden (`tabBarStyle display
  none`) and `AppBar` renders the nav (`APP_NAV`: Today, Plan, Programs, Library, Progress; active
  from `usePathname()`) itself, so every screen with an `AppBar` gets it. Today aside = current
  exercise's SetList + RestTimerBar ring (neutral arc; read-only, no Log set button); Plan aside
  = the selected session's card (tap selects; default today's, else next upcoming, else first).
  Ready states render their own `Page`.
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
- API base: `EXPO_PUBLIC_API_URL`, else Expo `hostUri` host with `:8787`,
  else `http://localhost:8787`.

## Programs (v2, team programs — docs/design/v2-programs.md)

- Definitions are static shared data (`CORE30` in `@tanren/shared` `programs/`); progress is the
  synced `program_enrollment` / `program_day_completion` rows. `ProgramRepo.complete` writes the
  completion, bumps `currentDay` (never backwards; non-active enrollment → `StoreError`
  `EnrollmentNotActive`), and logs one ordinary `session` + one `set` per *performed* item-round
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

## Commands

`pnpm -F @tanren/mobile web` · `dev` (Expo Go) · `test` · `typecheck` · UI acceptance via the `ui-check` skill (agent-browser).
Web build: `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm web:export` → `apps/mobile/dist/` (git-ignored) · `pnpm web:serve` (= `wrangler dev -c wrangler.web.jsonc --port 8790`) · `pnpm -F @tanren/worker exec wrangler deploy --dry-run -c wrangler.web.jsonc`. Stopping a wrangler started via pnpm: kill its children too (`pkill -P <pid>`).
Load `expo:expo-overview` before Expo work; our rules win on conflict.
Parallel proofs: export to a scratch dir and serve it with `wrangler dev -c wrangler.web.jsonc --port <n> --assets <dir>` (the config hardcodes `../mobile/dist`); a new route needs `CI=1 expo start --port <n>` until `.expo/types/router.d.ts` lists it.

## v2 extras (progress, settings, PWA; docs/design/v2-extras.md)

- Routes: `/progress` (tab; Exercises | Sessions, desktop aside); `/progress/[exerciseId]` (root Stack
  detail; a direct load with no data goes back to `/progress`); `/settings` (root Stack, reached from the
  gear `IconButton` "Settings" in the Progress AppBar, not a tab).
- `HistoryRepo` (`src/services/HistoryRepo.ts`): local store only, live rows only, 8 Monday-based weeks;
  a PR is a set that strictly beats every earlier set.
- `progressMath`: Epley e1RM (`epley1Rm`, `SetScore`, `markPrs`). `useHistory` (`src/hooks`): the screens' hook over `HistoryRepo`.
- `chartGeometry` (`src/components/progress/`): pure geometry for the hand-rolled `react-native-svg`
  charts (`WeekBars`, `Sparkline`); no chart library.
- `Account` (`src/services/Account.ts`): `session`, `signOut`, `forgetOwner`.
- `DataExporter` (`src/services/DataExport.ts`): named so because `DataExport` is the shared schema;
  covers all 10 sync tables. Web downloads `tanren-export-YYYY-MM-DD.json`; the native row reads
  "Export on the web app".
- Theme preference: `useThemePreference` from `src/ui`; persisted on web in `localStorage["tanren.theme"]`
  (`themePreferenceStore.web.ts`); native keeps it for the session only.
- Sign-out policy: server first (`POST /api/auth/sign-out`; native goes through `withSession`), then
  `forgetOwner`, then `NativeSession.clear` (a failed forget keeps the token: `SignOutFailed("server")`). Local rows are kept. Web then does a full reload to `/today`;
  native shows the banner "Signed out. Reopen the app to finish." Offline or non-2xx gives `SignOutFailed`
  and nothing local changes. A different user on the same device is not built. The sign-out runtime proof
  is pending INT-X.
- PWA: `public/manifest.json` (`theme_color` #C2410C = light accent, `background_color` #FFFFFF) and
  `public/icons/{icon.svg, icon-192, icon-512, maskable-512, apple-touch-icon}.png`, rendered once from the
  SVG with agent-browser. `public/index.html` comes from `expo customize` (works under the isolated linker)
  and carries a `biome-ignore lint/a11y/useValidLang` comment for the `%LANG_ISO_CODE%` placeholder: re-add
  it after any re-customize. `src/pwa/manifest.test.ts` keeps the colours equal to the tokens. There is no
  service worker (an offline shell would be a Workbox step).
- Verified 2026-10-21 (X5): `Page.getInstallabilityErrors` returns `[]` with no service worker (CDP via
  `agent-browser get cdp-url`); Workers static assets serve `manifest.json` as `application/json`;
  `crossOriginIsolated` stays true.

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
