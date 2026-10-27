# @tanren/mobile

Expo SDK 58 + Expo Router app (iPhone via Expo Go, web via `expo start --web`): an offline-first logger on a local
expo-sqlite store with batched push/pull sync. Contracts live in `docs/design/`, not here: `design-system.md`,
`ui-direction-final.md` (Forge), `ui-desktop.md`, `ui-polish.md`, `v2-programs.md` + `programs-mcp.md` (ADR-0026),
`v2-extras.md`, `feed.md` (ADR-0017), `integrations.md` (ADR-0018), `garmin.md` (ADR-0023), `nutrition.md` +
`health-module.md` (ADR-0025), `native-auth.md` + `auth-v2.md` (ADR-0022), `legal.md` (ADR-0024), `landing.md`
(ADR-0021), `local-dev.md` §6a (phone recipe). History is in `git log` and `docs/tasks/*`, not this file.

## Boundaries

- Depends on `@tanren/shared` for every data shape. Never imports from `apps/worker` or `packages/db`. Budget, targets,
  insights, PR math and `Activity` come from shared only, never re-implemented here.
- Plain React components, **no Effect inside components**: Effect runs in `src/services/` behind one `runtime`
  (`ManagedRuntime`) and reaches screens through `src/hooks/` (`runtime.runCallback` + `runFailed`, `src/hooks/runExit.ts`).
- Everything on Today works with no network; sync is a background concern.

## Layout

`ls src/*` and module headers give the exports; this is the map plus the gotcha per directory.

```
app/          ROUTE INVENTORY — every route, kept complete by whoever adds one (the task that adds a route
              adds its line); UI specs, QA capture sets and the owner's gallery are built from this list.
  _layout.tsx, index.tsx, sign-in.tsx, auth/callback.tsx (native sign-in deep link),
  (tabs)/_layout.tsx (themed tabs from `APP_NAV`, hidden at desktop), (tabs)/{today,train,activity,you}.tsx — You (ADR-0029) = Account · Insights · Setup · About rows, gear → `/settings`; Train
  (ADR-0029) = Plan · Programs · Library segments, `?view=plan|programs|library` is the source of truth (in-app links use
  `/train?view=…`; `/plan`, `/programs`, `/library`, `/feed` are NotFound by design), bodies in `src/components/train/`
  root Stack: activity/[sessionId].tsx, activity/imported/[id].tsx, library/[catalogId].tsx, programs/play.tsx (Player,
  `nav={false}`, `?enrollmentId=` REQUIRED, only an `active` one opens), programs/[programId].tsx (detail),
  programs/[programId]/day/[n].tsx (read-only day preview; folder beside `[programId].tsx`, both resolve),
  programs/new.tsx (blank or `?from=` duplicate), programs/edit/[programId].tsx (program editor),
  programs/edit/[programId]/day/[n].tsx (day editor), programs/pick.tsx (`?pickFor=<programId>/<day>`
  exercise picker), programs/swap.tsx (`?enrollmentId=&from=` swap sheet) — team programs v6b,
  progress/{index,[exerciseId]}.tsx, review.tsx (Weekly review, `WeekReviewRepo` + `useWeekReview`, ADR-0029), settings.tsx, settings/location/[id].tsx,
  settings/integrations/{index,[provider]}.tsx, settings/nutrition.tsx, health/index.tsx (Health),
  health/add.tsx (quick-add modal; the one `Stack.Screen` child in `_layout.tsx`) — v6 nutrition, privacy.tsx +
  terms.tsx (public legal pages, ADR-0024: `isPublicRoute` in `authGate.ts` lets a signed-out device open them; both render `LegalPage`)
  Not a route but owner-visible: the magic-link email (apps/worker `magicLinkEmail`); the signed-out web landing
  (`src/components/landing/Landing.tsx`, rendered by `_layout.tsx` on every gated route instead of the `/sign-in` redirect).
src/ui/       the design system; screens import UI from `src/ui` ONLY. `colors.ts` is the one place with hex; pure style tables
              (`tokens`, `controls`, `chipVariant`, `columns`, `confirmLayout`) each have a test; `iconPaths.ts` has no `chevronUp`
              (rotate `chevronDown`); `Confirm.tsx` = `useConfirm` / `ConfirmProvider` (native Alert, Forge alertdialog on web —
              bare `Alert.alert` is a no-op on web).
src/services/ one Effect service per repo/port (`*Repo`, CurrentUser, NativeSession, Account, SyncEngine, PhaseAlerts, …).
              `Integrations` and `AccountErasure` are provided per call, not in `runtime.ts`. `DataExporter` (the shared schema is
              `DataExport`). `authGate.ts` is pure.
src/components/ screen pieces on `src/ui`, one folder per screen. Pure modules sit beside the `.tsx` under ANOTHER name (`Foo.tsx` +
              `foo.ts` collide on macOS, TS1261). `volumeFormat.ts` is the leaf (planFormat/progressFormat import it, never each
              other). Charts are hand-rolled react-native-svg, no chart library. legal/legalCopy is verbatim legal.md §1–§2.
src/player/   playerMachine (pure), cues, playerEffects, usePrograms, components/     src/hooks/  one hook per read/write; Promise APIs never reject
src/library/  catalog list/detail; `clampSubtitle` clamps phone subtitles (33 chars at 390) although ListRow has `titleLines`/`subtitleLines`
src/store/    migrations (append-only, `PRAGMA user_version`), seed (demo rows, `_dirty=0`), localUser (LOCAL_USER_ID), syncQueries
src/illustrations/ prompts (`MISSING_MUSCLE_MAPS` = []) + generated `require` maps images.ts / muscleMapImages.ts   src/pwa/  sw template, precache
scripts/      image / muscle-map / logo / landing generators (OpenAI), shrink, index, serviceWorker, resolveTs
assets/illustrations/<id>.webp 512² + style.md · assets/musclemaps/<id>.webp 384² · assets/brand/ W1 wordmark + T mark icon set
public/_headers (COOP/COEP, copied into dist/) · public/manifest.json + icons/ · expo-types.d.ts (typed routes, committed)
```

