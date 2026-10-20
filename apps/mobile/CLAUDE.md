# @tanren/mobile

Expo SDK 58 + Expo Router app (iPhone via Expo Go, web via `expo start --web`).
A fast offline-first logger: local expo-sqlite store, batched push/pull sync
with the worker, Today screen first.

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
  _layout.tsx, index.tsx, (tabs)/_layout.tsx, (tabs)/today.tsx, (tabs)/plan.tsx (stub)
src/
  services/   SqlDriver (+ .testing), LocalStore, TodayRepo, StoreEvents, CurrentUser,
              SyncEngine, SyncTransport, MockSyncServer, apiBaseUrl, runtime
  store/      migrations, seed (demo rows, _dirty=0), localUser (LOCAL_USER_ID), syncQueries
  hooks/      useToday, useLogSet (Promise<boolean>; never rejects), useSync, useRestTimer
  components/ Screen, BigButton, Stepper, SetList, ExercisePage, ExercisePager,
              RestTimerBar, TodayReady, theme, stepMath, setRows
expo-types.d.ts (typed routes, committed) · metro.config.js (wasm asset) · vitest.config.ts
```

## Local store contract

- Quoted camelCase columns so the shared `*Row` codecs decode records
  unchanged; extra columns `_dirty`, `_rejected`; table `sync_state`;
  schema version via `PRAGMA user_version`; no foreign keys.
- Writes go through `TodayRepo` (serialised by a semaphore) and emit
  `StoreEvents`, which reloads Today.
- Sync (`SyncEngine`): on mount, every 60 s, and on `syncNow`; pull applies a
  row only if strictly newer, push conflicts tie to the server; accepted /
  rejected marks apply only if `updatedAt` is unchanged since the push.
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
  to the user before the first sync. Sign-in UI and "different user on the
  same device" (full wipe) are not built yet.

## Expo facts

- tsconfig extends `expo/tsconfig.base.json` (with the `.json` suffix) and
  `../../tsconfig.base.json`; `typedRoutes` on (else `expo start` rewrites
  tsconfig). Isolated pnpm linker, no metro `watchFolders`.
- Ids from `expo-crypto` behind an app `IdGenerator` (Hermes
  `crypto.randomUUID` unverified).
- Web: sqlite wasm needs `Cross-Origin-Embedder-Policy: credentialless` and
  `Cross-Origin-Opener-Policy: same-origin` from the host (dev server sends
  them; the Worker must at deploy).
- API base: `EXPO_PUBLIC_API_URL`, else Expo `hostUri` host with `:8787`,
  else `http://localhost:8787`.

## Commands

`pnpm -F @tanren/mobile web` · `dev` (Expo Go) · `test` · `typecheck` · UI acceptance via the `ui-check` skill (agent-browser).
Load `expo:expo-overview` before Expo work; our rules win on conflict.

## Status

Step 6 (2026-10-20, company mode): M1–M4 done, 51 tests, reviewed. INT-2b
(2026-10-20): web ↔ local worker proven end to end with agent-browser, no code
change: magic link → cookie → get-session → re-key → pull → log set → push →
server pull shows it. `localhost:8081` and `:8787` are the same site, so the
SameSite=Lax cookie rides `credentials: "include"`. The seed plan has no session
on Tuesdays: to test Today on a rest day, launch agent-browser with e.g.
`TZ=Pacific/Kiritimati` (Chrome inherits `TZ`). Open: sign-in UI, Expo Go
(native cookie storage), a manual rest → swipe pass.
