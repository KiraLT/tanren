---
name: expo-mobile
description: Expo + Expo Router, expo-sqlite offline store, EAS Update and web export as used in apps/mobile. Load for build steps 6–7 and any mobile or web UI work.
---

# Expo mobile for Tanren

Source of truth for the app's layout, store contract and commands:
`apps/mobile/CLAUDE.md`. Research: `docs/research/2026-10-20-expo-mobile.md`.
Official docs: https://docs.expo.dev/ (Router, SQLite, monorepos, web).

## Decided at step 6 (2026-10-20, gate green)

- Expo SDK 58 (`expo` 58.0.16, `expo-router` 58.0.24, `expo-sqlite`
  58.0.13, RN 0.88, React 19.3.0), pinned in the root `pnpm-workspace.yaml`
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
  10 s) — a product decision, open. Do not add a second `SqlDriver` opener
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
- Still open: EAS Update / Expo Go publish flow.

## Vendor plugin skills

Mobile engineers load `expo:expo-overview` first, then `expo:expo-router`,
`expo:expo-native-ui`, `expo:expo-data-fetching`, `expo:eas-update` as needed,
and `frontend-design:frontend-design` for the Today/Plan screens; this skill
keeps only Tanren deltas.