## Local store contract

- Quoted camelCase columns so the shared `*Row` codecs decode records unchanged; extra columns `_dirty`, `_rejected`; table
  `sync_state`; no foreign keys. v4 = `imported_activity` + `daily_health` (pull-only, never dirtied), v5 = `food_entry` +
  `profile.nutrition`, v6 = `program` + `program_enrollment.swaps`. `DataExporter` covers all 13 sync tables; `AccountErasure`
  wipes every table `sqlite_master` lists.
- Writes go through the repos (TodayRepo serialised by a semaphore) and emit `StoreEvents`, which reloads Today.
- Finish: `TodayRepo.finishSession` sets `finishedAt` (no-op for unknown/finished/zero-set sessions); the open-session query
  filters `finishedAt IS NULL`. `SyncEngine` runs `finishStaleSessions(now)` (`STALE_SESSION_HOURS` 3) only after a complete
  `pullLoop` — never at startup or from `useToday` (an un-pulled device would back-date `finishedAt`).
- Sync (`SyncEngine.background` via `useSync`): on mount, every 60 s, and `PUSH_DEBOUNCE` 500 ms after `requestSync` (every write
  hook sends it). Pull applies a row only if strictly newer; push conflicts tie to the server; accepted/rejected marks apply only if
  `updatedAt` is unchanged; an undecodable dirty row is flagged `_rejected = "invalid"`, not retried. Transport methods are
  `sendChanges`/`fetchChanges`: the noMutation plugin is syntactic and flags any `x.push/pop/shift/unshift/splice/sort/reverse/fill(...)`
  — never name an own method so; third-party ones (`router.push`) get `// biome-ignore lint/plugin/noMutation: <reason>`.
- Owner: `CurrentUser.signedIn` resolves once per runtime (dev `EXPO_PUBLIC_DEV_USER_ID`, else Better Auth / `NativeSession`, else
  stored `sync_state.ownerUserId` offline). Signed out: rows carry `LOCAL_USER_ID` and the demo seed runs. Signed in:
  `SyncEngine.rekeyLocalUser` moves local rows to the user before the first sync. Not built: a different user on the same device
  (full wipe); reads have no `userId` filter (one owner per device after re-key).

## Expo facts

- tsconfig extends `expo/tsconfig.base.json` (with `.json`) and `../../tsconfig.base.json`; `typedRoutes` on (else `expo start`
  rewrites tsconfig). Isolated pnpm linker, no metro `watchFolders`. A new route needs one `CI=1 expo start --port <n>` to
  regenerate `.expo/types/router.d.ts`, else `tsc` rejects `Link href`. Stale Metro after edits: restart; `--clear` is not enough.
- Native deps (all Expo Go, pinned from SDK 58 `bundledNativeModules.json`): `expo-notifications` (plugin,
  `enableRemoteNotifications: false`), `expo-haptics`, `expo-audio`, `expo-keep-awake`, `expo-secure-store`, `expo-crypto` (ids via
  an app `IdGenerator`; Hermes `crypto.randomUUID` unverified). `expo-widgets` / Live Activities need a dev build (ADR-0012): not added.
