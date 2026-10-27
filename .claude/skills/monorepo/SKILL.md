---
name: monorepo
description: How the Tanren pnpm monorepo is wired — workspace layout, package naming and exports, TypeScript 7 config, Biome (formatter + linter + functional-rule plugins), Vitest projects, the `pnpm check` gate, and how to add a package or dependency. Load for any tooling change or when creating files in a new package.
---

# Tanren monorepo

This file describes the repo as built by S1-T1, S1-T2a and S1-T2b (2026-10-19). Keep it true: if your task changes
tooling, update this file in the same task.

## Versions

Every shared dependency is an **exact pin** in the `catalog:` of `pnpm-workspace.yaml`, and
packages reference it as `"<dep>": "catalog:"`.

| Tool | Version | Notes |
|---|---|---|
| Node | `engines.node: ">=24.21.0"` | the local machine runs 24.21.0 |
| pnpm | `packageManager: "pnpm@12.9.1"` | pnpm settings go in `pnpm-workspace.yaml`; there is no `.npmrc` |
| `typescript` | 7.0.2 | native compiler, binary `tsc`, no JS API ([ADR-0003](../../../docs/adr/0003-typescript.md)) |
| `@biomejs/biome` | 2.5.15 | the only formatter and linter (ADR-0002) |
| `effect` | 4.0.5 | every `@effect/*` package uses the same version ([ADR-0004](../../../docs/adr/0004-effect-version.md)) |
| `@effect/vitest` | 4.0.5 | peers `vitest >=5 <6` |
| `vitest` | 5.0.5 | |
| `vite` | 8.3.4 | required peer of vitest 5, installed explicitly |
| `drizzle-orm` / `drizzle-kit` | 0.45.4 / 0.31.11 | schema + migrations only (ADR-0006); queries use `@effect/sql-d1` 4.0.5 |
| `wrangler` / `@cloudflare/vitest-plugin` | 4.151.2 / 1.4.6 | the plugin is in `minimumReleaseAgeExclude` (too new for the 1-day rule) |

## Workspace

```
pnpm-workspace.yaml   packages: apps/*, packages/*  + catalog: (the versions above)
package.json          private root "tanren": scripts check/format/lint/typecheck/
                      typecheck:root/test; devDependencies @biomejs/biome, typescript, vite, vitest
pnpm-lock.yaml        committed; only one engineer per round may change it
tsconfig.base.json    compiler options every package extends
tsconfig.json         root only: extends the base, includes just vitest.config.ts
biome.jsonc           formatter + linter + assist (JSONC, so comments are allowed)
vitest.config.ts      test.projects: ["apps/*", "packages/*", "apps/worker/vitest.workerd.config.ts"]
.gitignore            node_modules, dist, .wrangler, .expo, .dev.vars*, .env*, coverage, …
apps/mobile/          @tanren/mobile  → @tanren/shared               skeleton until step 6
apps/worker/          @tanren/worker  → @tanren/db, @tanren/shared   skeleton until step 3
packages/db/          @tanren/db      → @tanren/shared               schema, migrations, repos (step 2)
packages/shared/      @tanren/shared  → effect                       schemas from S1-T3+
```

Every package has `package.json`, `tsconfig.json`, `src/index.ts` and `CLAUDE.md`. The skeleton
`src/index.ts` files export `packageName`, and import their workspace dependencies to prove the
links resolve.

## Package anatomy (copy this)

```json
{
  "name": "@tanren/<name>",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run --root ../.. --project @tanren/<name>",
    "check": "biome ci --error-on-warnings . && pnpm typecheck && pnpm test"
  },
  "dependencies": { "@tanren/shared": "workspace:*" },
  "devDependencies": { "typescript": "catalog:" }
}
```

`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`

- **No build step.** `exports` points at TypeScript source, and consumers resolve it through the
  `workspace:*` symlink. Vite/Vitest, Wrangler (esbuild) and Metro compile the TS directly, and
  `tsc` type-checks a dependency's source as part of the consumer's program.
- Relative imports are extensionless (`./ids`), which `moduleResolution: bundler` allows.
- Each package lists `typescript` itself so that its `tsc` resolves locally. `@tanren/shared`
  also lists `@effect/vitest`, `vitest` and `vite`, so that a single vitest instance is shared
  with the root.

