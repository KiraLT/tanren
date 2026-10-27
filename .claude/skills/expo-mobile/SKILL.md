---
name: expo-mobile
description: Expo + Expo Router, expo-sqlite offline store, EAS Update and web export as used in apps/mobile. Load for build steps 6–7 and any mobile or web UI work.
---

# Expo mobile for Tanren

Source of truth for the app's layout, store contract and commands:
`apps/mobile/CLAUDE.md`. Research: `docs/research/2026-10-20-expo-mobile.md`.
Official docs: https://docs.expo.dev/ (Router, SQLite, monorepos, web).

## Decided at step 6 (2026-10-20, gate green)

- Expo SDK 58 (`expo` 58.0.19, `expo-router` 58.0.26, `expo-sqlite`
  58.0.14, RN 0.88, React 19.3.0), pinned in the root `pnpm-workspace.yaml`
  catalog. Versions come from Expo's `bundledNativeModules.json`, not npm
  latest.
- pnpm **isolated** linker (the default; no `nodeLinker` in
  `pnpm-workspace.yaml`): Expo ≥ 54 resolves it without `watchFolders` or
  `extraNodeModules`. `metro.config.js` exists only to register the sqlite
  `.wasm` asset. ADR still to be written by the Lead.
- `apps/mobile/tsconfig.json` extends `expo/tsconfig.base.json` (the `.json`
  suffix is required) **and** `../../tsconfig.base.json` (last, so strict
  flags win). `experiments.typedRoutes: true` in `app.json`, else
  `expo start` rewrites the tsconfig; `expo-types.d.ts` is committed.
- Entry `"main": "expo-router/entry"`; routes `app/_layout.tsx`,
  `app/(tabs)/_layout.tsx`, `app/(tabs)/{today,plan}.tsx`.
- Ids via `expo-crypto` `randomUUID` behind the `IdGenerator` service
  (`src/services/runtime.ts`; tests use `IdGenerator.layerTest`). Hermes
  `crypto.randomUUID` is unverified, so do not call it directly.
- Effect runs only in `src/services/` behind one `runtime`; components see
  `src/hooks/` only (`.claude/rules/react.md`).
- Writes derived from synced state (auto-finish, cleanup, backfill) are a
  `SyncEngine` step after `pullLoop` has landed every page, under the sync
  lock; never from a screen hook or at startup. `pullLoop` commits per
  200-row page and bumps `StoreEvents`, so a `useToday` reload runs between
  pages and sees a pulled session before its sets (AUTO-FIN brief put
  `finishStaleSessions` in `useToday`; REV-AF found it tombstoning server
  sessions, 2026-10-26). Soft-delete only `_dirty = 1` rows the server never saw.
- Tests: vitest with `node:sqlite` (Node 24) as the SqlDriver; expo-sqlite
  is the runtime layer. Package gate: `pnpm -F @tanren/mobile test` +
  `typecheck` + `biome ci apps/mobile`.
- Web sqlite (wasm) needs cross-origin isolation (COEP `require-corp` + COOP
  `same-origin`, see the step-7 section) from the host that serves the page.
- Runtime proof is the `ui-check` skill (agent-browser); tests do not prove
  the UI, and `expo start --web` does not prove the web build: every web
  change is proven on the exported build (`pnpm web:export` + `pnpm
  web:serve` on :8790), with at least one direct full-page load of a second
  route (`open /today`, then `open /plan`). S7-P1 passed its node:sqlite
  tests and `expo start`; only P4's proof on the export found that a direct
  `/plan` load failed 3/3 with `StoreError` (bfcache/OPFS, below).

## Web export, hosting and two-column layout (step 7, verified 2026-10-20)

- Export: `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm web:export` writes
  `apps/mobile/dist/` (the URL is inlined at bundle time; production uses
  `https://api.tanren.me`). Expo copies `public/` into `dist/`, so
  `public/_headers` (COEP `require-corp` + COOP `same-origin`) ships with it.
  `require-corp`, not `credentialless`: WebKit/Safari does not support
  `credentialless`, and every subresource is same-origin (API calls are CORS,
  which `require-corp` allows). Proven in Chromium only; Safari is unverified.
- OPFS and bfcache (Chromium, verified S7-P1 fix): on a cross-route full
  navigation Chrome keeps the previous page in the back/forward cache, and its
  sqlite worker still holds the OPFS access handle, so the new page's
  `SqlDriver.layer` fails to open the database and `ManagedRuntime` caches the
  failure (symptom: "Could not load the plan / Could not save on this device"
  until reload). `src/services/runtime.ts` `PageSqlDriver` takes a
  page-lifetime Web Lock (`navigator.locks.request`, 10 s timeout, skipped on
  native where `navigator.locks` does not exist) so Chrome evicts the bfcached
  holder, then builds `SqlDriver.layer` under `Effect.retry` (250 ms × 20).
  Consequence: two live tabs cannot share the store (the second fails after
  10 s) — a product decision, open. The failure is a runtime BUILD error, so
  a hook sees it only through `runtime.runCallback(…, { onExit })` +
  `runFailed` (`src/hooks/runExit.ts`), never inside the program's
  `catchCause` (BS-1 black screen, HOTFIX-1/2, 2026-10-27). Do not add a second `SqlDriver` opener
  outside `PageSqlDriver`.
