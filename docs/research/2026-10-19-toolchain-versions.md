# Toolchain versions & compatibility fact sheet — 2026-10-19

Scope: Tanren pnpm monorepo (Cloudflare Workers + D1, Expo, Effect). Local: Node v24.21.0, pnpm 12.9.1.
Scope change from owner (received mid-research): **no ESLint in this repo** — section C dropped; section B (Biome-only enforcement) deepened.

Source shorthands used in tables:
- `[npm]` = `npm view <pkg> version dist-tags --json` + `npm view <pkg> "time[<ver>]"`, run 2026-10-19 against registry.npmjs.org.
- `[lab]` = experiments run in the session scratchpad only (`npx -y @biomejs/biome@2.5.15`, `npx -y -p typescript@7.0.2 tsc`, `npm pack effect@4.0.5` / `@effect/sql-d1@4.0.5` / `typescript@7.0.2` / `expo@58.0.16` tarballs, inspected with `tar`/`grep`). Nothing was installed in the repo.

## A. TypeScript

| Package | Version (latest) | Published | Notes | Source |
|---|---|---|---|---|
| `typescript` | **7.0.2** | 2026-07-08 | dist-tags: `latest 7.0.2`, `next 7.1.0-dev.20261019.1`, `rc 7.0.1-rc`, `beta 6.0.0-beta`, `insiders 4.6.2-insiders…`, `dev 3.9.4`, `tag-for-publishing-older-releases 4.1.6`. 7.x on npm = only 7.0.2; 6.x = 6.0.2 (2026-03-23), 6.0.3 (2026-04-16). Package is `"type":"module"`, bin is **`tsc`** (not `tsgo`), native binaries via optionalDependencies `@typescript/typescript-<os>-<arch>@7.0.2`; `exports["."]` → `lib/version.cjs` (no compiler API; only `./unstable/*` entry points). engines `node >=16.20.0`. | `[npm]`, `[lab]` tarball |
| `@typescript/native-preview` | 7.0.0-dev.20260707.2 | 2026-07-07 | bin `tsgo`; `beta` tag 7.0.0-dev.20260421.2; not marked deprecated on npm, but superseded: GA post says nightlies "will soon resume under the standard `typescript` package with the `next` tag" (`npm i -D typescript@next`). | `[npm]`; https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ |
| `@typescript/typescript6` | 6.0.2 | 2026-07-06 | bin `tsc6`; "re-exports the TypeScript 6.0 API" for tools that still need the JS API (typescript-eslint, Volar/Vue/Svelte/Astro/MDX). Alias recipe from GA post: `"typescript": "npm:@typescript/typescript6@^6.0.2"`, `"@typescript/native": "npm:typescript@^7.0.2"`. | `[npm]`; TS 7.0 post |
| VS Code ext. "TypeScript 7" | id `TypeScriptTeam.native-preview` v1.0.1 | — | 761k installs; setting `"js/ts.experimental.useTsgo": true`, optional `js/ts.tsdk.path`. TS 7 built into VS Code: **not found** in release notes 1.139–1.142 (Sep 23–Oct 14 2026) → unverified/not yet. | https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview ; https://code.visualstudio.com/updates/v1_139 … v1_142 |
| `@effect/tsgo` | 0.54.0 | 2026-10-19 | "A wrapper around TypeScript-Go that builds the Effect Language Service"; requires `typescript >= 7`; supports 7.0.2 and 7.1.0-dev; `npx @effect/tsgo setup`; bin `effect-tsgo` used as the **sole** TS language server; CI: `npx @effect/tsgo diagnostics --project tsconfig.json`. `@effect/language-service` README: "If you are using TypeScript 7.0 or newer, use `@effect/tsgo` instead." | `[npm]`; https://github.com/effect-ts/tsgo ; https://github.com/Effect-TS/language-service |

Release timeline (blog): TS 6.0 GA 2026-03-23; 7.0 Beta 2026-04-21; 7.0 RC 2026-06-18; **7.0 GA 2026-07-08** ("a 10x faster native port of TypeScript"). TS 7 **is stable** (`latest`).

