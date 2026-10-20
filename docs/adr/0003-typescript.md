# ADR-0003: TypeScript 7 (native `tsc`) for type checking

- Status: accepted (Lead decision under owner delegation, 2026-10-20; plan Amendment 3)
- Date: 2026-10-19 · Task: S1-T1 · Author: engineer
- Decision confirmed 2026-10-20: already built on; the root gate (`pnpm check`) is green at 307 tests on `typescript@7.0.2`.

## Context

The owner asked for the newest TypeScript. On 2026-10-19 the npm registry showed:

- `npm view typescript dist-tags`: `latest 7.0.2` (GA 2026-07-08, the native Go port),
  `rc 7.0.1-rc`, `next 7.1.0-dev.20261019.1`, `beta 6.0.0-beta`.
- `npm view @typescript/native-preview version`: `7.0.0-dev.20260707.2`. It is older than
  7.0.2, and the 7.0 announcement moves nightlies to `typescript@next`, so it is superseded.
- `typescript@7.0.2` installs the native compiler through `@typescript/typescript-<os>-<arch>`.
  Its binary is named **`tsc`**, not `tsgo`. It ships **no JS compiler API**: `exports["."]`
  points at `lib/version.cjs`, and only `./unstable/*` is exported.
- TS 7 removed `baseUrl`, `moduleResolution: node|node10|classic`, `esModuleInterop: false`,
  `downlevelIteration`, `target: es5` and `module: amd|umd|system|none`. It changed the defaults
  to `strict: true`, `module: esnext`, `types: []` and `rootDir: ./`.
- The Effect docs (v4 installation page) require only `strict: true`, TypeScript 5.9 or newer,
  and say "TypeScript 7 is recommended".

## Decision

The brief said: "if TypeScript 7 is the stable `latest`, use it for everything". It is, so:

- `typescript: 7.0.2` (exact) in the pnpm catalog, as a devDependency of the root and of every
  package. `@typescript/native-preview` is not installed.
- Each package: `"typecheck": "tsc --noEmit -p tsconfig.json"`. Root:
  `"typecheck": "pnpm typecheck:root && pnpm -r typecheck"` (pnpm skips the root package in
  recursive runs). `typecheck:root` runs `tsc --noEmit -p tsconfig.json` on a root `tsconfig.json`
  that extends the base and includes only `vitest.config.ts`.
- `tsconfig.base.json`: `target es2022`, `module preserve`, `moduleResolution bundler`, `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `noEmit`,
  `skipLibCheck`, `types: []`. Each package's `tsconfig.json` extends it and sets
  `"include": ["src"]`. None of the options TS 7 removed are used.

Verified in this repo: `tsc --version` reports `Version 7.0.2` in all four packages, and
`pnpm -r typecheck` is green in about 0.35 s. A probe file assigning a decoded number to a
`string` failed with `TS2322` (exit 1), so the check is real. `--listFilesOnly` shows the
package sources plus the `effect` / `@effect/vitest` declarations in the program.

## Consequences

- Nothing in the current toolchain needs the TS JS API: Biome, Vitest 5 (Vite 8 / Oxc
  transforms) and Effect all work without it. A future tool that does need it (typescript-eslint,
  Volar, or possibly some Expo CLI step at build step 6) needs `@typescript/typescript6` side by
  side. Check this at step 6; do not assume it.
- Editors: use the VS Code "TypeScript 7" extension (`TypeScriptTeam.native-preview`). The classic
  `@effect/language-service` plugin cannot load in TS 7. Its TS 7 replacement is `@effect/tsgo`
  (0.54.0; `npx @effect/tsgo setup`). That is editor-only and optional, so it is not installed
  and not part of CI.
- `lib` is not set, so TS loads `es2022.full`, which includes DOM. `apps/worker` narrows `lib`
  and adds Workers types at step 3; `apps/mobile` follows Expo's base config at step 6.
- An upgrade is a one-line catalog change. TS 7.1 is expected to bring a new (different) API.

## Alternatives considered

- **TypeScript 6.0.3 (`tsc` in JS)**: slower, and only worth having for tools that need the JS
  API. This stack has none.
- **`typescript@6` for the editor plus `@typescript/native-preview` (`tsgo`) for CI**: this was
  the fallback in case TS 7 was not stable. It means two compilers that can disagree, and the
  preview is older than 7.0.2.
- **`tsc --build` with project references**: unnecessary while packages have no build step.
  Running `tsc -p` per package is simpler and already fast.