- Serve: `pnpm web:serve` = assets-only Worker `apps/worker/wrangler.web.jsonc`
  on :8790 (SPA fallback, `_headers` parsed by Workers static assets). Under
  these headers `crossOriginIsolated === true`, sqlite opens, and the
  credentialed CORS fetches to :8787 (`get-session`, `/sync/*`) succeed.
  After editing `_headers`, re-export: the Worker serves `dist/`, not `public/`.
  `wrangler deploy --dry-run -c wrangler.web.jsonc` needs no account.
- Two columns: `useLayoutMode()` (`src/hooks/useLayoutMode.ts`, pure rule in
  `layoutMode.ts`) is `"two-column"` iff window width >= `WIDE_BREAKPOINT`
  (900). `Screen` takes `aside?: ReactNode` and renders it (role
  `complementary`, gap 24, max 480; main column fixed at `contentMaxWidth`
  560 because pager pages are that wide) only in two-column mode; at phone
  width the aside is not rendered at all. A screen whose aside needs inner
  state (Today: pager index, rest timer) renders its own `Screen`
  (`TodayReady`, `PlanReady` in `plan.tsx`). Asides are read-only: no second
  "Log set" button, and content the aside shows is hidden from the main column
  (`ExercisePage` `showSets={false}` when wide; Plan cards `showBlocks={false}`).
- ui-check: `agent-browser set viewport 1280 800` switches layouts live.
  `snapshot -i` lists only interactive/labelled nodes; use plain `snapshot`
  (grep it) to see non-interactive rows (day rows, set rows, `complementary`).
- Still open: EAS Update publish flow.
- Expo Go vs SDK (SPIKE-GO, 2026-10-21/26): the App Store Expo Go carries one SDK and lags a new
  SDK release by weeks ("needs the latest version of Expo Go" = the store build is on the previous
  SDK). Before the owner is asked to scan a QR, state which SDK his installed Go runs (Go → Settings
  shows it) and either pin the catalog to that SDK or point him at `https://sign.expo.dev` (installs
  a specific Go build with a free Apple ID, cert ≈ 7 days, inferred). Pinning to a different major
  moves ~22 catalog entries (`expo/bundledNativeModules.json`) and the lockfile: a 20-min task, not a
  "quick pin". After any SDK patch bump run `pnpm -F @tanren/mobile exec expo install --check` and
  paste it; its only accepted complaint is typescript 7 vs the SDK's ~6 (ADR-0003).

## Native sign-in in Expo Go (docs/design/native-auth.md; recipe docs/design/local-dev.md §6a)

- The emailed link must open on the PHONE (Safari), never the Mac: its "Open Tanren" button deep-links
  `exp://<host>/--/auth/callback?code=…` into Expo Go, `app/auth/callback.tsx` hands the code to
  `NativeSession`, which exchanges it (PKCE) and stores the token in `expo-secure-store` (Bearer via `withSession`).
- Local: `pnpm dev:phone` + `pnpm -F @tanren/mobile dev`, scan the terminal QR on the iPhone. Live
  Activities and other native modules still need a dev build, not Expo Go.

## Design system (v2, docs/design/design-system.md; proven on the export at 390/768/1280, light + dark)

- Import UI only from `src/ui` (`Page`, `AppBar`, `Text`, `Button`, `Card`, ...); no raw RN `Text` with
  font sizes, no hex or `rgb()` outside `src/ui/colors.ts` (drift grep: `grep -rn '#[0-9A-Fa-f]\{6\}'
  apps/mobile/src/components apps/mobile/app` must be empty); colours and spacing come from `useTheme()` /
  `useStyles` and the tokens; breakpoints from `useBreakpoint()` (phone < 600, tablet 600–899, desktop >= 900).
- Navigators are themed too: `app/_layout.tsx` wraps the Stack in `ForgeNavigationTheme`
  (`src/ui/navigationTheme.ts`, expo-router's re-exported `ThemeProvider`/`DarkTheme`/`DefaultTheme`,
  `background`/`card` = `colors.bg` of the APP scheme, not the OS scheme). A new navigator (Stack, Tabs,
  modal group) inherits it; one outside that provider paints React Navigation's default light theme
  between screens — the "flashes white on every click" the owner saw on production for four days
  (HOTFIX-1, 2026-10-27). Screenshots are taken after paint and cannot show it; use the ui-check
  mid-navigation ancestor-chain read.