Verified CLI behaviour of `typescript@7.0.2` `[lab]`: `tsc --version` → `Version 7.0.2`; `tsc -p tsconfig.json` with `noEmit:true` reports `TS2322` and exits 1; `tsc --build tsconfig.json` works; `baseUrl` → hard error `TS5102: Option 'baseUrl' has been removed … Use '"paths": {"*": ["./*"]}'`; `esModuleInterop: false` → `TS5108 … has been removed`. `tsc --init` (7.0.2) emits: `module: nodenext`, `target: esnext`, `types: []`, `strict`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`, `moduleDetection: force`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `declaration`+`declarationMap`, `sourceMap`, `jsx: react-jsx`, `skipLibCheck`.

Documented limitations of 7.0 (GA post + archived typescript-go README): "it does not ship with an API" (new API expected in 7.1) → language-service plugins and API consumers "can only currently rely on TypeScript 6.0"; project references/`--build`/incremental/watch are implemented (new `--builders N` parallel builders, `--checkers`); declaration emit implemented but "differs greatly, intentionally"; `isolatedDeclarations` only mentioned as the exception to parallel type-checking; JS-checking changes (postfix `!`, `@enum`, Closure types unsupported); `--noEmit` works (verified). Module resolution "not all resolution modes supported yet" (README, pre-GA — unverified for 7.0.2).

6.0/7.0 breaking changes relevant to a fresh tsconfig (https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ + 7.0 post): defaults `strict: true`, `module: esnext`, `target` = current-year ES (7.0: version before `esnext`), `types: []`, `rootDir` = tsconfig dir, `noUncheckedSideEffectImports: true`, `libReplacement: false`, `stableTypeOrdering` always on; removed/hard errors in 7.0: `target es5`, `downlevelIteration`, `baseUrl`, `moduleResolution node|node10|classic`, `module amd|umd|systemjs|none`, `esModuleInterop:false`, `allowSyntheticDefaultImports:false`, `alwaysStrict:false`, `outFile`, `module Foo {}` namespaces, `asserts` import attributes, `/// <reference no-default-lib>`. `"ignoreDeprecations": "6.0"` only silences in 6.0; 7.0 refuses these options.

