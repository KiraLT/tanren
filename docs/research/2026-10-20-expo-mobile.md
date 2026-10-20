# R1: Expo SDK 58 facts for apps/mobile (checked 2026-10-20)

Sources: [npm] = `npm view`; [bnm] = https://raw.githubusercontent.com/expo/expo/sdk-58/packages/expo/bundledNativeModules.json (the `expo install` source of truth); [docs] = docs.expo.dev / expo/expo sdk-58 branch.

## 1. Package set (all verified [bnm], equal to npm latest unless noted)
| Package | Spec | Note |
|---|---|---|
| expo | ~58.0.16 | [npm] |
| react / react-dom | 19.3.0 (bnm); npm latest react-dom is 19.3.1 | use bnm pin 19.3.0 for both |
| react-native | 0.88.0 | |
| expo-router | ~58.0.24 | |
| expo-sqlite | ~58.0.13 | |
| expo-constants | ~58.0.12 | router peer |
| expo-linking | ~58.0.13 | router peer |
| expo-status-bar | ~58.0.3 | |
| react-native-safe-area-context | ~5.10.1 | |
| react-native-screens | ~4.30.0 | |
| react-native-web | ~0.21.4 | |
| @expo/metro-runtime | ~58.0.14 | router peer |
| expo-crypto | ~58.0.7 | optional, see 4 |
| react-native-gesture-handler / reanimated | ~3.3.0 / 4.7.1 | not needed; skip |

Router peers (expo-router package.json, sdk-58): @expo/metro-runtime, expo, expo-constants, expo-linking, react, react-dom, react-native, react-native-gesture-handler (optional-ish), etc. [docs: github expo-router/package.json]. Inferred: install `expo-router` + the four peers listed above via `pnpm -F @tanren/mobile add`.