- A pure sibling of a component never shares its basename in another case: `foodLog.ts` beside
  `FoodLog.tsx` is tsc TS1261 on macOS (monorepo skill); name it after its content (`foodLogRows.ts`,
  `quickAddMath.ts`), even when the brief says otherwise, and list the rename under Decisions (N-Q2).
- Copy and hit areas follow design-system.md §1 and §4 (sentence case, no all-caps or `textTransform`,
  44 px minimum on `IconButton`/`sizes.tap`); review checks them, so apply them before reporting.
  Inline text anchors too (`InlineAnchor`: `paddingVertical: 14` on a 16 px line = 44 without moving
  the line box) and adjacent targets ≥ 44 px apart (LEGAL-1 r4/r5, 2026-10-27).
- Headings on web: react-native-web 0.21 renders `accessibilityRole="header"` without a level as `<h1>`.
  Use the `Text` primitive's `headingLevel` (1 page title, 2 sections; `AppBar titleLevel`) so a page has
  exactly one `h1` — proof `document.querySelectorAll("h1").length === 1` (LEGAL-1 r3: 12 h1s on /privacy).
- Web hover/focus: `usePressableInteraction()` (`onHoverIn/Out` state; RNW's `hovered` is runtime-only and
  untyped; ring = `outline*` style, 2 px `colors.focus`, only for `:focus-visible`). New pressables use it.
- DOM-prop rule: never give `accessibilityElementsHidden` / `importantForAccessibility` to `Svg`,
  `Animated.View` or other DOM-forwarding elements (wrap in a `View`), and give a `Link asChild` child a
  single style object, not an array (a thrown render error leaves the exported page blank and silent).
  Check: `agent-browser errors --json` empty and no "does not recognize" in `console` (use a fresh
  `--session`: `errors --clear` does not reset the buffer).
- Web a11y state: react-native-web drops `accessibilityState.checked` (no `aria-checked` reaches the
  DOM), so a checkbox/toggle chip also sets `aria-checked={selected}` (`ToggleChip` in `src/ui`);
  `selected`/`disabled` do map. After editing a component, restart the dev server (kill the pid, start
  on a new port) before re-snapshotting: a stale Metro bundle cost EQ-2a a round (8187 → 8188). Plain
  RN-web `Text` is absent from `ab snapshot`: read copy with `ab eval 'document.body.innerText'`.
