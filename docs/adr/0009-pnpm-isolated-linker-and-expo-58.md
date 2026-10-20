# ADR-0009: pnpm isolated node linker and Expo SDK 58

Date: 2026-10-20 · Status: **accepted** (Lead decision under owner delegation, 2026-10-20; plan Amendment 3) · Step 6 · Author: architect, recording the mobile team's choice

## Context

Step 6 added `apps/mobile` to a pnpm workspace that already had three packages on pnpm's default
**isolated** linker (symlinked, non-hoisted `node_modules`). Metro historically broke on that
layout, and the common advice for Expo in pnpm monorepos was `node-linker=hoisted` plus
`watchFolders` / `extraNodeModules`. Expo's monorepo guide now says Metro is configured
automatically and that isolated pnpm is supported since SDK 54, with hoisted as the fallback
(`docs/research/2026-10-20-expo-mobile.md`). Expo SDK 58 (`expo` 58.0.16, React Native 0.88,
React 19.3) was the current SDK; the Expo Go app in the App Store runs only the current SDK, and
the plan fixes Expo Go plus EAS Update for the iPhone.

## Decision

1. **Isolated linker stays.** No `nodeLinker` / `node-linker` key in `pnpm-workspace.yaml` or
   `.npmrc`. `apps/mobile/metro.config.js` uses `expo/metro-config` defaults, with no
   `watchFolders`, `extraNodeModules` or `disableHierarchicalLookup`; its only addition
   registers the expo-sqlite `.wasm` asset for web.
2. **Expo SDK 58**, versions pinned in the root catalog from Expo's `bundledNativeModules.json`,
   not npm latest: `expo` 58.0.16, `expo-router` 58.0.24, `expo-sqlite` 58.0.13, `expo-crypto`
   58.0.7, `expo-constants` 58.0.12, `expo-linking` 58.0.13, `expo-status-bar` 58.0.3,
   `@expo/metro-runtime` 58.0.14, `react-native` 0.88.0, `react` / `react-dom` 19.3.0,
   `react-native-web` 0.21.4, `react-native-screens` 4.30.0, `react-native-safe-area-context`
   5.10.1. Upgrades: `npx expo install --check` reports drift; an SDK major is a new ADR.
3. **Gotchas recorded so they are not rediscovered:** `apps/mobile/tsconfig.json` extends
   `expo/tsconfig.base.json` **with** the `.json` suffix (bare specifier fails to resolve under
   the isolated layout) and then `../../tsconfig.base.json` so strict flags win;
   `experiments.typedRoutes: true` in `app.json`, otherwise `expo start` rewrites the tsconfig
   (`expo-types.d.ts` is committed); `"main": "expo-router/entry"`; only the scaffold task runs
   `pnpm install`.

Evidence: mobile package gate green (51 tests), web bundle builds, `ui-check` drove the Today
screen end to end against the local Worker (`apps/mobile/CLAUDE.md` "Status"). `VERIFY:` Expo Go on
a physical iPhone resolving every native module under isolated `node_modules`; first checked by the
step 7 EAS Update task.

## Consequences

- One linker for all four packages; the worker and db keep strict dependency isolation (no
  phantom imports), which the gate relies on.
- Fallback if Expo Go or Metro fails on a native module: `nodeLinker: hoisted` in
  `pnpm-workspace.yaml`, a workspace-wide re-install and a full gate run. Recorded here so the
  fallback is a one-line decision, not a new investigation.
- Expo package versions diverge from npm latest on purpose; engineers do not "upgrade" them
  piecemeal.

## Alternatives considered

- **Hoisted linker**: works with every Metro version, but weakens isolation for the Worker and
  db packages and was not needed. Rejected; kept as the fallback.
- **Expo SDK 54 or 55**: older APIs and, decisively, not runnable in the App Store Expo Go, which
  only ships the current SDK. Rejected.
- **Development build / EAS Build instead of Expo Go**: removes the Expo Go constraint but adds a
  native build pipeline the plan does not ask for. Rejected for now.