Recommendation: CI typecheck = `tsc -p <pkg>/tsconfig.json --noEmit` per package (or `tsc --build` with project references), using `typescript@7.0.2`; add `npx @effect/tsgo diagnostics --project …` for Effect diagnostics. Editor = "TypeScript 7" extension with `effect-tsgo` as the only TS server (Effect's classic LS plugin cannot load in TS 7). Forward-compatible tsconfig: explicit `types`, no `baseUrl`/`paths` wildcards except `"*"` style, `module: nodenext` (Workers/Node) or `module: preserve`+`moduleResolution: bundler` (Expo base config, verified free of removed options `[lab]`).

## B. Biome (sole formatter/linter; functional rules via plugins)

| Item | Value | Notes | Source |
|---|---|---|---|
| `@biomejs/biome` latest | **2.5.15** | published 2026-09-30; 2.5.0 npm 2026-06-12 (blog "Biome v2.5 — 500 Lint Rules, Plugin Code Fix, and Cross-File Linting" dated 2026-06-05); dist-tags `latest 2.5.15`, `beta 2.0.0-beta.6`, `nightly 1.9.5-nightly…`; engines `node >=14.21.3`. Schema enumerates **557 rules** across 8 groups (nursery 130). | `[npm]`; https://biomejs.dev/blog/biome-v2-5/ |
| `$schema` | `https://biomejs.dev/schemas/2.5.15/schema.json` | fetched OK (JSON Schema draft 2020-12, title "Configuration"); 506 KB. | `[lab]` curl |
| VS Code extension | `biomejs.biome` (Open VSX `biomejs/biome`) | `editor.codeActionsOnSave`: `source.fixAll.biome`, `source.organizeImports.biome`; `biome.lsp.bin`, `biome.requireConfiguration`. | https://biomejs.dev/reference/vscode/ |
| Formats | JS/TS/JSX/TSX/JSON/JSONC/CSS/GraphQL: Supported. HTML/SVG formatting: Experimental (opt-in). **Markdown, YAML, SCSS: "In progress" (not supported)**. Vue/Svelte/Astro: experimental. | — | https://biomejs.dev/internals/language-support/ |
| Monorepo | root `biome.json` (`"root": true` default) + nested `biome.json` with `"root": false, "extends": "//"` (`//` = extend project root). Nested without `extends` = independent config. Run from root or package. | `javascript.resolver.experimentalPnpmCatalogs` (default false) resolves pnpm catalogs. | https://biomejs.dev/guides/big-projects/ ; https://biomejs.dev/reference/configuration/ |
| Rule presets | `linter.rules.preset: "recommended" \| "all" \| "none"`; `linter.rules.recommended` is **deprecated** (`biome migrate --write`). | — | config reference; v2.5 blog |
| Assist | `assist.actions.source.organizeImports: "on"` (also `useSortedKeys`, `useSortedAttributes`, `useSortedPackageJson`, …). Diagnostic id `assist/source/organizeImports`, safe fix via `biome check --write`. | verified `[lab]` | https://biomejs.dev/assist/actions/organize-imports/ |
| Single file, quiet | `biome check --write --no-errors-on-unmatched <file>` — verified: `.md` file exits 1 without the flag, 0 with it; `.ts` file formatted ("Fixed 1 file"). Add `--reporter=summary` (per-rule counts) and/or `--diagnostic-level=error`, `--max-diagnostics=<n|none>`; `--log-level` defaults to `none`. `biome ci` exits 1 on plugin errors. | `[lab]` | https://biomejs.dev/reference/cli/ |

### B1. Built-in rules vs. the five functional requirements (schema of 2.5.15, all 557 rule ids grepped)

| Requirement | Built-in coverage (exact ids) | Gap |
|---|---|---|
| no `let` | `style/useConst` (recommended, safe fix; only flags `let` never reassigned); `suspicious/noImplicitAnyLet`; `style/noMultiAssign`; `style/noIncrementDecrement`; `style/noParameterAssign` (`propertyAssignment: deny` also bans `param.x = …`). | **No rule bans `let` itself** (no `noLet`, no `noRestrictedSyntax` — /linter/rules/no-restricted-syntax/ is 404). |
| immutable-data | `performance/noDelete`; `style/noParameterAssign`; `style/useReadonlyClassProperties`; `suspicious/noImportAssign`, `noGlobalAssign`, `noConstAssign` (correctness). | **No general object/array-mutation rule** (no `noMutation`). |
| no classes | `complexity/noStaticOnlyClass`, `style/noExcessiveClassesPerFile`, `nursery/noThisOutsideOfClass`, `useThisInClassMethods`. | **No `noClasses`.** |
| no throw | `style/useThrowOnlyError`, `style/useThrowNewError`. | **No `noThrow`.** |
| no loops | `complexity/noForEach` (`.forEach`), `suspicious/noForIn`, `style/noContinue`, `performance/noAwaitInLoops`, `nursery/noLoopFunc`, `nursery/noUnmodifiedLoopCondition`. | **No rule bans `for`/`while`.** |

### B2. GritQL plugins — what works in 2.5.15 (every snippet below was executed `[lab]`)

Docs (https://biomejs.dev/linter/plugins/ , https://biomejs.dev/reference/gritql/): a plugin is a `.grit` file; patterns are backtick code snippets with `$metavariables`, or **syntax-node patterns by Biome node name** (`JsIfStatement() as $stmt`, fields as in the `.ungram` grammar, e.g. `JsConditionalExpression(consequent = $cons)`); conditions via `where { … }`, match operator `<:`, `or { … }`, `not`, `contains`; diagnostics via `register_diagnostic(span = $node, message = "…", severity = "hint|info|warn|error" /* default error */, fix_kind = "safe|unsafe")`; rewrites with `=>` (since 2.5; unsafe unless `fix_kind = "safe"`). Node names/fields: Biome playground or `xtask/codegen/js.ungram` (field names are snake_case, e.g. `extends_clause`, `super_class`; camelCase fails to compile). Supported target languages: JS(TS/JSX), CSS, JSON.

Registration (verified): `"plugins": ["./.biome/no-let.grit"]` (relative to the config file) or `{ "path": "./.biome/no-class.grit", "includes": ["**", "!**/apps/worker/src/mcp/**"] }`.

**no-let** (verified: flags top-level, nested, multi-line and `for (let …)` initialisers; `const letter` not flagged):
```grit
JsVariableDeclaration() as $decl where {
  $decl <: r"(?s)let\b.*",
  register_diagnostic(span = $decl, message = "`let` is not allowed; use `const`", severity = "error")
}
```
What does **not** work: matching the token field `JsVariableDeclaration(kind = \`let\`)` / `kind = $k` → "Failed to compile the Grit plugin" (token-valued fields are not addressable); snippets `` `let $x = $y` ``, `` `let $x` ``, `` `let $x = $y;` `` matched nothing (the literal `` `let l = 1` `` and `` `const $x = $y` `` do match). Regex patterns are full-match (`r"^let\b"` matches nothing; `r"(?s)let\b.*"` works) and are reliable only on simple identifier text.
Complement (also verified) — ban identifier reassignment so a reassigned `let` is caught even where `useConst` is silent:
```grit
or {
  JsAssignmentExpression(left = JsIdentifierAssignment()),
  JsPostUpdateExpression(operand = JsIdentifierAssignment()),
  JsPreUpdateExpression(operand = JsIdentifierAssignment())
} as $e where { register_diagnostic(span = $e, message = "Variables must not be reassigned", severity = "error") }
```

**immutable-data** (verified: `o.a = 2`, `o["a"] = 3`, `o.a += 1`, `o.a++`, `delete o.a`, `Object.assign(o, …)` flagged; `const o = {…}` not):
```grit
or {
  JsAssignmentExpression(left = or { JsStaticMemberAssignment(), JsComputedMemberAssignment() }),
  JsPostUpdateExpression(operand = or { JsStaticMemberAssignment(), JsComputedMemberAssignment() }),
  JsPreUpdateExpression(operand = or { JsStaticMemberAssignment(), JsComputedMemberAssignment() }),
  `delete $a.$b`, `delete $a[$i]`, `Object.assign($args)`
} as $e where { register_diagnostic(span = $e, message = "Do not mutate objects or arrays", severity = "error") }
```
Mutating array methods (verified: `o.arr.push(4)`, `o.arr.sort()` flagged):
```grit
`$obj.$method($args)` as $call where {
  $method <: or { `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` },
  register_diagnostic(span = $call, message = "Mutating array method; use toSorted/with/spread", severity = "error")
}
```
Snippet forms `` `$a.$b = $c` `` and `` `$a[$i] = $c` `` also work but miss compound operators; the node form covers `=`, `+=`, etc. Limitation: purely syntactic — unlike eslint-plugin-functional's type-aware `immutable-data`, it cannot tell a freshly built local object/`Map` from shared state → expect false positives; scope with `includes` or suppress per line.

**no-classes, Effect-aware** (verified: flags `class Plain {}`, `const E = class {}`, `export default class D {}`, `class Bad extends Plain {}`; allows `extends Data.TaggedError(...)`, `Effect.Service…`, `Schema.Class…`, `Context.Service…`):
```grit
or { JsClassDeclaration(), JsClassExpression(), JsClassExportDefaultDeclaration() } as $c where {
  not $c <: JsClassDeclaration(extends_clause = JsExtendsClause(super_class = contains or {
    `Context.Service`, `Effect.Service`, `Data.TaggedError`, `Data.TaggedClass`,
    `Schema.Class`, `Schema.TaggedError`, `Schema.TaggedClass`
  })),
  register_diagnostic(span = $c, message = "Classes are only allowed for Effect services/errors/schemas", severity = "error")
}
```
Blanket variant: `or { JsClassDeclaration(), JsClassExpression(), JsClassExportDefaultDeclaration() } as $c where { register_diagnostic(...) }` (verified). Note: nested `where` inside `or { … }` alternatives compiles but matches nothing — keep one top-level `where`.

**no-throw** (verified):
```grit
JsThrowStatement() as $t where { register_diagnostic(span = $t, message = "Do not throw; fail with a Data.TaggedError in the Effect error channel", severity = "error") }
```
**no-loops** (verified: `for`, `for…in`, `for…of`, `while`, `do…while`):
```grit
or { JsForStatement(), JsForInStatement(), JsForOfStatement(), JsWhileStatement(), JsDoWhileStatement() } as $l where {
  register_diagnostic(span = $l, message = "Imperative loops are not allowed; use Array/Effect combinators", severity = "error")
}
```
Pair with built-in `complexity/noForEach` (option `allowedIdentifiers`, e.g. `["Effect"]`).

Known limitations: diagnostics only unless you add `=>` rewrites (none of these should autofix; `biome check --write` reports "No fixes applied" for them); plugin diagnostics show category **`plugin`** (no per-rule id in output; `--reporter=summary` lists them as `plugin`); exit code 1 for `lint`/`check`/`ci` when severity is `error`; no published performance data — measured 400 files × 15 lines: 531 ms without plugins vs 487 ms with 7 plugins (overhead not measurable at this scale); grammar names "can change between versions"; GritQL feature gaps tracked in https://github.com/biomejs/biome/issues/2582.

### B3. Scoping to folders and suppressions (verified)

- **Per-plugin `includes` (recommended for the adapter exception):** `{ "path": "./.biome/no-class.grit", "includes": ["**", "!**/apps/worker/src/mcp/**"] }`. Last matching glob wins; a list with only exclusions selects nothing; globs are relative to the config dir. Observed: `"!adapters/**"` (no leading `**/`) did **not** exclude in our test even though the glob reference lists that form — use `"!**/<dir>/**"`.
- **`overrides[].plugins` is additive only** (docs: "They run in addition to top-level plugins"; verified `plugins: []` in an override removes nothing). Working alternative: declare the plugin only inside an override: `"overrides": [{ "includes": ["**", "!**/apps/worker/src/mcp/**"], "plugins": ["./.biome/no-class.grit"] }]` (verified). `overrides[{ includes, linter: { enabled: false } }]` also silences plugins for those files, but disables all linting there (verified). Override entries may contain: `includes, formatter, linter, assist, files, plugins, javascript, json, css, graphql, grit, html`.
- **Suppression comments** (https://biomejs.dev/analyzer/suppressions/; all three verified): `// biome-ignore lint/plugin: <reason>` (all plugins), `// biome-ignore lint/plugin/<file-stem>: <reason>` (one plugin; the id is the `.grit` filename without extension, e.g. `lint/plugin/no-class`), `// biome-ignore lint: <reason>`. Also `// biome-ignore-all …` (top of file) and `// biome-ignore-start` / `-end` ranges.

## C. ESLint — dropped (owner decision: Biome only)

Retained for the TypeScript decision only: `typescript-eslint@8.72.0` supports TypeScript `>=4.8.4 <6.1.0` — not TS 7 (https://typescript-eslint.io/users/dependency-versions/). Not using ESLint removes the only tool here that would have forced the `@typescript/typescript6` alias.

## D. Effect ecosystem

| Package | Version | Published | Notes | Source |
|---|---|---|---|---|
| `effect` | **4.0.5** | 2026-10-15 | dist-tags: `latest 4.0.5`, `staging 4.0.5`, **`prev 3.22.3`**, `rc 4.0.0-rc.118`, `beta 4.0.0-beta.107`, `snapshot`. 4.0.0 published 2026-10-01 (blog "Effect 4.0" 2026-09-30: "dependency-free core and long-term support"). 3.22.3 published 2026-10-16 — 3.x still receives patches. `effect@4.0.5` has no `dependencies`/`peerDependencies`. | `[npm]`; https://effect.website/blog/releases/effect/40 |
| `@effect/platform` | 0.97.2 | 2026-09-09 | peer `effect ^3.22.2` → **v3 line only**; in v4 merged into `effect/http` + `effect/http-api`. | `[npm]`; MIGRATION.md |
| `@effect/sql` | 0.52.1 | 2026-07-30 | v3 line; in v4 → `effect/sql` (`SqlClient`, `Migrator`, `SqlSchema`, `SqlModel`, `SqlResolver`, `Statement`). | `[npm]`; `[lab]` tarball |
| `@effect/sql-d1` | **4.0.5** | 2026-10-15 | peer `effect ^4.0.5`; dependency `@cloudflare/workers-types ^5.20261010.1`; exports `D1Client` (`Context.Service`), `make`, `layer(config)`, `layerConfig(config)`. | `[npm]`; `[lab]` |
| `@effect/sql-drizzle` | 0.51.0 | 2026-07-13 | peers `effect ^3.22`, `@effect/sql ^0.52`, `drizzle-orm >=0.43.1 <0.50` → **no v4 build**. | `[npm]` |
| `@effect/vitest` | 4.0.5 | 2026-10-15 | peers `effect ^4.0.5`, **`vitest >=5.0.0 <6.0.0`**. | `[npm]` |
| `@effect/language-service` | 0.87.5 | 2026-10-16 | TS LS plugin (TS ≤ 6 API); TS 7 users → `@effect/tsgo` (see A). | `[npm]`; README |
| `@effect/cli` | 0.77.2 | 2026-09-15 | peer `effect ^3.22.2` (v3); v4 → `effect/cli` (`Command`, `Flag`, `Argument`, `Prompt`…). | `[npm]`; `[lab]` |
| `@effect/ai` | 0.37.0 | 2026-07-13 | peer `effect ^3.22` (v3); v4 → `effect/ai` (`LanguageModel`, `Tool`, `Toolkit`, `McpServer`, `McpSchema`, …) + separate `@effect/ai-*` providers. | `[npm]`; `[lab]` |
| `@effect/platform-node` | 4.0.5 (`prev 0.108.3`) | 2026-10-15 | peer `effect ^4.0.5`. | `[npm]` |
| `@effect/schema` | 0.75.5 | — | legacy; Schema is `effect/Schema` in both 3.x and 4.x. | `[npm]` |

API names — **stable 3.x line (`effect@3.22.3`)**: services via `class Db extends Context.Tag("Db")<Db, Shape>() {}` or `Effect.Service<Db>()("Db", { effect, dependencies })` (auto `.Default`); `import { Schema } from "effect"`; `Schema.brand`, `Schema.Class`; `Data.TaggedError`; `Layer.mergeAll`; `Effect.fn`; HTTP API from `@effect/platform` (`HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`, `HttpApiBuilder`, `HttpApiSchema`) (https://github.com/Effect-TS/effect/blob/main/migration/services.md v3 sections).

**4.0.5 (verified in tarball + MIGRATION.md):** `Context.Tag`/`Context.GenericTag`/`Effect.Tag`/`Effect.Service` are all replaced by **`Context.Service`**: `class Db extends Context.Service<Db, { readonly q: (s: string) => string }>()("Db") {}`; effectful constructor via `Context.Service<Logger>()("Logger", { make: Effect.gen(...) })` — no auto `.Default`, no `dependencies`; build `static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(Config.layer))` (convention: `layer`, `layerTest`). `Effect.Tag` accessors → `Service.use`. `FiberRef` → `Context.Reference`. There is **no `ServiceMap` module** in 4.0.5 (beta-era name). `Schema`: `Schema.Struct`, `Schema.Class`, `Schema.TaggedClass`, `Schema.TaggedError`, `Schema.brand("UserId")` (pipeable), `Schema.Literal(s)`, `Schema.Union`, `Schema.optional`/`optionalKey`, `Schema.Option`, `Schema.toStandardSchemaV1`; renames `decodeUnknown → decodeUnknownEffect`, `decode → decodeEffect`, `decodeUnknownEither → decodeUnknownExit` (+ `decodeUnknownSync/Option/Promise`, `encodeUnknownEffect`, `encodeSync`). `Data.TaggedError`, `Data.Class`, `Layer.mergeAll`, `Effect.fn`/`fnUntraced`, `Effect.gen` unchanged. HTTP: `effect/http` (`HttpServer`, `HttpRouter`, `HttpClient`, `HttpMiddleware`, `FetchHttpClient`, …) and **`effect/http-api`** (`HttpApi`, `HttpApiBuilder`, `HttpApiGroup`, `HttpApiEndpoint`, `HttpApiSchema`, `HttpApiClient`, `HttpApiMiddleware`, `HttpApiSecurity`, `HttpApiSwagger`, `HttpApiScalar`, `OpenApi`). Unstable modules (`@stability unstable`, may break in minors): `ai, cli, cluster, devtools, eventlog, http, http-api, jsonschema, observability, persistence, process, reactivity, rpc, schema, socket, sql, workflow, workers`; `effect/unstable/<m>` paths were dropped for `effect/<m>` with "no compatibility exports". All ecosystem packages share one version number; still-separate packages: `@effect/platform-*`, `@effect/sql-*`, `@effect/ai-*`, `@effect/opentelemetry`, `@effect/atom-*`, `@effect/vitest`. LTS for 4.x: bug fixes "until September 2029, or one year after 5.0 ships", security "until September 2029, or two years after 5.0". Requirements: TypeScript 5.9+ ("TypeScript 7 is recommended"), `strict: true`, Node 18+ (https://effect.website/docs/v4/getting-started/installation). Migration guide: https://github.com/Effect-TS/effect/blob/main/MIGRATION.md (+ `migration/services.md`, `migration/schema.md`).

Recommendation: start on **Effect 4.0.5** with every `@effect/*` pinned to 4.0.5. The HttpApi, SQL/D1 and vitest pieces we need ship in or alongside v4 today (`effect/http-api`, `effect/sql`, `@effect/sql-d1@4.0.5`, `@effect/vitest@4.0.5`), v4 has a published LTS window to 2029 while no 3.x LTS statement exists, and starting on 3.x would mean an immediate `Context.Tag → Context.Service` + `effect/unstable` migration. The only loss is `@effect/sql-drizzle` (no v4), which is replaced either by Drizzle 1.0-rc's native `drizzle-orm/effect-d1` (exists in the exports map, undocumented) or by using Drizzle only for schema/migrations and `effect/sql` for queries.

## E. Toolchain

| Package | Version | Published | Critical notes | Source |
|---|---|---|---|---|
| `pnpm` | **12.14.0** | 2026-10-15 | 12.0.0 on 2026-08-26; 11.0.0 on 2026-04-28 ("Node.js 22+ required"; npm `engines` still says `>=18.*`). Settings live in **`pnpm-workspace.yaml`** (only auth/registry in `.npmrc`; unknown settings now warn/error in v12). `packageManager` field = Corepack format `"pnpm@12.14.0+sha512.<hash>"` (`name@version` required, hash optional but "strongly recommended"); pnpm honours it via **`pmOnFail: download \| error \| warn \| ignore`** (default `download`; replaced `managePackageManagerVersions` in v11; `devEngines.packageManager` also honoured). Catalogs: `catalog:`/`catalogs:` in `pnpm-workspace.yaml`, `"dep": "catalog:"` / `"catalog:name"`; `catalogMode: manual\|strict\|prefer`; `catalogPrune`; `catalog:` is replaced on publish. **`minimumReleaseAge` default 1440 min since v11** (`minimumReleaseAgeExclude`, `minimumReleaseAgeStrict`), plus `trustPolicy`, `blockExoticSubdeps` (default true). | `[npm]`; https://github.com/pnpm/pnpm/releases/tag/v12.0.0 , /v11.0.0 ; https://pnpm.io/settings/dependency-resolution ; https://pnpm.io/catalogs ; https://github.com/nodejs/corepack |
| `vitest` | **5.0.5** | 2026-10-15 | 5.0.0 on 2026-09-03; requires **Vite ≥ 6.4 and Node ≥ 22.12** (engines `^22.12 \|\| ^24 \|\| >=26`); `vite` no longer a direct dep; `clearMocks` default true; `test.sequential` removed; nested `vi.mock` throws; `json`/`junit` reporters write files by default. | `[npm]`; https://vitest.dev/guide/migration |
| `drizzle-orm` | `latest` **0.45.4**; `rc` 1.0.0-rc.4; `beta` 1.0.0-beta.22 | 0.45.4: 2026-10-08; rc.4: 2026-06-27 | Official docs install `drizzle-orm@rc` / `drizzle-kit@rc`. D1 driver `drizzle-orm/d1`: `const db = drizzle(env.DB)`; `d1/migrator` exists. rc.4 adds `drizzle-orm/effect-*` (`effect-postgres` documented with `@effect/sql-pg`; **`effect-d1`, `effect-core`, `sqlite-core/effect` present in exports but undocumented**), peers `effect >=4.0.0`, `@effect/sql-d1 >=4.0.0`. | `[npm]`; https://orm.drizzle.team/docs/connect-cloudflare-d1 ; /docs/connect-effect-postgres |
| `drizzle-kit` | 0.31.11 (`rc` 1.0.0-rc.4) | 2026-09-21 | D1 config: `dialect: 'sqlite', driver: 'd1-http', dbCredentials: { accountId, databaseId, token }`; migrations: `drizzle-kit generate` → SQL in `out` dir, then `wrangler d1 migrations apply <DB> --local\|--remote` (wrangler `migrations_dir = "drizzle"`; Cloudflare docs: generate with "your ORM's command (for example, `drizzle-kit generate`)", use `migrations_pattern` for nested layouts). `drizzle-kit push/migrate` also work via `d1-http`. | https://orm.drizzle.team/docs/get-started/d1-new ; https://developers.cloudflare.com/d1/reference/migrations/ |
| `wrangler` | **4.151.2** | 2026-10-19 | engines `node >=22`; peer `@cloudflare/workers-types ^5.20261019.1`. Types: run **`wrangler types`** → `worker-configuration.d.ts` (Env + runtime types for your `compatibility_date`/flags; commit it; CI `wrangler types --check`), add to `compilerOptions.types`; with Node compat add `@types/node`. `nodejs_compat` (+`nodejs_compat_v2`) is **on by default for `compatibility_date >= 2026-08-04`**. | https://developers.cloudflare.com/workers/languages/typescript/ ; …/runtime-apis/nodejs/ |
| `@cloudflare/workers-types` | 5.20261019.1 | 2026-10-19 | v5 (first 5.20260703.1) exposes only latest runtime types; dated entrypoints removed; still "the recommended way to type libraries and shared packages"; pulled in by `@effect/sql-d1`. | `[npm]`; Cloudflare TS page |
| `expo` | **58.0.16** (SDK 58) | 2026-10-19 | SDK 58 released 2026-10-15 (58.0.0 npm 2026-09-29); React Native **0.88** (peer `react ^19.3.0`); engines **`^22.13 \|\| ^24.3 \|\| ^26 \|\| >=27`**; breaking: RN Strict TypeScript API default, iOS SceneDelegate, `NODE_ENV` per command, Router server output default, macOS unsupported. pnpm monorepo: **isolated `node_modules` supported since SDK 54; `nodeLinker: hoisted` (pnpm-workspace.yaml) only as fallback** — `node-linker=hoisted` in `.npmrc` is no longer the recommendation; remove legacy `watchFolders`/`nodeModulesPaths` from metro.config. `expo/tsconfig.base`: `module: preserve`, `moduleResolution: bundler`, `esModuleInterop: true`, no removed options. | `[npm]`; https://expo.dev/changelog/sdk-58 ; https://docs.expo.dev/guides/monorepos/ ; `[lab]` |
| `better-auth` | **1.7.11** (`beta` 1.8.0-beta.1) | 2026-10-19 | Drizzle adapter is now a separate package **`@better-auth/drizzle-adapter@1.7.11`** (`drizzleAdapter(db, { provider: "sqlite", schema, usePlural })`); peers `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2`, `drizzle-kit >=0.31.4 \|\| >=1.0.0-beta.1`; dependency `zod ^4.5.4`. D1: built-in Kysely adapter accepts `database: env.DB`; "Cloudflare D1 can only be queried through a Cloudflare Worker, so the CLI cannot access it" → with Drizzle use `npx auth@latest generate` and apply via drizzle-kit/wrangler (`migrate` is Kysely-only). Magic link: `import { magicLink } from "better-auth/plugins"`, client `magicLinkClient` from `better-auth/client/plugins`, `authClient.signIn.magicLink({ email, callbackURL })`, `expiresIn` default 300 s, `disableSignUp`. | `[npm]`; https://www.better-auth.com/docs/adapters/drizzle ; /docs/concepts/database ; /docs/plugins/magic-link |
| `agents` (Cloudflare Agents SDK) | **0.28.1** | 2026-10-13 | `import { McpAgent } from "agents/mcp"`; `class MyMCP extends McpAgent<Env, State, Props> { server = new McpServer(...); async init() {...} }`; `export default MyMCP.serve("/mcp")`; **must keep the legacy `McpServer` from `@modelcontextprotocol/sdk` — SDK v2 `@modelcontextprotocol/server` "cannot run inside McpAgent"**; peers pin `@modelcontextprotocol/sdk` **exactly `1.32.1`**, `@modelcontextprotocol/client`/`server` `2.3.1`, `zod ^4`. | `[npm]`; https://developers.cloudflare.com/agents/model-context-protocol/mcp-agent-api/ |
| `@cloudflare/workers-oauth-provider` | 1.2.3 | 2026-10-07 | OAuth 2.1 for Workers/remote MCP; KV binding `OAUTH_KV`; PKCE, dynamic client registration, token exchange (`tokenExchangeCallback`), Client ID Metadata Documents (needs `global_fetch_strictly_public` flag), `resourceMetadata`; migration notes for 0.x/1.0/1.1. | https://github.com/cloudflare/workers-oauth-provider |
| `@modelcontextprotocol/sdk` | 1.32.1 (v2 split: `@modelcontextprotocol/server`/`client` 2.3.1) | 2026-10-05 | peer `zod ^3.25 \|\| ^4.0`; engines `node >=18`. | `[npm]` |
| `zod` | 4.6.7 | 2026-10-12 | Required transitively/peer by MCP SDK, `agents`, `better-auth`; not needed for app schemas (Effect Schema). | `[npm]` |

## F. Node

| Line | Latest | Status (Oct 2026) | Dates | Source |
|---|---|---|---|---|
| 22 "Jod" | 22.23.3 (2026-09-23) | Maintenance LTS | EOL 2027-04-30 | https://github.com/nodejs/Release ; https://nodejs.org/dist/index.json |
| **24 "Krypton"** | **24.22.0 (2026-10-14)** | Active LTS → **Maintenance on 2026-10-20** | EOL 2028-04-30 | same |
| 26 | 26.12.0 (2026-10-14) | Current → **Active LTS on 2026-10-28** | EOL 2029-04-30 | same |
| 25 | 25.9.0 | EOL (odd line) | 2026-06-01 | same |

Tool floors: expo/RN `^22.13 || ^24.3 || ^26`, wrangler `>=22`, vitest `^22.12 || ^24 || >=26`, pnpm 11+/12 "Node 22+". Workers `nodejs_compat` targets "the Current release of Node.js" API surface — no coupling to the local Node version. Suggested `"engines": { "node": "^24.22.0 || >=26.0.0" }` with `.node-version` = `24.22.0` today; move to 26.x after 2026-10-28 once Expo/wrangler CI is green on it.

## Recommendations (pins)

| Package | Pin | Rationale |
|---|---|---|
| Node / pnpm | 24.22.0 → 26 LTS; `packageManager: pnpm@12.14.0+sha512…`, `pmOnFail: error` in CI | current LTS; pnpm 12 defaults (`minimumReleaseAge` 1440) give supply-chain delay for free |
| `typescript` | 7.0.2 (`@effect/tsgo` 0.54.0 for editor/Effect diagnostics) | stable native compiler; no tool in this stack needs the TS JS API after dropping ESLint; Expo/Workers tsconfigs are free of removed options |
| `@biomejs/biome` | 2.5.15; `$schema` 2.5.15; `linter.rules.preset`; plugins in `.biome/*.grit` scoped with `includes` | only one toolchain; functional rules covered by the verified plugins above |
| `effect` + `@effect/sql-d1` + `@effect/platform-node` + `@effect/vitest` | 4.0.5 (all equal) | single ecosystem version; LTS to 2029; HttpApi/SQL built in |
| `vitest` | 5.0.5 | required by `@effect/vitest@4.0.5` (`>=5 <6`) |
| `drizzle-orm` / `drizzle-kit` | 1.0.0-rc.4 (fallback 0.45.4 / 0.31.11) | docs target rc; only rc has Effect-4 peers and `effect-d1`; rc.4 is 3.5 months old — re-check before step 2 |
| `wrangler` / `@cloudflare/workers-types` | 4.151.2 / 5.20261019.1 (types only in shared pkgs; apps use `wrangler types`) | current; v5 types = latest runtime only |
| `expo` | 58.0.16 (RN 0.88, React 19.3) | current SDK; isolated pnpm deps supported |
| `better-auth` / `@better-auth/drizzle-adapter` | 1.7.11 / 1.7.11 | current stable; D1 via Drizzle adapter + generated schema |
| `agents` / `@modelcontextprotocol/sdk` / `zod` | 0.28.1 / 1.32.1 (exact) / 4.6.7 | `agents` pins the SDK exactly; McpAgent needs SDK v1 `McpServer` |
| `@cloudflare/workers-oauth-provider` | 1.2.3 | current |

## Unverified / open questions

1. VS Code built-in TS 7 server: no mention in VS Code 1.139–1.142 release notes; the "TypeScript 7" extension is the documented path — re-check monthly.
2. TS 7.0.2 `isolatedDeclarations` and declaration-emit fidelity under `--build` with project references: only blog/README statements; not exercised here.
3. Effect 3.x LTS/maintenance window: not stated anywhere found (3.22.3 still patched 2026-10-16).
4. `drizzle-orm/effect-d1` (rc.4): present in the exports map, no docs; Drizzle docs still say Effect "has native support for Effect PostgreSQL connections" only. Drizzle 1.0 GA date unknown (rc.4 since 2026-06-27, `latest` still 0.45.x).
5. Biome plugin glob: `"!adapters/**"` did not exclude in our run while the glob reference lists `!dist/**`; treat `!**/dir/**` as the reliable form (possible doc/implementation mismatch — worth an upstream issue).
6. Biome regex (`r"…"`) on compound expressions matched nothing (`r"(?s)(Data|Schema)\..*"` vs `Data.TaggedError("E")`); only simple identifier text matched. Use snippet `contains or {…}` allowlists instead.
7. pnpm `engines` says `>=18.*` but v11 release notes say Node 22+ — treat 22 as the floor.
8. Biome 2.5 blog date (2026-06-05) vs npm 2.5.0 publish (2026-06-12) differ by a week; immaterial.
9. `@cloudflare/workers-oauth-provider` maturity/security-audit statements: not found on the README (no "written with AI" note present any more).