- RN-web text facts (Forge, 2026-10-21): `numberOfLines` becomes `overflow: hidden` on web and clips `textShadow`
  (the numeral glow) — pass it on native only or pad the `Text`. Web font proof: `[...document.fonts].map(f =>
  [f.family, f.status])` must list the `useFonts` keys (`BarlowCondensed-Bold`, `BarlowCondensed-ExtraBold`) as
  `loaded`; `document.fonts.check('700 20px "Barlow Condensed"')` is `true` for any family the page never declared,
  so it proves nothing (UI-1a's brief criterion could not fail). One `FontResource` per weight, each its own family
  with `weight`, or the web fake-bolds.
- Mobile vitest is Node-only (no renderer): every style, geometry or copy decision a screen makes lives in a pure
  `.ts` table next to the component (`src/ui/controls.ts`, `src/ui/iconPaths.ts`, `src/components/todayHeader.ts`,
  `src/player/playerHeader.ts`, `src/components/progress/chartGeometry.ts`) with a `*.test.ts`; the `.tsx` maps
  props to the table and is proven with ui-check measurements (`docs/design/ui-measure.js`: `small` [] + ramp-only).

## Programs / player (v2, docs/design/v2-programs.md §4)

- `expo-notifications` 58.1.6: `scheduleNotificationAsync({ trigger: { type:
  SchedulableTriggerInputTypes.TIME_INTERVAL, seconds } })`, `cancelAllScheduledNotificationsAsync`,
  `requestPermissionsAsync → { granted, ios?.status }` (`PROVISIONAL` counts as granted). Loaded by
  dynamic `import()` inside `PhaseAlerts.layer`, so node tests never load it (no-op + warning on failure);
  web uses the no-op. No foreground `setNotificationHandler`: the alert shows only in the background.
- `expo-audio` works on web (`ExpoAudio.web.d.ts` has `useAudioPlayer`); `assets/sounds/beep.wav` (6.7 KB)
  bundles into the export. Haptics are skipped on web behind `Platform.OS`; `useKeepAwake` is mounted
  (`app/programs/play.tsx`) only while Working/Resting.
- `EXPO_PUBLIC_PLAYER_SPEED` is inlined at export time (the bundle contains `parseSpeed)("10")`) and divides
  every duration; dev/proof only.
- Typed routes: a new route needs `CI=1 expo start --port <n>` until `.expo/types/router.d.ts` lists it; kill
  that PID afterwards. The same task adds the route to the `app/` block of `apps/mobile/CLAUDE.md` "Layout"
  (the canonical route inventory: designers spec, QA captures and the owner's gallery are built from it; five
  routes were missing from it on 2026-10-26 and the review set never showed Sign-in).
- Serve a scratch export so parallel engineers do not share `apps/mobile/dist`: `pnpm -F @tanren/worker exec
  wrangler dev -c wrangler.web.jsonc --port <n> --assets <dir>` (the config hardcodes `../mobile/dist`).

## PWA (v2 extras X5, verified 2026-10-21)

- `public/manifest.json` (`theme_color` #C2410C = light accent, `background_color` #FFFFFF) and
  `public/icons/{icon.svg, icon-192, icon-512, maskable-512, apple-touch-icon}.png` (rendered once from the
  SVG with agent-browser) are copied into the export; `public/index.html` comes from `expo customize`
  (works under the isolated linker) and needs its `biome-ignore lint/a11y/useValidLang` comment re-added
  after any re-customize. No service worker: `Page.getInstallabilityErrors` returns `[]` without one (CDP
  via `agent-browser get cdp-url`), Workers static assets serve `manifest.json` as `application/json`, and
  `crossOriginIsolated` stays true. An offline shell would be a Workbox step. Isolated proof: export to a
  scratch dir with `--output-dir`, serve it with a scratch copy of `wrangler.web.jsonc` whose
  `assets.directory` is absolute, on a spare port.

## Illustrations and muscle map (v2, verified 2026-10-21; details in apps/mobile/CLAUDE.md "Illustrations")

- The SVG stick-figure pipeline (scenes, rig, `illustrations:check`, `assets/exercises/*.svg`) is
  retired (commit "Illustrations: images re-encoded…"); do not revive or reference it.
- Pipeline: `pnpm images:generate [--samples | --only <id,…>] [--limit N] [--all]` (OpenAI
  `gpt-image-1`, 1024², medium, webp `output_compression` 80, key via `node --env-file-if-exists
  =.env.images`, `.claude/rules/secrets.md`) → `pnpm images:shrink` (sharp, 512² q80, idempotent) →
  `pnpm images:map` (rewrites `src/illustrations/images.ts`: one literal `require` per webp so Metro
  bundles it; `src/library/illustration.test.ts` checks map ↔ files ↔ catalog). Pure logic in
  `src/illustrations/imagePrompt.ts` (flags, selection, prompt from `assets/illustrations/style.md`,
  response schemas, `redactSecrets`); the script only does I/O.
- Cost guard: runs cap at 8 images unless `--all`, existing files are skipped, header states the
  estimate (235 @ medium ≈ $10). Size target: **≤ 3 MB for the whole `assets/illustrations/`
  folder** (`du -sh apps/mobile/assets/illustrations`), i.e. ≈ 10 KB per 512² webp; IMG-2 shipped
  11 MB at 1024² before `images:shrink` existed because "a few MB" was an estimate, not a check.
  A brief that adds bundled assets names the budget and the `du` command in Done-when.
- `ExerciseIllustration` (`src/library/`) renders `IMAGES[catalogId]` or the neutral placeholder;
  ids the safety system refuses (`frog-pump`, `cable-crunch`) stay on the placeholder — do not
  retry them with other wording.
- `MuscleMap` (`src/illustrations/muscleMap/MuscleMap.tsx`): props `{ primary, secondary:
  ReadonlyArray<MuscleGroup>; size: number }` (square; front and back figures side by side).
  `regions.ts`: `MUSCLE_REGION_MAP` maps each catalog `MuscleGroup` to 1–n of 22 `RegionId`s
  (`shoulders` → front/side/rear delts, `core` → abs+obliques, `fullBody` → all, `cardio` → heart);
  `regionsFor`, `regionTone` (primary wins over secondary), `muscleMapLabel` (a11y text).
  `body.ts` holds the paths and `MUSCLE_MAP_STYLE`. Paths are judged visually: preview with
  `node --import ./scripts/resolveTs.ts scripts/muscleMapSheet.ts` + agent-browser screenshot (MAP-1
  needed 3 path rounds; `set media dark` and `set viewport` switch live). Used on Library detail,
  the player and Progress exercise page (MAP-2).

## Vendor plugin skills

Mobile engineers load `expo:expo-overview` first, then `expo:expo-router`,
`expo:expo-native-ui`, `expo:expo-data-fetching`, `expo:eas-update` as needed,
and `frontend-design:frontend-design` for the Today/Plan screens; this skill
keeps only Tanren deltas.