- Web: sqlite wasm needs cross-origin isolation (COOP + COEP): the dev server sends it, the export ships `public/_headers`, applied by
  the assets-only Worker (`apps/worker/wrangler.web.jsonc`). `EXPO_PUBLIC_API_URL` (else Expo `hostUri` host `:8787`, else
  `localhost:8787`) and `EXPO_PUBLIC_PLAYER_SPEED` are inlined at export time; `__DEV__` is false in an export. Web is single-tab:
  `PageSqlDriver` holds a page-lifetime Web Lock (evicts a bfcached holder of the OPFS handle); a second tab fails with
  `DatabaseInUse` after `LOCK_TIMEOUT` and shows "Tanren is open in another tab" (open product decision).
- Breakpoints (`useBreakpoint`): phone < 600, tablet 600–899 (one 600 column, bottom tabs), desktop ≥ 900 (tab bar hidden, `AppBar`
  renders `APP_NAV`). Desktop columns (ui-desktop.md §2–§3; maths only in `src/ui/columns.ts`): splits `"7/5"` (default) · `"5/7"` ·
  `"6/6"`, columns ≥ `MIN_COLUMN` 364, every split 6/6 below a 1024 window; at 1280 7/5 = 696/496. `Page` takes `aside` + `split` or
  `wide`; Loading/Empty/Failed/not-found states never pass either. `sectionGap` default `space.lg` 16. `StatRow variant="tile"` at
  desktop for Today/Plan/Programs, `"plain"` for Feed/Activity. `cardStyle` keeps a 1 px border in dark so both schemes measure the same.
- Theme: colours only from `useTheme().colors` / `useStyles`; `useThemePreference` persists on web only. Web hover/focus via
  `usePressableInteraction`. Never pass `accessibilityElementsHidden` / `importantForAccessibility` to a DOM-backed element (`Svg`,
  `Animated.View`): wrap it in a `View`. A child of `Link asChild` needs an object `style`, not an array (an export renders blank).
  RN web ignores `hitSlop` (small controls keep a 44-px Pressable). A button inside a `Card` uses `variant="raised"`.
- Plan reads only `PlanWeekRepo.currentWeek` (live active plan, `weekStart <= today < weekStart + 7`, ADR-0007). Rest-day proofs: the
  seed plan has no Tuesday session — run agent-browser with e.g. `TZ=Pacific/Kiritimati`. Signed out always seeds the demo plan, so
  empty-state proofs need a signed-in empty account.
- Auth (native-auth.md, ADR-0022): web = magic-link cookie flow (`credentials: "include"`, absolute `<origin>/today` callbackURL;
  the redirect is a full load, so the runtime rebuilds). Native = one-time code at `/auth/callback?code=` → `NativeSession` (PKCE,
  SecureStore `tanren.access/refresh/expiresAt`, Bearer, single-flight refresh at `expiresAt − 30 s`; only a 401 clears the pair;
  a failed sign-out revoke is deferred in `tanren.pendingRevoke` and retried before any new pair is stored, STLS-R). Sign-out keeps
  local rows. Gate (ADR-0019): `gateFor` says `"sign-in"` only with no account AND `localSetCount` = 0 AND a non-public route.

## Programs (v2-programs.md; programs-mcp.md §4, ADR-0026)