- `package.json`: `"main": "expo-router/entry"`. Current apps/mobile/package.json has `"type":"module"`, `exports`, and `types` pointing at src/index.ts; Metro/Expo expect `main`. `main` is from Expo docs/templates (unverified for this repo's `exports` field; keep both, `main` is what Expo reads). Inferred.
- Minimal app.json (inferred from docs; unverified compile): `{"expo":{"name":"Tanren","slug":"tanren","scheme":"tanren","plugins":["expo-router"],"web":{"bundler":"metro","output":"single"}}}`. Plugin `expo-router` is required by docs; `scheme` needed for deep links/linking. `experiments.typedRoutes: true` is the docs flag for typed routes (docs router typed-routes.mdx, "while in beta").
- Metro monorepo: [docs https://docs.expo.dev/guides/monorepos/] "Expo configures Metro automatically for monorepos"; delete `watchFolders`, `resolver.nodeModulesPath`, `extraNodeModules`, `disableHierarchicalLookup`. So metro.config.js is only needed for wasm (see 3): `const { getDefaultConfig } = require('expo/metro-config')`.
- Isolated pnpm supported since SDK 54; `nodeLinker: hoisted` only as fallback [docs monorepos].
- tsconfig: `expo/tsconfig.base` [bnm-sibling file packages/expo/tsconfig.base.json]: allowJs, esModuleInterop, jsx react-jsx, lib [DOM, ESNext], module preserve, moduleResolution bundler, customConditions ["react-native"], noEmit, skipLibCheck, target ESNext. It does NOT set strict flags; keep our strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes from tsconfig.base.json. Inferred: `extends` accepts only one base in a string; TS 5+ allows an array `"extends": ["expo/tsconfig.base","../../tsconfig.base.json"]` (put the repo base last so its strictness wins) (unverified).

## 2. Router tabs and swipe paging
- Tabs [docs https://docs.expo.dev/router/advanced/tabs/]: `app/(tabs)/_layout.tsx`: `import { Tabs } from 'expo-router'; export default function L(){ return <Tabs><Tabs.Screen name="index" options={{title:'Home'}}/></Tabs> }`. Docs also offer Native tabs and headless `expo-router/ui` tabs. Docs example uses `src/app/`, so `src/app` is supported (Router looks in `app` or `src/app`).
- Swipe paging: react-native-pager-view docs page lists `platforms: ['android','ios','expo-go']`, no web [docs view-pager.mdx]. Its version in bnm is 9.0.7 (npm latest 9.0.9).
- react-native-web 0.21 ScrollView implements `pagingEnabled` via CSS: horizontal -> `scrollSnapType: 'x mandatory'`, children `scrollSnapAlign: 'start'` [RNW 0.21.0 ScrollView/index.js lines 764-771]. On iOS RN ScrollView `pagingEnabled` is native. Recommendation: horizontal `ScrollView`/`FlatList` with `pagingEnabled`, each page `width = useWindowDimensions().width` (web two-column: page width = container width via onLayout). Caveats unverified: RNW FlatList `pagingEnabled` child wrapping, mouse-drag swipe on desktop web (scroll-snap works with trackpad/touch only), `onMomentumScrollEnd` is emitted on web (inferred) so prefer `onScroll` + round(x/width) for index.

## 3. expo-sqlite (58.0.13) [docs https://docs.expo.dev/versions/latest/sdk/sqlite/ and sdk-58 sqlite.mdx]
- API (docs): `SQLite.openDatabaseAsync(name)`; `db.execAsync(sql)` ("does not escape parameters", multi-statement, e.g. PRAGMA journal_mode=WAL); `db.runAsync(sql, ...)`; `db.getAllAsync(sql, ...)` (all rows at once; use `getEachAsync` for big sets); `getFirstAsync`. Binding: "You can pass values in array, object, or variadic arguments"; named params use `$name` form.
- Transactions: `withTransactionAsync(fn)` works on web but "is not exclusive and can be interrupted by other async queries"; `withExclusiveTransactionAsync` "is not supported on web". Recommendation: single code path via `withTransactionAsync` (or serialize writes in one Effect queue/semaphore) so web and iOS behave the same.
- `SQLiteProvider` (Context.Provider; `useSQLiteContext()`; `useSuspense` prop; `onInit`). Outside React components (Effect-only code) open the DB with `openDatabaseAsync` directly.
- Web: supported platform; changelog has `[Web]` entries; no "alpha" text found on page (grep of sdk-58 mdx for alpha/beta/experimental: none). `openDatabaseAsync` `directory` param unsupported on web.
- Web setup (verified, sdk-58 diff file sqlite-web-metro-config.diff): metro.config.js
  ```js
  const { getDefaultConfig } = require('expo/metro-config');
  const config = getDefaultConfig(__dirname);
  config.resolver.assetExts.push('wasm');
  config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
  module.exports = config;
  ```
  Dev: `expo start --web` then works with those headers. Deploy (Workers static assets): must send the same COEP `credentialless` + COOP `same-origin` headers (Workers `_headers` file; inferred); on EAS Hosting use the `expo-router` plugin `headers` option. `SQLite.configureWeb({ wasmURL })` only needed for a custom (FTS) wasm build; not required.

## 4. Expo Go and misc
- expo-sqlite, expo-crypto, expo-constants, expo-router are in Expo Go (expo-crypto page "Included in Expo Go" [docs crypto]; expo-sqlite is a standard Expo Go module, inferred from docs listing, not individually checked). Expo Go for SDK 58 must be the SDK-58 build from the App Store (inferred).
- `crypto.randomUUID`: unknown whether Hermes/RN 0.88 provides a global (web search found no source). Verified alternative: `import { randomUUID } from 'expo-crypto'` -> `ExpoCrypto.randomUUID()`, V4 UUID [sdk-58 Crypto.ts line 176]. Recommendation: use expo-crypto on native, and on web `crypto.randomUUID()` (browser, secure context only) via a small `newId` wrapper; or expo-crypto everywhere (it has web platform listed in the docs header).
- Dev host IP: `Constants.expoConfig?.hostUri` (type `hostUri?: string` in ExpoConfig, expo-constants sdk-58 Constants.types.ts lines 127/198). Value is `"<lan-ip>:8081"` in dev with Expo Go (format inferred from usual behaviour; strip the port, split(':')[0]); undefined in production builds. Use it to derive `http://<ip>:8787` for wrangler dev.

## Unknowns
- Hermes global `crypto.randomUUID` in RN 0.88; desktop mouse-drag on scroll-snap pager; exact ExpoConfig/hostUri value format in SDK 58; whether `exports` in package.json interferes with Metro entry (try and see).
