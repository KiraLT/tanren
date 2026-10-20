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
  _layout.tsx, index.tsx, sign-in.tsx, (tabs)/_layout.tsx, (tabs)/today.tsx, (tabs)/plan.tsx
src/
  services/   SqlDriver (+ .testing), LocalStore, TodayRepo, PlanWeekRepo, StoreEvents,
              CurrentUser, SyncEngine, SyncTransport, MockSyncServer, apiBaseUrl, magicLink, runtime
  store/      migrations, seed (demo rows, _dirty=0), localUser (LOCAL_USER_ID), syncQueries
  hooks/      useToday, usePlanWeek, useLogSet (Promise<boolean>; never rejects), useSync,
              useRestTimer, useLayoutMode (+ pure layoutMode), useSignedIn, useSendMagicLink
  components/ Screen (optional `aside`), BigButton, Stepper, SetList, ExercisePage, ExercisePager,
              RestTimerBar, TodayReady, PlanWeek, PlanDayRow, PlannedSessionCard (+ SessionBlocks),
              theme, stepMath, setRows, planFormat, planSelection, planWeekFixture (tests only)
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
- Two columns iff `useWindowDimensions().width >= 900` (`WIDE_BREAKPOINT`):
  `Screen` renders `aside` (max 480, gap 24) only then. Today aside = current
  exercise's SetList + RestTimerBar (read-only, no Log set button); Plan aside
  = the selected session's card (tap selects; default today's, else next
  upcoming, else first). Ready states render their own `Screen`.
- Plan screen reads only `PlanWeekRepo.currentWeek` (live active plan, live
  week with `weekStart <= today < weekStart + 7`, any weekday — ADR-0007),
  no endpoint. Status: done (live workout_session links it) > today > missed
  > upcoming. No `userId` filter (one owner per device after re-key).
- Sign-in: `/sign-in` posts `/api/auth/sign-in/magic-link` with
  `credentials: "include"` and an absolute `<origin>/today` callbackURL
  (Better Auth `trustedOrigins` = worker `ALLOWED_ORIGINS`); the link's
  redirect is a full page load, so the runtime rebuilds and `CurrentUser`
  resolves the session. Adding a route needs one `expo start` to regenerate
  `.expo/types/router.d.ts`, else `tsc` rejects `Link href`. **Sign-in is web-only in v1**
  (`signInSupported(platform)`, true only for web): on native Today shows "Sign in on the web app
  for now" instead of the link, `/sign-in` shows the same notice, and no `exp://` callback is ever
  sent (it would be 403 against `trustedOrigins`, and the emailed link opens in Safari, not Expo
  Go). Native auth is a later task, two candidate designs: a deep link plus a one-time token
  exchange, or running the auth flow in a WebView.
- API base: `EXPO_PUBLIC_API_URL`, else Expo `hostUri` host with `:8787`,
  else `http://localhost:8787`.

## Commands

`pnpm -F @tanren/mobile web` · `dev` (Expo Go) · `test` · `typecheck` · UI acceptance via the `ui-check` skill (agent-browser).
Web build: `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm web:export` → `apps/mobile/dist/` (git-ignored) · `pnpm web:serve` (= `wrangler dev -c wrangler.web.jsonc --port 8790`) · `pnpm -F @tanren/worker exec wrangler deploy --dry-run -c wrangler.web.jsonc`. Stopping a wrangler started via pnpm: kill its children too (`pkill -P <pid>`).
Load `expo:expo-overview` before Expo work; our rules win on conflict.

## Status

Step 6 (2026-10-20, company mode): M1–M4 done, 51 tests, reviewed. INT-2b
(2026-10-20): web ↔ local worker proven end to end with agent-browser, no code
change: magic link → cookie → get-session → re-key → pull → log set → push →
server pull shows it. `localhost:8081` and `:8787` are the same site, so the
SameSite=Lax cookie rides `credentials: "include"`. The seed plan has no session
on Tuesdays: to test Today on a rest day, launch agent-browser with e.g.
`TZ=Pacific/Kiritimati` (Chrome inherits `TZ`). Open: a manual rest → swipe
pass on a phone in Expo Go (offline logging only; sign-in is web-only, see above).

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