## TypeScript (ADR-0003)

`tsconfig.base.json`: `target es2022`, `module preserve`, `moduleResolution bundler`, `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `noEmit`,
`skipLibCheck`, `types: []`.

- `types: []` means no ambient `@types/*`. A package opts in: `apps/worker` adds Workers types at
  step 3, and `apps/mobile` adopts Expo's base config at step 6. `packages/shared` never gets
  Node types.
- Never name a `.d.ts` after a sibling `.ts` basename in another case: on case-insensitive macOS
  `src/env.d.ts` next to `src/Env.ts` is silently dropped by tsc (no error, the ambient merge just
  vanishes; hardening H1). Ambient files take a name no module uses (`src/cloudflareEnv.d.ts`).
  Proof: `pnpm exec tsc -p tsconfig.json --listFilesOnly | grep -i <file>.d.ts` prints the file.
- The same collision hits a component `Foo.tsx` beside a pure `foo.ts` (tsc TS1261, UI-D1): name the pair
  differently (`FooView.tsx` or `fooLayout.ts`).
- `lib` is unset, so TS loads `es2022.full` (ES2022 + DOM). The worker narrows it when Workers
  types arrive. ES2023 array methods (`toSorted`, `toReversed`, `findLast`) are not typed: use
  `Arr.sort` / `Arr.reverse` from `effect`.
- TS 7 hard-errors on `baseUrl`, `moduleResolution: node|node10|classic`,
  `esModuleInterop: false`, `downlevelIteration` and `target: es5`. Never add them.
- `pnpm typecheck` runs `pnpm typecheck:root && pnpm -r typecheck`. `typecheck:root` checks
  `vitest.config.ts` through the root `tsconfig.json`, and the base settings are enough for the
  vite/vitest types. `pnpm -r typecheck` runs `tsc --noEmit -p tsconfig.json` in each package
  (pnpm skips the root package). The whole thing takes under a second. For one package:
  `pnpm -F @tanren/db typecheck`.
- Editor: the VS Code "TypeScript 7" extension. The Effect language service for TS 7 is
  `@effect/tsgo` (optional, not installed).

## Biome (ADR-0002)

- Config: `biome.jsonc` (comments allowed); `$schema` 2.5.15. `files.includes`: `apps/**`, `packages/**`, root `*.json/*.jsonc/*.ts`, `.biome/*.mjs`. Force-ignored: `node_modules`, `dist`, `.wrangler`, `.expo`, `.claude`, `.biome/fixtures`, `packages/db/migrations` (drizzle-kit output, rewritten on every `generate`).
- Formatter: 2 spaces, width 100, no semicolons, double quotes, trailing commas. Linter: `preset: "recommended"` plus these errors: `noExplicitAny`, `noNonNullAssertion`, `useConst`, `noParameterAssign`, `useImportType`, `noNamespace`, `noUnusedVariables/Imports`, `noIncrementDecrement`, `noVar`, `noForIn`.
- Functional rules: GritQL plugins `.biome/noLet|noThrow|noMutation|noLoop|noSwitch.grit` (noSwitch bans `switch`: use exhaustive `Match`) (top-level `plugins`). `noClass.grit` is declared in `overrides`, excluding `apps/worker/src/mcp/**` and `apps/worker/src/index.ts`, because `overrides[].plugins` can only add plugins. To allow another Effect class factory, add it to `effect_class_factory` in `noClass.grit`.
- Plugin diagnostics show the category `plugin`, and each message starts with its id. Suppress one line with `// biome-ignore lint/plugin/noMutation: <reason>`. Known false positives that need this: React `ref.current = …`, CommonJS `module.exports` (use `biome-ignore-all` at the top of the file), Expo Router `router.push`. The rule is syntactic (no types): do not name your own methods `push`/`pop`/`shift`/`unshift`/`splice`/`sort`/`reverse`/`fill` (step 6 renamed a sync transport's `push` to `sendChanges`); rename rather than suppress.
- Self-test: `pnpm check:plugins` (`node .biome/selftest.mjs`) lints `.biome/fixtures/*.{positive,negative}.ts` through the real config and asserts the plugin-error counts (8/9/3/24/5, negatives 0, adapter 0). A broken plugin otherwise only emits an info diagnostic. After changing a `.grit` file, update its fixtures and counts.
- Commands: `pnpm format`, `pnpm lint`, `pnpm exec biome check --write <path>`. The hook `.claude/hooks/format.sh` runs `biome check --write` on every Write/Edit; files written through Bash bypass it. The hook also applies `useImportType`: an edit that leaves an import used only as a type rewrites `import { X }` to `import type { X }`, and the next edit that uses `X` as a value fails `TS1361` (EQ-F2 on `ProfileRepo`). In a multi-edit refactor add the new value use first, drop the old one last, and re-read the import lines after the last edit.

## Tests

- The root `vitest.config.ts` sets `test.projects: ["apps/*", "packages/*",
  "apps/worker/vitest.workerd.config.ts"]`. Every folder matched is a project named after its
  `package.json` `name` (for example `@tanren/shared`), with Vitest's default include
  `**/*.{test,spec}.?(c|m)[jt]s?(x)`. Projects without tests are fine.
- A package that needs special settings (such as the Workers pool) adds its own `vitest.config.ts`,
  and the glob picks it up; a *second* config in the same folder must be listed by file path.
- `apps/worker` has two projects: `@tanren/worker` (`vitest.config.ts`, Node, excludes
  `*.workerd.test.ts`) and `@tanren/worker-workerd` (`vitest.workerd.config.ts`, copied from
  `packages/db`: `cloudflareTest` + `wrangler.test.jsonc`, `src/testing/workerdSetup.ts` applies both
  migrations, `src/testing/env.d.ts` types `TEST_MIGRATIONS`). The second is listed by file path in the
  root `vitest.config.ts` because a folder glob yields one project per folder. Workerd tests are named
  `*.workerd.test.ts`; `src/app.workerd.test.ts` is the `/health` smoke on `d1Persistence(env.DB)`.
- Biome: `style/noNamespace` is off for `**/*.d.ts` only (an `overrides` entry), because ambient files
  must merge into the global `Cloudflare.Env`; in a `.ts` file it still needs a `biome-ignore`.
- `pnpm test` runs `vitest run` across all projects. For one package,
  `pnpm -F @tanren/shared test` runs `vitest run --root ../.. --project @tanren/shared`, going
  through the root config. Every package has that `test` script (worker's names both of its
  projects). An unknown `--project` name exits 1.
- Effect tests: `import { describe, expect, it } from "@effect/vitest"`, then
  `it.effect("…", () => Effect.gen(function* () { … }))`. It is already scoped and provides
  TestClock. Use `it.live` for the real clock and `layer(…)` for a shared Layer. Decode with
  `Schema.decodeUnknownEffect(S)(input)`; failures are `Schema.SchemaError`. Reference:
  `packages/shared/src/index.test.ts`.

## The gate

```
pnpm check      =  pnpm check:plugins  &&  pnpm check:claude-md  &&  biome ci --error-on-warnings .  &&  pnpm typecheck  &&  vitest run
pnpm typecheck  =  pnpm typecheck:root  &&  pnpm -r typecheck
```

It must be green before any task is reported done. Run it from the repo root and paste the
trimmed output into the engineer report.
Known noise: `MaxListenersExceededWarning: Possible EventEmitter memory leak detected … [Socket]`
on every run is vitest 5.0.5's fork pool piping each worker's stdout/stderr to the parent
(`Readable.pipe` → `ForksPoolWorker.start`), not repo code; exit stays 0. Report it as "known
noise", never as a failure, and do not investigate it (SPK-ML, 2026-10-27).
`pnpm check:claude-md` (`scripts/claude-md-check.sh`, ≈ 2 s, one grep pass over tracked files +
`comm`) fails when a backticked identifier in any `CLAUDE.md` exists nowhere in the tree; run it
after editing a `CLAUDE.md` line, and when the token is real in the doc but absent from the tree
(a placeholder, an upstream type, a path outside the repo) add it to `scripts/claude-md-check.allow`
with a comment line saying why — a long allowlist means the regex is wrong. First catch: `rawArgs`
in `apps/worker/CLAUDE.md` after the handler took `args` (CMD-CHECK, 2026-10-27).
`pnpm -r typecheck` stops at the first failing package and kills the others: a line
`apps/worker typecheck: Failed … with signal SIGKILL` after `apps/mobile typecheck: … exit code 1`
plus `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` means only mobile failed; the worker was aborted, not
broken and not out of memory. Re-run `pnpm -F @tanren/worker typecheck` if you need its result.

Company mode (several teams editing in parallel): when `pnpm check` is red only in files outside
your scope, run the package-level gate and paste both outputs, naming the foreign failures:

```
pnpm -F @tanren/<name> check
# = biome ci --error-on-warnings . && tsc --noEmit -p tsconfig.json && vitest run --root ../.. --project @tanren/<name>
```

Every package has this `check` script (biome runs from the package folder and finds the root
`biome.jsonc`). `@tanren/worker`'s typecheck also covers `scripts/` (`tsconfig.scripts.json`, Node
types) and its `test` runs two projects (see Tests), so its `check` is `biome ci … && pnpm typecheck && pnpm test`.

Proofs (paste the command and its output; "probably covered" is not a done-criterion):

```
tsc -p <tsconfig> --listFilesOnly | grep <path>       # prints the file, or nothing = not covered
vitest run --root ../.. --project @tanren/<name>      # the file list shows which tests the project ran
biome ci --error-on-warnings <path>                   # one file or folder, same config as the gate
```

Before committing during parallel edits run `scripts/index-check.sh` (≈ 2 s, staged content only; `scripts/deploy.sh` then deploys a clean worktree of HEAD). Never run pnpm inside a copy that links the real `node_modules`: with no install state in the copy, pnpm "installs" and rewrites the REAL tree's `.bin` shims to point at the copy (GATE-IDX, 2026-10-27, 1 min of red typecheck for a live engineer).

## Adding things

- **A dependency**: check `npm view <pkg> dist-tags` and its peers. Add the exact version to
  `catalog:` in `pnpm-workspace.yaml`, write `"<pkg>": "catalog:"` in the package's
  `package.json`, then run `pnpm install`. Every `@effect/*` package uses the `effect` version.
  pnpm 11+ defaults `minimumReleaseAge` to 1440 min, so versions under a day old are not picked.
  Any dependency with a postinstall script — direct or transitive — makes `pnpm install` fail with
  `ERR_PNPM_IGNORED_BUILDS` until `allowBuilds:` in `pnpm-workspace.yaml` names it: `name: true`
  when the build is needed (native binaries: esbuild, workerd), `name: false` when it is not
  (`core-js-pure: false`, S4-T1: pulled in by `agents` → `mimetext` → `@babel/runtime-corejs3`; its
  postinstall only prints a banner). Find the chain with `pnpm why <pkg>`, record the reason in your
  report, and in company mode list the line under Decisions: it is root config outside the catalog.
- **A package**: copy the anatomy above and name it `@tanren/<name>`. Add a `CLAUDE.md` (purpose,
  boundaries, layout). Vitest picks up anything under `apps/*` or `packages/*` automatically.
  The root `CLAUDE.md` dependency line is updated via the Lead.
- **A script**: define it in the package. Expose workspace-wide scripts only from the root
  `package.json`.

## Expo note (step 6)

Decided at step 6 (2026-10-20): the **isolated** linker stays (no `nodeLinker` key in
`pnpm-workspace.yaml`); Expo SDK 58 resolves it with no `watchFolders`/`extraNodeModules`, and
the mobile package gate is green. `nodeLinker: hoisted` is the fallback only if Metro resolution
breaks for a native module. ADR still owed by the Lead. Details: `expo-mobile` skill.

## Plugin skills for engineering work

- superpowers: `superpowers:test-driven-development`, `superpowers:systematic-debugging`,
  `superpowers:verification-before-completion`; the Lead may use
  `superpowers:dispatching-parallel-agents`. Skip `brainstorming`/`writing-plans`
  when a brief or design exists: briefs, ADRs and task sheets are the plan.
- mcp-server-dev: step 4–5 engineers load `mcp-server-dev:build-mcp-server`;
  the McpAgent adapter boundary rules in our skills still apply.