- Built-ins (`PROGRAMS`) + the owner's live `program` rows (ids matched case-insensitively). Statuses `active | paused | completed |
  abandoned` (several active, one per program; terminal → `EnrollmentTerminal`). `complete` accepts only `day === currentDay`
  (`DayOutOfOrder`) and logs one session + one set per performed item-round; a repeat for the same day writes nothing.
  Schedule is a sequence (§6, PROG-4): a missed day stays due; one day per local calendar day (`DayDoneToday`), and
  `ActiveProgram.doneToday` (read against `DateTime.now`, so `usePrograms` and `useDueToday` also re-read on refocus, `useRefocusCount`) hides Start everywhere.
- Swaps live on the enrollment keyed by the ORIGINAL catalog id. Mid-workout `mergeDay` renames only open item-rounds; done rounds
  keep the exercise performed (`performedIds`) — history is never rewritten.
- Player: `playerMachine` is pure, a late `tick` chains every elapsed phase; `phaseKey` changes on pause/resume so cues compare
  `_tag`s. `PhaseAlerts` loads `expo-notifications` by dynamic `import()` (web/tests → no-op). Editor: no draft, every change writes
  `ProgramRepo.save` (version + 1); `writeGate` drops `queued` writes while a `positional`/`leave` write is pending. Every
  destructive action confirms through `useConfirm` (CONFIRM-1/2), never an inline Banner.

## Illustrations and brand

- Generated, not drawn: `pnpm images:generate [--only <id,…> | --all] [--transparent] [--out <dir>]` → `images:shrink` → `images:map`
  (rewrites `images.ts`; `illustration.test.ts` checks map vs files vs catalog); muscle maps `muscle:generate` (`--reference`
  recolours a good map) → `scripts/muscleMapIndex.ts`; `logo:generate --w1-export <png>` rebuilds the icon set without a paid run.
  Key = `OPENAI_API_KEY` in git-ignored `.env.images`, read only by the scripts. `gpt-image-1` is refused for this account on both
  image endpoints (probed 2026-10-26): use `gpt-image-1.5`, `background: "opaque"` for icons. The safety filter refuses some ids at
  random: rerun them. All 291 ids have both images. In dark, `ExerciseIllustration` puts a `surfaceRaised` backdrop behind the figure on purpose.
- PWA: `manifest.json` + `index.html` colours = brand graphite `#16181D` (`manifest.test.ts`); `public/index.html` comes from `expo
  customize` and needs its `biome-ignore lint/a11y/useValidLang` comment re-added after a re-customize. `scripts/serviceWorker.ts`
  writes `dist/sw.js` AFTER `expo export` (no skipWaiting; `_headers` sends `/sw.js` `no-cache`).

## Feed, Progress, Garmin (feed.md, v2-extras.md, garmin.md)

- Tabs: Home (`/today`) · Train · Activity (the feed, route `/activity`) · You (`/you`; Progress, Health, Weekly review, Settings live behind it, not in Activity's bar). `FeedRepo.activities(limit)` → `FeedItem` `{_tag:"session"|"imported"}`;
  `activity(id)` is session-only, so an imported card opens `/activity/imported/[id]` (one 600 column at every width). Feed desktop
  aside is built only when Ready with items. `HistoryRepo` serves only Progress (a PR strictly beats every earlier set).
- Garmin (`GarminCard`): the token is component state, cleared after every attempt; Connect has its own 30 s timeout
  (`GARMIN_CONNECT_TIMEOUT_SECONDS`, other calls 5 s) and reloads status after a failure; a rejected connect keeps "Not connected"
  (only the revoked status says "Token rejected"). The Worker's "today" is UTC: Today can read "Burned: no data" 00:00–02:00 EET.

## Nutrition (nutrition.md §3–§7, health-module.md, ADR-0025)

- `FoodEntryRepo.insert(FoodEntryDraft)` assigns id/owner/timestamps/totals; `NutritionRepo.day(date)` / `.week(monday)` read in
  `CurrentTimeZone` (a day = device-local midnight to midnight; insights read the 7 days ENDING the date). Rulings: budget = goal
  intake (burn is information, "as of HH:MM"); eat-back only when `eatBackActive`; insights ≤ 3; numbers via shared `formatInt`.
- Today `HealthModule` (pressable → `/health`; phone = `TodayReady banner`, two-column = `asideTop`): rings + "Left today" + Eaten ·
  Burned · Protein + `metaLine` (never bpm) + first insight; 358 × 214 without an insight, 236 with one line, 252 when it wraps
  (HM-F2). Hidden when `moduleHidden`. Row 3: "Waiting for Garmin" when connected but no `daily_health` row yet, "No tracker
  connected" only without a tracker (HM-F1). Text in `health/nutritionText.ts` (`healthStats`).
- `/health`: Off (no targets) never waits on the week read; `WeekBars` are the calendar week Mon–Sun (7 burned bars need a seed
  `--end <a Sunday>`); resting HR only here (plan Amendment 26). Quick-add: local `QUICK_ADD` only, a direct load pops to `/today`.
  Settings → Nutrition: the draft is seeded once (a sync pull mid-edit is overwritten by Save; known limit); eat-back row only while
  Garmin is `connected`. vitest runs only `src/**/*.test.ts`: a `.test.tsx` never runs.

## Commands

`pnpm -F @tanren/mobile web` · `dev` (Expo Go) · `test` · `typecheck` · UI acceptance via the `ui-check` skill (agent-browser).
Web build: `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm -F @tanren/mobile export:web` → `apps/mobile/dist/` (git-ignored; also
writes `dist/sw.js`) · `pnpm web:serve` (= `wrangler dev -c wrangler.web.jsonc --port 8790`) · `pnpm -F @tanren/worker exec wrangler
deploy --dry-run -c wrangler.web.jsonc`. Start wrangler through the bare binary with a pid file (`node_modules/.bin/wrangler dev … &
echo $! > $S/<task>-web.pid`) and stop it by pid (`P=$(cat $S/<task>-web.pid); [ "${P:-0}" -gt 1 ] && kill "$P"`); never `pkill`
(engineer rule 9). Parallel proofs: export to a scratch dir and serve it with `wrangler dev -c wrangler.web.jsonc --port <n>
--assets <dir>` (the config hardcodes `../mobile/dist`). Load `expo:expo-overview` before Expo work; our rules win on conflict.
