# Biome functional rules (no ESLint): 2026-10-19

Task S1-T0. How Tanren enforces its five functional rules with **Biome only**: built-in rules where
Biome has a complete one, GritQL plugins in `.biome/` for the rest. Every pattern, sample and
output below was executed with `@biomejs/biome` **2.5.15** (`npm view @biomejs/biome version`, latest,
published 2026-09-30), Node v24.21.0, in a throwaway workbench outside the repo. The repo's own
installed Biome (2.5.15, `node_modules/.bin/biome`) was run against the copied `.biome/*.grit` files
and gave identical per-file counts.

Sources: <https://biomejs.dev/linter/plugins/>, <https://biomejs.dev/reference/gritql/>,
<https://biomejs.dev/analyzer/suppressions/> (raw sources from `biomejs/website`), the installed
`node_modules/@biomejs/biome/configuration_schema.json` (rule ids and options), the JS grammar
`xtask/codegen/js.ungram` at tag `@biomejs/biome@2.5.15` (node and field names), and the GritQL
status issue <https://github.com/biomejs/biome/issues/2582>.

## 1. Summary

| # | Rule | Enforced by | Shows up in diagnostics as | Suppress one line |
|---|---|---|---|---|
| 1 | no `let` | plugin `.biome/noLet.grit`; built-ins `suspicious/noVar`, `style/useConst` | `plugin` + message `lint/plugin/noLet: …`; `lint/suspicious/noVar`; `lint/style/useConst` | `// biome-ignore lint/plugin/noLet: <reason>` |
| 2 | no `class` outside adapters (Effect classes allowed) | plugin `.biome/noClass.grit`, declared in an `overrides` entry that excludes the adapter paths | `plugin` + message `lint/plugin/noClass: …` | `// biome-ignore lint/plugin/noClass: <reason>` |
| 3 | no `throw` | plugin `.biome/noThrow.grit` | `plugin` + message `lint/plugin/noThrow: …` | `// biome-ignore lint/plugin/noThrow: <reason>` |
| 4 | no mutation | plugin `.biome/noMutation.grit`; built-ins `style/noIncrementDecrement` (`++`/`--`), `style/noParameterAssign` | `plugin` + message `lint/plugin/noMutation: …`; `lint/style/noIncrementDecrement`; `lint/style/noParameterAssign` | `// biome-ignore lint/plugin/noMutation: <reason>` |
| 5 | no loop statements | plugin `.biome/noLoop.grit` (`for`, `for…of`, `while`, `do…while`); built-in `suspicious/noForIn` (`for…in`) | `plugin` + message `lint/plugin/noLoop: …`; `lint/suspicious/noForIn` | `// biome-ignore lint/plugin/noLoop: <reason>` |

Key facts (all verified, details in section 7):

- **Every plugin diagnostic has the category `plugin`**, in the default, `json`, `github` and
  `summary` reporters. The plugin's name never appears in the output, so each plugin's message starts
  with its suppression id (`lint/plugin/noMutation: …`).
- **The suppression id is the `.grit` file name without the extension**: `lint/plugin/noMutation`.
  `lint/plugin` alone suppresses all plugins.
- **A plugin that fails at runtime does not fail the gate.** It emits an `info` diagnostic
  (`<name> errored: …`) and `biome lint`, `biome check` and `biome ci` all exit 0. See section 8 for
  the recommended self-test.
- `overrides[].plugins` only **adds** plugins. To exempt adapter files from `noClass`, declare it
  inside an override whose `includes` exclude them (section 2).
- Per-plugin `includes` (the alternative form) need the `**/` prefix: `!apps/worker/src/mcp/**`
  silently excludes nothing there, `!**/apps/worker/src/mcp/**` works.

## 2. The `biome.jsonc` snippet (merge into the existing file)

`style/useConst` and `style/noParameterAssign` are already `error` in the current `biome.jsonc`.
The new keys are the three rules below, top-level `plugins`, and `overrides`. Paths are relative to
`biome.jsonc` (repo root). Indentation does not matter: the format hook (or `biome format --write`)
reformats it.

Preview: merged into the current `biome.jsonc` (as read at 22:55, 2-space formatter), `biome ci .` over the
repo's current sources (`apps/*/src/index.ts`, `packages/*/src/index.ts`, `packages/shared/src/index.test.ts`,
`vitest.config.ts`) exits 0 with no diagnostics. The existing scaffold already complies.

```jsonc
{
  "linter": {
    "rules": {
      "style": {
        // already present: "noParameterAssign": "error", "useConst": "error"
        "noIncrementDecrement": "error"
      },
      "suspicious": {
        "noVar": "error",
        "noForIn": "error"
      }
    }
  },
  // Functional-rule plugins (S1-T0). Their diagnostics show the category `plugin`; suppress one
  // line with `// biome-ignore lint/plugin/<file-stem>: <reason>`, e.g. lint/plugin/noMutation.
  "plugins": [
    "./.biome/noLet.grit",
    "./.biome/noThrow.grit",
    "./.biome/noMutation.grit",
    "./.biome/noLoop.grit"
  ],
  "overrides": [
    {
      // noClass is declared here, not in top-level `plugins`, so the adapter files can be
      // excluded: overrides[].plugins only ADD plugins, they never remove a top-level one.
      "includes": ["**", "!**/apps/worker/src/mcp/**", "!**/apps/worker/src/index.ts"],
      "plugins": ["./.biome/noClass.grit"]
    }
  ]
}
```

Equivalent alternative, also verified: a per-plugin `includes` in the top-level array. Here the `**/`
prefix is **required**: without it the exclusion silently matches nothing.

```jsonc
"plugins": [
  // …the four plugins above…
  {
    "path": "./.biome/noClass.grit",
    "includes": ["**", "!**/apps/worker/src/mcp/**", "!**/apps/worker/src/index.ts"]
  }
]
```

**Suppressing one plugin diagnostic on one line.** Put the comment on the line directly above. It
covers the next line only, and only the named plugin:

```ts
// biome-ignore lint/plugin/noMutation: React ref, the documented escape hatch
ref.current = value;
```

Other forms (all verified in section 6): `// biome-ignore lint/plugin: <reason>` (all plugins, next
line), `// biome-ignore-all lint/plugin/noMutation: <reason>` (whole file; it must sit at the
top of the file), and `// biome-ignore-start lint/plugin/noMutation: <reason>` …
`// biome-ignore-end lint/plugin/noMutation: <reason>` (a range). Several ids can share one
comment: `// biome-ignore lint/plugin/noLoop lint/plugin/noMutation: <reason>`. A suppression that
suppresses nothing raises `suppressions/unused`, a warning that does not fail `biome ci`.

## 3. Built-in rules: what they cover, what is used

Rule ids come from the 2.5.15 configuration schema. The Recommended column was checked by linting
samples with `preset: "recommended"` alone: of the rules in this table, only `useConst` and the
`*Assign` rules fired.

| Built-in | Covers | Recommended? | Decision |
|---|---|---|---|
| `suspicious/noVar` | every `var` (ambient `declare var` and `declare global { var … }` are not flagged) | no | **enable**: without it `var` bypasses noLet |
| `style/useConst` | a `let` that is never reassigned (safe fix to `const`) | yes | **keep** (already `error`): the hook auto-fixes those, noLet catches the rest |
| `style/noParameterAssign` | `param = …` (option `propertyAssignment: "deny"` would also flag `param.x = …`, which noMutation already does) | no | **keep** (already `error`), default options |
| `style/noIncrementDecrement` | every `++`/`--` on identifiers and members, including `for` afterthoughts (`allowForLoopAfterthoughts` defaults to false) | no | **enable**: noMutation leaves `++`/`--` to it |
| `suspicious/noForIn` | every `for…in` | no | **enable**: noLoop leaves `for…in` to it |
| `correctness/noConstAssign`, `suspicious/noImportAssign`, `noFunctionAssign`, `noClassAssign`, `noCatchAssign`, `noGlobalAssign` | reassigning those bindings | yes | already on via the preset; with no `let`/`var` they close identifier reassignment |
| `performance/noDelete` | `delete o.k`, `delete o["k"]`, `delete a[0]`, `delete o?.["k"]` only; **misses** `delete o[k]`, `delete o?.[k]`, `` delete o[`k`] ``, `delete (o.k)`; its unsafe fix writes `o.k = undefined` (itself a mutation) | no | **not used**: noMutation flags every `delete` |
| `style/useObjectSpread` | `Object.assign({}, …)` (the non-mutating form), with a **safe** fix to `{ ...a }` (the hook would apply it); exactly the complement of noMutation's `Object.assign` check | no | optional style rule, not in the snippet because the brief requires `Object.assign({}, …)` to pass |
| `complexity/noForEach` | `.forEach(…)` | no | **not used**: its message is "Prefer for...of instead of forEach.", and noLoop bans `for…of` |
| `nursery/noJsRestrictedProperties` | with `entries: [{ "property": "push" }, …]` it flags `arr.push(1)`, `arr?.push(…)`, `arr["push"](…)`, but also every **read** (`const f = arr.push`, `const { push } = arr`); `allowObjects` takes a fixed list (`{ "property": "reverse", "allowObjects": ["Order"] }` exempted `Order.reverse`) | no (nursery) | **not used** for now: it would flag reads such as `query.sort` or `options.reverse`, needs every Effect module listed by name, and nursery rules may change. A verified fallback if the plugin breaks |

No built-in exists for the rest: there is no `noLet`, `noClass`/`noClasses`, `noThrow`, `noMutation`
or `noLoops`, and no `noRestrictedSyntax` (all 557 rule ids in the 2.5.15 schema were checked).
`style/useThrowOnlyError` and `style/useThrowNewError` only constrain what is thrown.

The built-in hints are generic. `noForIn` says "use a regular loop, for-of loop or forEach",
`noIncrementDecrement` says "use += or -=", and `noVar` says "use let or const". Each hint points at
something another Tanren rule then flags. The diagnostics are still correct; the follow-up
diagnostic shows the agent the next step.

## 4. The five rules: plugin, positive sample, negative sample, output

Run from the workbench root with the section 2 config merged into the repo's `biome.jsonc` (only difference: `samples/**` added to `files.includes`). The repo file has since switched its formatter to 2-space indentation and `semicolons: "asNeeded"`, which is why the samples below are tab-indented; the linter section is unchanged, so the results stand. Output is `--reporter=github`, one verbatim line per diagnostic, with the workbench prefix removed from `file=` and long messages cut after the first sentence (`…`; full text in the `.grit` files). That is followed by the default reporter's summary lines and the process exit code.

### 4.1 noLet: `.biome/noLet.grit`

```grit
// noLet: Tanren functional rule 1, no `let`.
//
// Pattern: every variable declaration whose source text starts with `let`:
//   - JsVariableDeclaration: statements, `export let`, classic `for (let i = 0; ...)` headers
//   - JsForVariableDeclaration: `for (let x of xs)` / `for (let k in o)` headers
// Ambient declarations (`declare let x: T`, also inside `declare global` / `declare module`)
// are skipped: they are type declarations and emit no runtime binding.
//
// Why a regex: the `kind` token is not addressable in Biome GritQL
// (`JsVariableDeclaration(kind = ...)` fails with "Failed to compile the Grit plugin"), and
// the snippets `let $x = $y` / `let $x` match nothing. A regex must match the WHOLE node text;
// leading comments are not part of that text, so `let\b[\s\S]*` is exact.
//
// Complementary built-ins (enable in biome.jsonc): suspicious/noVar (bans `var`),
// style/useConst (safe autofix for a `let` that is never reassigned).
// Known gaps: none for `let` itself. Reassignment of parameters and imports is covered by
// style/noParameterAssign and suspicious/noImportAssign (recommended), not by this plugin.
//
// Suppress one line:  // biome-ignore lint/plugin/noLet: <reason>
// Verified with @biomejs/biome 2.5.15. Biome node names can change between releases.

or { JsVariableDeclaration(), JsForVariableDeclaration() } as $declaration where {
	$declaration <: r"let\b[\s\S]*",
	not $declaration <: within or { TsDeclareStatement(), TsExportDeclareClause() },
	register_diagnostic(
		span = $declaration,
		message = "lint/plugin/noLet: `let` is not allowed. Use `const` and derive a new value instead of reassigning.",
		severity = "error"
	)
}
```

Positive sample (must flag), `samples/noLet/positive.ts`:

```ts
// Positive sample for lint/plugin/noLet: every `let` below must be flagged.
export function total(values: ReadonlyArray<number>): number {
	let sum = 0; // reassigned below, so style/useConst is silent: only the plugin catches it
	sum = values.length;
	return sum;
}

let neverReassigned = 1; // plugin + style/useConst (safe fix: const)
let first = 1,
	second = 2; // several declarators over several lines
export let exported = 3;
export const pair = [neverReassigned, first, second];

declare function use(value: unknown): void;
export function headers(xs: ReadonlyArray<number>): void {
	for (let index = 0; index < xs.length; index += 1) {} // plugin (the loop is also noLoop)
	for (let x of xs) use(x); // JsForVariableDeclaration (the loop is also noLoop)
}
```

```text
$ npx biome lint samples/noLet/positive.ts
::error title=plugin,file=samples/noLet/positive.ts,line=3,endLine=3,col=2,endColumn=13::lint/plugin/noLet: `let` is not allowed. …
::error title=plugin,file=samples/noLet/positive.ts,line=8,endLine=8,col=1,endColumn=24::lint/plugin/noLet: `let` is not allowed. …
::error title=plugin,file=samples/noLet/positive.ts,line=9,endLine=10,col=1,endColumn=12::lint/plugin/noLet: `let` is not allowed. …
::error title=plugin,file=samples/noLet/positive.ts,line=11,endLine=11,col=8,endColumn=24::lint/plugin/noLet: `let` is not allowed. …
::error title=plugin,file=samples/noLet/positive.ts,line=16,endLine=16,col=2,endColumn=55::lint/plugin/noLoop: loop statements are not allowed. …
::error title=plugin,file=samples/noLet/positive.ts,line=16,endLine=16,col=7,endColumn=20::lint/plugin/noLet: `let` is not allowed. …
::error title=plugin,file=samples/noLet/positive.ts,line=17,endLine=17,col=2,endColumn=27::lint/plugin/noLoop: loop statements are not allowed. …
::error title=plugin,file=samples/noLet/positive.ts,line=17,endLine=17,col=7,endColumn=12::lint/plugin/noLet: `let` is not allowed. …
::error title=lint/style/useConst,file=samples/noLet/positive.ts,line=8,endLine=8,col=1,endColumn=4::This let declares a variable that is only assigned once.
::error title=lint/style/useConst,file=samples/noLet/positive.ts,line=9,endLine=9,col=1,endColumn=4::This let declares some variables that are only assigned once.
::error title=lint/style/useConst,file=samples/noLet/positive.ts,line=11,endLine=11,col=8,endColumn=11::This let declares a variable that is only assigned once.
::error title=lint/style/useConst,file=samples/noLet/positive.ts,line=17,endLine=17,col=7,endColumn=10::This let declares a variable that is only assigned once.
Checked 1 file in <t>. No fixes applied.
Found 12 errors.
exit code: 1
```

Negative sample (must not flag), `samples/noLet/negative.ts`:

```ts
// Negative sample for lint/plugin/noLet: nothing below may be flagged.
export const letter = "let"; // `let` inside identifiers and strings
export const { outlet, ...rest } = { outlet: 1, other: 2 };
export const sum = (xs: ReadonlyArray<number>) => xs.reduce((acc, x) => acc + x, 0);

declare let ambientCounter: number; // ambient declaration: no runtime binding
declare global {
	let __TANREN_DEBUG__: boolean;
}
export const readAmbient = () => ambientCounter;
```

```text
$ npx biome lint samples/noLet/negative.ts
(no diagnostics)
Checked 1 file in <t>. No fixes applied.
exit code: 0
```

Reading: Flags every `let`: lines 3, 8, 9–10 (two declarators), 11 (`export let`), 16 (classic `for` header) and 17 (`for…of` header). `style/useConst` also fires on the never-reassigned ones (8, 9, 11, 17) and noLoop on the two loops. The negative sample (`let` inside strings and identifiers, ambient `declare let`, `declare global { let … }`) is clean.

### 4.2 noClass: `.biome/noClass.grit`

```grit
// noClass: Tanren functional rule 2, no `class` outside adapters.
//
// Pattern: JsClassDeclaration, JsClassExpression and JsClassExportDefaultDeclaration, EXCEPT
//  1. Effect class factories: the `extends` clause calls an allowed factory once
//     (`extends Data.TaggedError("NotFound")<{...}>`) or twice
//     (`extends Context.Service<Self, Shape>()("@tanren/Foo")`, `extends Schema.Class<Self>("Id")({...})`).
//     Allowed, as written in source: Context.Service, Context.Tag, Effect.Service, Data.TaggedError,
//     Data.TaggedClass, Schema.Class, Schema.TaggedError, Schema.TaggedClass.
//  2. HttpApi definitions: the `extends` clause is a method chain rooted at `HttpApi.make(...)` or
//     `HttpApiGroup.make(...)`, e.g. `class SetsApi extends HttpApiGroup.make("sets").add(...) {}`
//     (effect-conventions section 7).
//  3. Ambient declarations (`declare class`, `export declare class`, classes inside
//     `declare module` / `declare global` / `declare namespace`): type-only, no runtime class.
// To allow another factory, add it to `effect_class_factory` (or a new alternative to
// `allowed_base`).
// Adapter files (apps/worker/src/mcp/**, apps/worker/src/index.ts) are exempt by configuration:
// biome.jsonc declares this plugin inside an `overrides` entry whose `includes` exclude them.
// There is no Biome built-in that bans classes.
//
// Known gaps / limits (syntactic match on the written names):
//  - Aliased imports are not recognised (`import { Context as C }` then `extends C.Service`).
//  - Other factories are flagged, e.g. `Person.extend<X>("X")({...})` (Schema class extension),
//    `Schema.Opaque<X>()(...)`, `Schema.TaggedRequest`, `Data.Class`, `Data.Error`,
//    `HttpApiMiddleware.Service<X>()(...)`: add them when the codebase needs them.
//  - An allowed factory used anywhere else in the `extends` expression
//    (`extends mixin(Data.TaggedError)`, `extends wrap(HttpApi.make("x"))`) is flagged on purpose.
//
// Suppress one line:  // biome-ignore lint/plugin/noClass: <reason>
// Verified with @biomejs/biome 2.5.15. Biome node names can change between releases.

pattern effect_class_factory() {
	or {
		`Context.Service`,
		`Context.Tag`,
		`Effect.Service`,
		`Data.TaggedError`,
		`Data.TaggedClass`,
		`Schema.Class`,
		`Schema.TaggedError`,
		`Schema.TaggedClass`
	}
}

// `HttpApi.make(...)` / `HttpApiGroup.make(...)` followed by any number of `.method(...)` calls.
pattern http_api_definition() {
	or {
		JsCallExpression(callee = or { `HttpApi.make`, `HttpApiGroup.make` }),
		JsCallExpression(callee = JsStaticMemberExpression(object = http_api_definition()))
	}
}

pattern allowed_base() {
	JsExtendsClause(super_class = or {
		JsCallExpression(callee = effect_class_factory()),
		JsCallExpression(callee = JsCallExpression(callee = effect_class_factory())),
		http_api_definition()
	})
}

or { JsClassDeclaration(), JsClassExpression(), JsClassExportDefaultDeclaration() } as $class where {
	not $class <: or {
		JsClassDeclaration(extends_clause = allowed_base()),
		JsClassExpression(extends_clause = allowed_base()),
		JsClassExportDefaultDeclaration(extends_clause = allowed_base())
	},
	not $class <: within or { TsDeclareStatement(), TsExportDeclareClause() },
	register_diagnostic(
		span = $class,
		message = "lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.Service, Data.TaggedError/TaggedClass, Schema.Class/TaggedError/TaggedClass, HttpApi/HttpApiGroup.make chains) and in adapter files. Use functions, Schema and Layer instead.",
		severity = "error"
	)
}
```

Positive sample (must flag), `samples/noClass/positive.ts`:

```ts
// Positive sample for lint/plugin/noClass: every class below must be flagged.
import { Data, Schema } from "effect";

declare const Base: new () => object;
declare function mixin<T>(base: T): new () => object;
declare const Person: { extend: <S>(id: string) => (fields: object) => new () => S };
declare const NotHttpApi: { make: (id: string) => new () => object };

export class Plain {}
export class Child extends Base {}
export class AppError extends Error {}
export abstract class Shape {}
export const Anonymous = class {};
export default class {}
export class NotAFactory extends mixin(Data.TaggedError) {} // allowed name passed as an argument
export class Extended extends Person.extend<Extended>("Extended")({ age: Schema.Number }) {} // known gap: .extend
export class LookAlike extends NotHttpApi.make("api") {} // not an allowed root
```

```text
$ npx biome lint samples/noClass/positive.ts
::error title=plugin,file=samples/noClass/positive.ts,line=9,endLine=9,col=8,endColumn=22::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=10,endLine=10,col=8,endColumn=35::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=11,endLine=11,col=8,endColumn=39::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=12,endLine=12,col=8,endColumn=31::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=13,endLine=13,col=26,endColumn=34::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=14,endLine=14,col=16,endColumn=24::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=15,endLine=15,col=8,endColumn=60::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=16,endLine=16,col=8,endColumn=93::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/noClass/positive.ts,line=17,endLine=17,col=8,endColumn=57::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
Checked 1 file in <t>. No fixes applied.
Found 9 errors.
exit code: 1
```

Negative sample (must not flag), `samples/noClass/negative.ts`:

```ts
// Negative sample for lint/plugin/noClass: nothing below may be flagged.
import { Context, Data, Effect, Layer, Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

interface ClockShape {
	readonly now: Effect.Effect<number>;
}

// Effect 4: Context.Service, two-stage form, with a static layer
export class Clock extends Context.Service<Clock, ClockShape>()("@tanren/Clock") {
	static readonly layer = Layer.succeed(this, { now: Effect.succeed(0) });
}
// Effect 4: Context.Service with effectful construction
export class Ids extends Context.Service<Ids>()("@tanren/Ids", {
	make: Effect.succeed({ next: () => "id" }),
}) {}
// Effect 3: Context.Tag and Effect.Service
export class SessionRepo extends Context.Tag("@tanren/SessionRepo")<SessionRepo, ClockShape>() {}
export class Notifier extends Effect.Service<Notifier>()("@tanren/Notifier", { succeed: {} }) {}
// Data
export class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}
export class Tick extends Data.TaggedClass("Tick")<{ readonly at: number }> {}
// Schema
export class Person extends Schema.Class<Person>("Person")({ name: Schema.String }) {}
export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
	message: Schema.String,
}) {}
export class Ping extends Schema.TaggedClass<Ping>()("Ping", { id: Schema.String }) {}
// HttpApi definitions (effect-conventions section 7)
export class SetsApi extends HttpApiGroup.make("sets").add(
	HttpApiEndpoint.get("byId", "/sets/:id", { success: Person }),
	HttpApiEndpoint.post("log", "/sets", { payload: Person, success: Person }),
) {}
export class Api extends HttpApi.make("tanren").add(SetsApi) {}
// Class expression with an allowed factory
export const Boom = class extends Data.TaggedError("Boom") {};
// Ambient declarations: type-only, no runtime class
declare class Ambient {
	readonly id: string;
}
export declare class AmbientExported {}
export type AmbientId = Ambient["id"];
```

```text
$ npx biome lint samples/noClass/negative.ts
(no diagnostics)
Checked 1 file in <t>. No fixes applied.
exit code: 0
```

Reading: Flags all nine forbidden classes (lines 9–17): plain, `extends Base`, `extends Error`, `abstract`, class expression, `export default class`, an allowed factory passed as an argument (`mixin(Data.TaggedError)`), the Schema `.extend` form (known gap), and a look-alike root (`NotHttpApi.make`). The negative sample has **zero diagnostics**: Effect 4 `Context.Service` (both two-stage forms, with a `static readonly layer`), Effect 3 `Context.Tag` and `Effect.Service`, `Data.TaggedError`, `Data.TaggedClass`, `Schema.Class`, `Schema.TaggedError`, `Schema.TaggedClass`, the HttpApi classes from effect-conventions §7, a class expression extending `Data.TaggedError`, and ambient `declare class` / `export declare class`.

### 4.3 noThrow: `.biome/noThrow.grit`

```grit
// noThrow: Tanren functional rule 3, no `throw`.
//
// Pattern: every JsThrowStatement (`throw <expr>`), in any function, method or top level.
// There is no Biome built-in that bans `throw` (style/useThrowOnlyError and
// style/useThrowNewError only shape what is thrown).
//
// Fix: fail in the Effect error channel, Effect.fail(new NotFound({ id })), with errors defined
// as Schema.TaggedError (serialisable, API/domain) or Data.TaggedError (internal). Defects use
// Effect.die.
// Known gaps: none for `throw` statements. Rejections created without `throw`
// (`Promise.reject(...)`) are not flagged.
//
// Suppress one line:  // biome-ignore lint/plugin/noThrow: <reason>
// Verified with @biomejs/biome 2.5.15. Biome node names can change between releases.

JsThrowStatement() as $throw where {
	register_diagnostic(
		span = $throw,
		message = "lint/plugin/noThrow: `throw` is not allowed. Fail in the Effect error channel: Effect.fail(new MyError(...)) with a Schema.TaggedError or Data.TaggedError.",
		severity = "error"
	)
}
```

Positive sample (must flag), `samples/noThrow/positive.ts`:

```ts
// Positive sample for lint/plugin/noThrow: every throw below must be flagged.
export function parse(input: string): number {
	if (input === "") {
		throw new Error("empty input");
	}
	return Number(input);
}
export const fail = (): never => {
	throw "a bare string";
};
export async function load(): Promise<void> {
	throw new TypeError("not implemented");
}
```

```text
$ npx biome lint samples/noThrow/positive.ts
::error title=plugin,file=samples/noThrow/positive.ts,line=4,endLine=4,col=3,endColumn=34::lint/plugin/noThrow: `throw` is not allowed. …
::error title=plugin,file=samples/noThrow/positive.ts,line=9,endLine=9,col=2,endColumn=24::lint/plugin/noThrow: `throw` is not allowed. …
::error title=plugin,file=samples/noThrow/positive.ts,line=12,endLine=12,col=2,endColumn=41::lint/plugin/noThrow: `throw` is not allowed. …
Checked 1 file in <t>. No fixes applied.
Found 3 errors.
exit code: 1
```

Negative sample (must not flag), `samples/noThrow/negative.ts`:

```ts
// Negative sample for lint/plugin/noThrow: nothing below may be flagged.
import { Data, Effect } from "effect";

export class EmptyInput extends Data.TaggedError("EmptyInput")<{ readonly input: string }> {}
export const parse = (input: string) =>
	input === "" ? Effect.fail(new EmptyInput({ input })) : Effect.succeed(Number(input));
export const defect = Effect.die("unreachable");
export const throwLabel = "throw"; // the word in identifiers and strings
```

```text
$ npx biome lint samples/noThrow/negative.ts
(no diagnostics)
Checked 1 file in <t>. No fixes applied.
exit code: 0
```

Reading: Flags the three `throw` statements (lines 4, 9, 12). The negative sample (`Effect.fail` with a `Data.TaggedError`, `Effect.die`, the word in a string) is clean.

### 4.4 noMutation: `.biome/noMutation.grit`

```grit
// noMutation: Tanren functional rule 4, no mutation of objects or arrays.
//
// Four checks, each with its own message:
//  1. Assignment to a property: any JsAssignmentExpression (`=`, `+=`, `??=`, ...) whose target
//     contains a JsStaticMemberAssignment (`a.b`) or JsComputedMemberAssignment (`a[i]`). This also
//     catches `(a.b) = c`, `a.b! = c`, `(a.b as T) = c`, `[a.b] = xs`, `({ k: a.b } = o)`.
//  2. `delete` on anything (`delete a.b`, `delete a[k]`, `delete a?.[k]`, `delete (a.b)`).
//     The built-in performance/noDelete is NOT used: it skips dynamic keys (`delete o[k]`,
//     `delete o?.[k]`, template keys), and its unsafe fix rewrites to `o.k = undefined`,
//     which is itself a mutation.
//  3. `Object.assign(target, ...)` unless `target` is an object literal (`Object.assign({}, a)` and
//     `Object.assign({ x: 1 }, a)` are allowed; a spread first argument is flagged).
//  4. Calls of mutating array methods: push, pop, shift, unshift, splice, sort, reverse, fill,
//     copyWithin, as `x.m(...)`, `x?.m(...)` or `x["m"](...)`. Receivers that are PascalCase
//     identifiers with a lowercase letter (`Array`, `Chunk`, `Order`, `Record`) are skipped: they
//     are Effect modules whose `Array.sort`, `Array.reverse`, `Order.reverse`, `Chunk.reverse`,
//     `Record.pop` return new values. SCREAMING_CASE and one-letter receivers are still checked.
// `++` / `--` are left to the built-in style/noIncrementDecrement (it covers identifiers and
// members alike). Reassigning a plain variable is covered by noLet (no `let` to reassign),
// suspicious/noVar, style/noParameterAssign and the recommended *Assign rules.
//
// Known gaps (purely syntactic, no type information):
//  - Mutating methods of Map / Set / Date / typed arrays (`set`, `add`, `delete`, `clear`,
//    `setHours`, ...), Object.defineProperty / setPrototypeOf, Reflect.set / deleteProperty,
//    `Array.prototype.push.call(...)` and computed keys that are not string literals
//    (`x[name](...)`) are not flagged. A PascalCase array constant (`Items.push(1)`) is skipped.
//  - False positives: any object with a method of the same name, e.g. Expo Router `router.push(...)`
//    (see docs/research/2026-10-19-biome-functional-rules.md), and React `ref.current = value`.
// Type-level backstop: `readonly` fields and `ReadonlyArray` make TypeScript reject most of these.
//
// Suppress one line:  // biome-ignore lint/plugin/noMutation: <reason>
// Verified with @biomejs/biome 2.5.15. Biome node names can change between releases.

pattern property_assignment() {
	JsAssignmentExpression(left = $target) as $assignment where {
		$target <: contains or { JsStaticMemberAssignment(), JsComputedMemberAssignment() },
		register_diagnostic(
			span = $assignment,
			message = "lint/plugin/noMutation: assigning to a property mutates an object or array. Build a new value instead ({ ...obj, key: value }, Array.map, Record/HashMap from effect).",
			severity = "error"
		)
	}
}

pattern delete_operator() {
	`delete $target` as $delete where {
		register_diagnostic(
			span = $delete,
			message = "lint/plugin/noMutation: `delete` mutates the object. Build a copy without the key instead (const { key, ...rest } = obj, or Record.remove from effect).",
			severity = "error"
		)
	}
}

pattern object_assign_into_existing() {
	`Object.assign($target, $...)` as $call where {
		not $target <: JsObjectExpression(),
		register_diagnostic(
			span = $call,
			message = "lint/plugin/noMutation: Object.assign(target, ...) mutates `target`. Use a spread instead: { ...target, ...patch }.",
			severity = "error"
		)
	}
}

pattern mutating_array_method() {
	or {
		JsCallExpression(callee = JsStaticMemberExpression(object = $receiver, member = $method)) as $call where {
			$method <: r"push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin"
		},
		JsCallExpression(callee = JsComputedMemberExpression(object = $receiver, member = $method)) as $call where {
			$method <: r"[\"'](?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)[\"']"
		}
	} where {
		not $receiver <: r"[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*",
		register_diagnostic(
			span = $call,
			message = "lint/plugin/noMutation: this array method mutates its receiver. Use a copying alternative: Array.sort / Array.reverse / Array.append from effect, toSorted / toReversed / toSpliced, or a spread.",
			severity = "error"
		)
	}
}

or { property_assignment(), delete_operator(), object_assign_into_existing(), mutating_array_method() }
```

Positive sample (must flag), `samples/noMutation/positive.ts`:

```ts
// Positive sample for lint/plugin/noMutation (++ and -- are style/noIncrementDecrement).
declare const obj: { a: number; nested: { b: number }; list: number[] };
declare const arr: number[];
declare const record: Record<string, number>;
declare const key: string;
declare const i: number;
declare let counter: number; // ambient, so noLet stays silent

obj.a = 1; // a.b = c
arr[i] = 2; // a[i] = c
obj.nested.b = 3;
obj.a += 1; // compound assignment to a member
record[key] ??= 0;
(obj.a as number) = 4; // wrapped target
[obj.a, arr[0]] = [5, 6]; // destructuring into members
({ a: obj.a } = { a: 7 });

counter++; // x++ : style/noIncrementDecrement
obj.a++; // member ++ : style/noIncrementDecrement (the plugin defers to it)
--arr[i];

arr.push(1);
arr.pop();
arr.shift();
arr.unshift(0);
arr.splice(0, 1);
arr.sort();
arr.reverse();
arr.fill(0);
arr.copyWithin(0, 1);
obj.list.push(8);
arr?.push(9);
arr["sort"]();

delete obj.a;
delete record[key]; // dynamic key: performance/noDelete would miss this one

Object.assign(obj, { a: 10 });
Object.assign(record, { x: 1 }, { y: 2 });
```

```text
$ npx biome lint samples/noMutation/positive.ts
::notice title=lint/complexity/useLiteralKeys,file=samples/noMutation/positive.ts,line=33,endLine=33,col=5,endColumn=11::The computed expression can be simplified without the use of a string literal.
::error title=plugin,file=samples/noMutation/positive.ts,line=9,endLine=9,col=1,endColumn=10::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/noMutation/positive.ts,line=10,endLine=10,col=1,endColumn=11::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/noMutation/positive.ts,line=11,endLine=11,col=1,endColumn=17::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/noMutation/positive.ts,line=12,endLine=12,col=1,endColumn=11::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/noMutation/positive.ts,line=13,endLine=13,col=1,endColumn=18::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/noMutation/positive.ts,line=14,endLine=14,col=1,endColumn=22::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/noMutation/positive.ts,line=15,endLine=15,col=1,endColumn=25::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/noMutation/positive.ts,line=16,endLine=16,col=2,endColumn=25::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=lint/style/noIncrementDecrement,file=samples/noMutation/positive.ts,line=18,endLine=18,col=1,endColumn=10::Unexpected use of increment/decrement unary operator.
::error title=lint/style/noIncrementDecrement,file=samples/noMutation/positive.ts,line=19,endLine=19,col=1,endColumn=8::Unexpected use of increment/decrement unary operator.
::error title=lint/style/noIncrementDecrement,file=samples/noMutation/positive.ts,line=20,endLine=20,col=1,endColumn=9::Unexpected use of increment/decrement unary operator.
::error title=plugin,file=samples/noMutation/positive.ts,line=22,endLine=22,col=1,endColumn=12::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=23,endLine=23,col=1,endColumn=10::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=24,endLine=24,col=1,endColumn=12::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=25,endLine=25,col=1,endColumn=15::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=26,endLine=26,col=1,endColumn=17::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=27,endLine=27,col=1,endColumn=11::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=28,endLine=28,col=1,endColumn=14::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=29,endLine=29,col=1,endColumn=12::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=30,endLine=30,col=1,endColumn=21::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=31,endLine=31,col=1,endColumn=17::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=32,endLine=32,col=1,endColumn=13::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=33,endLine=33,col=1,endColumn=14::lint/plugin/noMutation: this array method mutates its receiver. …
::error title=plugin,file=samples/noMutation/positive.ts,line=35,endLine=35,col=1,endColumn=13::lint/plugin/noMutation: `delete` mutates the object. …
::error title=plugin,file=samples/noMutation/positive.ts,line=36,endLine=36,col=1,endColumn=19::lint/plugin/noMutation: `delete` mutates the object. …
::error title=plugin,file=samples/noMutation/positive.ts,line=38,endLine=38,col=1,endColumn=30::lint/plugin/noMutation: Object.assign(target, ...) mutates `target`. …
::error title=plugin,file=samples/noMutation/positive.ts,line=39,endLine=39,col=1,endColumn=42::lint/plugin/noMutation: Object.assign(target, ...) mutates `target`. …
Checked 1 file in <t>. No fixes applied.
Found 27 errors.
Found 1 info.
exit code: 1
```

Negative sample (must not flag), `samples/noMutation/negative.ts`:

```ts
// Negative sample for lint/plugin/noMutation: nothing below may be flagged.
// `Array as Arr`: importing `Array` itself trips the recommended suspicious/noShadowRestrictedNames.
import { Array as Arr, Order, Record } from "effect";

declare const b: { readonly a: number; readonly c: number };
declare const xs: ReadonlyArray<number>;

export const a = { ...b }; // spread copy
export const doubled = xs.map((x) => x * 2);
export const copy = Object.assign({}, b); // fresh object literal as target
export const merged = Object.assign({ z: 0 }, b, { c: 2 });
export const sortedEffect = Arr.sort(xs, Order.number); // effect Array.sort returns a new array
export const descending = Order.reverse(Order.number); // effect Order.reverse is pure
export const reversed = Arr.reverse(xs);
export const sortedNative = xs.toSorted((l, r) => l - r);
export const appended = [...xs, 4];
export const { a: dropped, ...withoutA } = b; // copy without a key
export const withoutC = Record.remove({ c: 1, d: 2 }, "c");
export const isOne = b.a === 1; // comparison, not assignment
```

```text
$ npx biome lint samples/noMutation/negative.ts
(no diagnostics)
Checked 1 file in <t>. No fixes applied.
exit code: 0
```

Reading: Lines 9–16: the eight assignment forms (`a.b = c`, `a[i] = c`, nested, `+=`, `??=`, wrapped in `as`, array and object destructuring). Lines 18–20: `counter++` (that is `x++`), `obj.a++` and `--arr[i]`, reported by the built-in `lint/style/noIncrementDecrement`. Lines 22–33: all nine mutating methods plus `obj.list.push`, `arr?.push` and `arr["sort"]()`. Lines 35–36: `delete` with a static and a dynamic key. Lines 38–39: `Object.assign` into an existing object. The `useLiteralKeys` info on line 33 is a recommended rule suggesting `arr.sort()`. The negative sample (`{ ...b }`, `.map(`, `Object.assign({}, …)`, `Object.assign({ z: 0 }, …)`, effect `Arr.sort`/`Arr.reverse`/`Order.reverse`/`Record.remove`, `toSorted`, rest destructuring) is clean.

### 4.5 noLoop: `.biome/noLoop.grit`

```grit
// noLoop: Tanren functional rule 5, no loop statements.
//
// Pattern: JsForStatement (`for (;;)`), JsForOfStatement (`for (... of ...)`, including
// `for await`), JsWhileStatement and JsDoWhileStatement.
// `for (... in ...)` is NOT matched here on purpose: the built-in suspicious/noForIn bans it
// (enable it in biome.jsonc), so matching it here would report every for-in twice.
//
// Fix: Array.map / filter / reduce (or the Array module from effect), Effect.forEach,
// Effect.iterate / Effect.loop, Stream.
// Known gaps: `.forEach(...)` is a call, not a loop statement, and is not flagged. Do not enable
// complexity/noForEach to cover it: its hint recommends `for...of`, which this rule bans.
//
// Suppress one line:  // biome-ignore lint/plugin/noLoop: <reason>
// Verified with @biomejs/biome 2.5.15. Biome node names can change between releases.

or { JsForStatement(), JsForOfStatement(), JsWhileStatement(), JsDoWhileStatement() } as $loop where {
	register_diagnostic(
		span = $loop,
		message = "lint/plugin/noLoop: loop statements are not allowed. Use Array.map/filter/reduce, Effect.forEach, Effect.iterate or Stream.",
		severity = "error"
	)
}
```

Positive sample (must flag), `samples/noLoop/positive.ts`:

```ts
// Positive sample for lint/plugin/noLoop (for-in is suspicious/noForIn).
declare const xs: ReadonlyArray<number>;
declare const record: Record<string, number>;
declare const stream: AsyncIterable<number>;
declare function keepGoing(): boolean;
declare function use(value: unknown): void;

export function loops(): void {
	for (;;) {
		break;
	}
	for (const x of xs) {
		use(x);
	}
	for (const k in record) {
		use(k);
	}
	while (keepGoing()) {
		use(0);
	}
	do {
		use(1);
	} while (keepGoing());
}

export async function drain(): Promise<void> {
	for await (const chunk of stream) {
		use(chunk);
	}
}
```

```text
$ npx biome lint samples/noLoop/positive.ts
::error title=plugin,file=samples/noLoop/positive.ts,line=9,endLine=11,col=2,endColumn=3::lint/plugin/noLoop: loop statements are not allowed. …
::error title=plugin,file=samples/noLoop/positive.ts,line=12,endLine=14,col=2,endColumn=3::lint/plugin/noLoop: loop statements are not allowed. …
::error title=lint/suspicious/noForIn,file=samples/noLoop/positive.ts,line=15,endLine=17,col=2,endColumn=3::Unexpected for-in loop.
::error title=plugin,file=samples/noLoop/positive.ts,line=18,endLine=20,col=2,endColumn=3::lint/plugin/noLoop: loop statements are not allowed. …
::error title=plugin,file=samples/noLoop/positive.ts,line=21,endLine=23,col=2,endColumn=24::lint/plugin/noLoop: loop statements are not allowed. …
::error title=plugin,file=samples/noLoop/positive.ts,line=27,endLine=29,col=2,endColumn=3::lint/plugin/noLoop: loop statements are not allowed. …
Checked 1 file in <t>. No fixes applied.
Found 6 errors.
exit code: 1
```

Negative sample (must not flag), `samples/noLoop/negative.ts`:

```ts
// Negative sample for lint/plugin/noLoop: nothing below may be flagged.
import { Effect } from "effect";

declare const xs: ReadonlyArray<number>;

export const total = xs.reduce((sum, x) => sum + x, 0);
export const evens = xs.filter((x) => x % 2 === 0);
export const logAll = Effect.forEach(xs, (x) => Effect.log(x));
export const countdown = Effect.iterate(3, {
	while: (n) => n > 0,
	body: (n) => Effect.succeed(n - 1),
});
export const forLabel = "for while do"; // keywords inside strings
```

```text
$ npx biome lint samples/noLoop/negative.ts
(no diagnostics)
Checked 1 file in <t>. No fixes applied.
exit code: 0
```

Reading: Flags `for (;;)` (line 9), `for…of` (12), `while` (18), `do…while` (21) and `for await` (27). `for…in` (15) is reported by the built-in `lint/suspicious/noForIn`. The negative sample (`reduce`, `filter`, `Effect.forEach`, `Effect.iterate`, keywords inside a string) is clean.

## 5. Adapter exemption for noClass: evidence

With the section 2 config, the class in the McpAgent adapter and the class in the Worker entry pass.
The same class elsewhere in the worker fails, and the other plugins still apply inside adapter
files (`throw` in `index.ts` is reported).

Adapter, must not flag the class, `apps/worker/src/mcp/agent.ts`:

```ts
// Adapter file: noClass does not apply under apps/worker/src/mcp/**.
import { McpAgent } from "agents/mcp";

export class TanrenMcp extends McpAgent {
	async init(): Promise<void> {}
}
```

```text
$ npx biome lint apps/worker/src/mcp/agent.ts
(no diagnostics)
Checked 1 file in <t>. No fixes applied.
exit code: 0
```

Adapter, must not flag the class (the `throw` is still reported), `apps/worker/src/index.ts`:

```ts
// Adapter file: noClass does not apply to apps/worker/src/index.ts; the other plugins still do.
export class RequestScope {}

export default {
	fetch(): Response {
		throw new Error("still flagged by noThrow");
	},
};
```

```text
$ npx biome lint apps/worker/src/index.ts
::error title=plugin,file=apps/worker/src/index.ts,line=6,endLine=6,col=3,endColumn=47::lint/plugin/noThrow: `throw` is not allowed. …
Checked 1 file in <t>. No fixes applied.
Found 1 error.
exit code: 1
```

Not an adapter, must flag the class, `apps/worker/src/api/handler.ts`:

```ts
// Not an adapter: noClass applies.
export class Handler {}
```

```text
$ npx biome lint apps/worker/src/api/handler.ts
::error title=plugin,file=apps/worker/src/api/handler.ts,line=2,endLine=2,col=8,endColumn=24::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
Checked 1 file in <t>. No fixes applied.
Found 1 error.
exit code: 1
```

The same three files with the other invocation styles: `biome check --write <absolute path>`
(exactly what `.claude/hooks/format.sh` runs) and `biome lint src/…` from inside `apps/worker`.
Both gave `mcp/agent.ts` none, `index.ts` noThrow only, `api/handler.ts` noClass only. `biome ci`
exits 0 for `mcp/agent.ts` and 1 for `api/handler.ts`.

Scoping matrix, run on a mini monorepo with a class in each of `apps/worker/src/index.ts`,
`apps/worker/src/mcp/agent.ts`, `apps/worker/src/mcp/tools/x.ts`, `apps/worker/src/api/handler.ts`,
`apps/worker/src/indexes.ts` (name-prefix trap) and `packages/shared/src/x.ts`. Each config was run
four ways (`biome lint .` from the root, relative file paths, absolute file paths, and from inside
`apps/worker`), and all four agreed in every row:

| Config | Classes flagged | Verdict |
|---|---|---|
| top-level `"plugins": ["./.biome/noClass.grit"]`, no scoping (control) | all 6 | as expected |
| per-plugin `includes: ["**", "!apps/worker/src/mcp/**", "!apps/worker/src/index.ts"]` | all 6 | **exclusion ignored** |
| per-plugin `includes: ["**", "!**/apps/worker/src/mcp/**", "!**/apps/worker/src/index.ts"]` | `api/handler.ts`, `indexes.ts`, `packages/shared/src/x.ts` | works |
| `overrides: [{ includes: ["**", "!apps/worker/src/mcp/**", "!apps/worker/src/index.ts"], plugins: [noClass] }]` | same 3 | works |
| `overrides: [{ includes: ["**", "!**/apps/worker/src/mcp/**", "!**/apps/worker/src/index.ts"], plugins: [noClass] }]` | same 3 | works (used in the snippet) |
| top-level plugin + `overrides: [{ includes: [adapter globs], plugins: [] }]` | all 6 | override cannot remove a plugin |


## 6. Suppressions: evidence

Line, multi-plugin, range and unused suppressions, `samples/suppression/line.ts`:

```ts
declare const ref: { current: number };
declare const items: number[];

// biome-ignore lint/plugin/noMutation: React ref, the documented escape hatch
ref.current = 1;
ref.current = 2; // not suppressed: the comment covers the next line only

// biome-ignore lint/plugin/noMutation: only noMutation is suppressed, noLoop still fires
for (const item of items) items.push(item);

// biome-ignore lint/plugin: suppresses every plugin on the next line
for (const item of items) items.push(item);

// biome-ignore-start lint/plugin/noMutation: range
items.push(3);
items.push(4);
// biome-ignore-end lint/plugin/noMutation: range
items.push(5);

// biome-ignore lint/plugin/noThrow: nothing to suppress here
export const unused = 1;
```

```text
$ npx biome lint samples/suppression/line.ts
::warning title=suppressions/unused,file=samples/suppression/line.ts,line=20,endLine=20,col=1,endColumn=62::Suppression comment has no effect. …
::error title=plugin,file=samples/suppression/line.ts,line=6,endLine=6,col=1,endColumn=16::lint/plugin/noMutation: assigning to a property mutates an object or array. …
::error title=plugin,file=samples/suppression/line.ts,line=9,endLine=9,col=1,endColumn=44::lint/plugin/noLoop: loop statements are not allowed. …
::error title=plugin,file=samples/suppression/line.ts,line=18,endLine=18,col=1,endColumn=14::lint/plugin/noMutation: this array method mutates its receiver. …
Checked 1 file in <t>. No fixes applied.
Found 3 errors.
Found 1 warning.
exit code: 1
```

Suppressing the overrides-declared noClass; nested class; `Object.assign({} as T, …)`, `samples/suppression/class.ts`:

```ts
declare const patch: object;
// biome-ignore lint/plugin/noClass: third-party SDK requires subclassing
export class SdkClient {}
export class NotSuppressed {}
export function factory() {
	class Nested {}
	return Nested;
}
export const wrapped = Object.assign({} as Record<string, number>, patch);
```

```text
$ npx biome lint samples/suppression/class.ts
::error title=plugin,file=samples/suppression/class.ts,line=4,endLine=4,col=8,endColumn=30::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/suppression/class.ts,line=6,endLine=6,col=2,endColumn=17::lint/plugin/noClass: classes are only allowed for Effect declarations (Context.Service/Tag, Effect.S …
::error title=plugin,file=samples/suppression/class.ts,line=9,endLine=9,col=24,endColumn=74::lint/plugin/noMutation: Object.assign(target, ...) mutates `target`. …
Checked 1 file in <t>. No fixes applied.
Found 3 errors.
exit code: 1
```

File-level suppression for a CommonJS config, `samples/suppression/metro.config.js`:

```js
// biome-ignore-all lint/plugin/noMutation: CommonJS config file; Metro requires module.exports
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
module.exports = config;
```

```text
$ npx biome lint samples/suppression/metro.config.js
(no diagnostics)
Checked 1 file in <t>. No fixes applied.
exit code: 0
```

The same file without the suppression, `samples/suppression/metro-unsuppressed.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
module.exports = config;
```

```text
$ npx biome lint samples/suppression/metro-unsuppressed.config.js
::error title=plugin,file=samples/suppression/metro-unsuppressed.config.js,line=3,endLine=3,col=1,endColumn=24::lint/plugin/noMutation: assigning to a property mutates an object or array. …
Checked 1 file in <t>. No fixes applied.
Found 1 error.
exit code: 1
```

Reading (`line.ts`): line 5 is suppressed, line 6 is not (the comment covers one line). On line 9
noMutation is suppressed and noLoop still fires. `lint/plugin` (line 12) silences both plugins. The
range covers lines 15–16 and line 18 is reported. The suppression on line 20 has nothing to suppress
and yields the `suppressions/unused` warning.

## 7. Biome GritQL in 2.5.15: what works and what does not

Each line was tested with a single-plugin probe config.

**Works**

- Syntax-node patterns by Biome node name, fields in snake_case from `js.ungram`:
  `JsCallExpression(callee = JsStaticMemberExpression(object = $o, member = $m))`.
- Code snippets with metavariables: `` `delete $target` ``, `` `Object.assign($target, $...)` ``
  (`$...` matches the remaining arguments, including none). The snippet `` `Context.Tag` `` matches
  the expression `Context.Tag`.
- `or { … }`, `not`, `contains` (includes the node itself), and **`within`**
  (`not $class <: within TsDeclareStatement()` skips ambient code).
- List patterns: `JsCallArguments(args = [$first, ...])`.
- **Named `pattern` definitions, including recursive ones** (`http_api_definition` in noClass calls
  itself to walk `.add(…).add(…)` chains of any length).
- A `where` inside a named pattern, or on an `or` alternative (`… as $x where { … }`), each with its
  own `register_diagnostic`. This gives per-check messages in one file (noMutation has four).
- Regex patterns `r"…"`. They match the **whole** node text: `r"et\s.*"` does not match `let a = 1`,
  `r"let\b[\s\S]*"` does. Leading comments are not part of a node's text. `\b` and `(?s)` work.
- `//` comments in `.grit` files; absolute plugin paths in the config; plugins declared in
  `overrides[].plugins`.
- `register_diagnostic(span, message, severity)`. `severity = "error"` makes `lint`, `check` and
  `ci` exit 1.

**Does not work, or bites**

- Token-valued fields are not addressable: `JsVariableDeclaration(kind = "let")` and
  ``kind = `let` `` fail with "Failed to compile the Grit plugin". That is why noLet uses a regex.
- The snippets `` `let $x = $y` `` and `` `let $x` `` match nothing.
- **A regex capturing group is treated as a variable binding**: `r"[\"'](push|sort)[\"']"` fails at
  runtime with `<plugin> errored: regex pattern matched 1 variables, but expected 0`. Use
  non-capturing groups `(?:…)`.
- **Runtime plugin errors are silent in the gate**: the error above is an `info` diagnostic, and
  `biome lint`, `biome check` and `biome ci` exit **0**.
- Plugin diagnostics never carry the plugin's name: the category is `plugin` in every reporter
  (`--reporter=json` gives `"category": "plugin"`, `github` gives `title=plugin`, `summary` gives
  one `plugin` row).
- Per-plugin `includes` behave as if matched against absolute paths: `"!apps/worker/src/mcp/**"`
  excludes nothing, while `"!**/apps/worker/src/mcp/**"` works. `overrides[].includes` are
  config-relative and accept both forms (section 5).
- `overrides[].plugins: []` does not remove a top-level plugin. Override plugins only add.

**Differences from `docs/research/2026-10-19-toolchain-versions.md` §B2/B3, re-tested here**

| Earlier note | Finding here | Effect on the delivered files |
|---|---|---|
| no-let matches `JsVariableDeclaration` only | `for (let x of xs)` is a `JsForVariableDeclaration` and was missed | noLet matches both |
| immutable-data: `JsAssignmentExpression(left = or { JsStaticMemberAssignment(), JsComputedMemberAssignment() })` | misses `(a.b) = c`, `(a.b as T) = c`, `a.b! = c`, `[a.b] = xs`, `({ k: a.b } = o)` | noMutation uses `left = $t` with `$t <: contains …` |
| `` `delete $a.$b` ``, `` `delete $a[$i]` `` | miss `delete (a.b)`, `delete a?.["k"]`, `delete a?.[k]` | `` `delete $target` `` |
| `` `Object.assign($args)` `` | also flags `Object.assign({}, …)`, which must pass | first argument checked with `not $target <: JsObjectExpression()` |
| mutating-method snippet `` `$obj.$method($args)` `` | misses `arr?.push(…)` and `arr["push"](…)`; flags effect's pure `Array.sort`, `Order.reverse`, `Chunk.reverse`, `Record.pop` | node form for `.`/`?.`/`["…"]`, PascalCase receivers skipped |
| no-classes: `super_class = contains or { … }`, only for `JsClassDeclaration` | allows `extends mixin(Data.TaggedError)`; flags class expressions with an allowed base; no `Context.Tag` | callee-root match (one or two calls), all three class node kinds, Lead's 8 factories plus HttpApi chains |
| no-loops includes `JsForInStatement` | duplicates the built-in `suspicious/noForIn` | for-in left to the built-in |
| "nested `where` inside `or { … }` alternatives compiles but matches nothing" | not reproduced: both `or { A as $a where {…}, B as $b where {…} }` and named patterns with their own `where` matched | noMutation and noClass rely on this |
| `"!adapters/**"` without `**/` did not exclude | true for per-plugin `includes`; overrides `includes` work without the prefix | snippet uses `**/` in both places |
| pair no-loops with `complexity/noForEach` | its hint recommends `for…of`, and `Effect.forEach` would need `allowedIdentifiers` | not enabled |
| complement plugin banning identifier reassignment | not needed: no `let`/`var`, and the recommended `noConstAssign`, `noImportAssign`, `noFunctionAssign`, `noClassAssign`, `noCatchAssign`, `noGlobalAssign` plus `noParameterAssign` cover the rest (all verified) | not added |

## 8. Known gaps, false positives and fallbacks

The plugins are syntactic: they see names, not types.

| Rule | Not flagged (gap) | Flagged but legitimate (false positive) | Fallback |
|---|---|---|---|
| noLet | none known | none known | n/a |
| noClass | `extends C.Service<…>()(…)` when `Context` is imported under another name | factories outside the list: `Person.extend<X>("X")({…})` (Schema class extension), `Schema.Opaque<X>()(…)`, `Schema.TaggedRequest`, `Data.Class`, `Data.Error`, `HttpApiMiddleware.Service<X>()(…)` (Effect 4 auth middleware, likely at step 3) | add the factory to `effect_class_factory` in `.biome/noClass.grit`, or suppress the line |
| noThrow | `Promise.reject(…)`, rejections created by libraries | none known | review checklist |
| noMutation | `Map`/`Set`/`Date`/typed-array mutators (`set`, `add`, `delete`, `clear`, `setHours`, …), `Object.defineProperty`, `Object.setPrototypeOf`, `Reflect.set`/`deleteProperty`, `Array.prototype.push.call(…)`, `x[name](…)` with a non-literal key, `Object["assign"](…)`, PascalCase array constants (`Items.push(1)`), `for (a.b of xs)` (the loop itself is flagged) | Expo Router `router.push("/plan")`; React `ref.current = value`; CommonJS `module.exports = …` (e.g. `metro.config.js`); `Object.assign({} as T, …)` | **TypeScript**: `readonly` fields, `ReadonlyArray`/`readonly T[]`, `Readonly<Record<…>>` and `as const` make `tsc` reject assignments and `push`/`sort`/…; **review checklist** for `Map`/`Set`; suppression comments for the false positives (see below) |
| noLoop | `.forEach(…)` (a call, not a statement) | none known | review checklist; `Effect.forEach` / `Array.map` |

**Expo Router (step 6).** `router.push(href)` is the router's navigation API and noMutation flags it.
Options for the Lead: (a) `router.navigate(href)` or `<Link href>`, (b) one suppression per call,
(c) exempt receivers named `router` and `navigation` in `mutating_array_method` (a one-line
``not $receiver <: or { `router`, `navigation` }``). Decide when step 6 starts.

**React refs and CommonJS configs.** Suppress per line
(`// biome-ignore lint/plugin/noMutation: React ref`) or per file at the top of a CommonJS config
(`// biome-ignore-all lint/plugin/noMutation: CommonJS config required by Metro`), both verified
in section 6.

**Generated `.d.ts` files** (`wrangler types` → `worker-configuration.d.ts`, Expo's `expo-env.d.ts`).
noClass and noLet skip ambient `declare` code, so these files do not trip the plugins, but they
should still be excluded from Biome (`"!!**/worker-configuration.d.ts"` in `files.includes`) to
avoid formatter churn.

**`import { Array } from "effect"`** trips the recommended `suspicious/noShadowRestrictedNames`
("Do not shadow the global "Array" property"). This is already documented in the
effect-conventions skill (`import { Array as Arr } from "effect"`). `Arr.sort(…)` and
`Arr.reverse(…)` are skipped by noMutation, as is `Array.sort(…)`.

**Recommended follow-up: a plugin self-test in the gate.** Because a plugin that errors at runtime
reports only an `info` and exits 0, a future Biome upgrade that renames a node or breaks a regex
would silently disable a rule. Commit the positive samples as fixtures (e.g. `.biome/fixtures/`,
excluded from the normal lint) and add a check that lints them and asserts the expected number of
`title=plugin` lines per file (noLet 8, noClass 9, noThrow 3, noMutation 24, noLoop 5 with the
section 4 samples). Also fail on any `errored` line.

## 9. Reproduce

```sh
mkdir biome-plugins && cd biome-plugins && npm init -y && npm i -D -E @biomejs/biome@2.5.15
# copy .biome/*.grit, the samples above (samples/<rule>/{positive,negative}.ts), and a biome.jsonc
# equal to the repo's plus the snippet in section 2 (add "samples/**" to files.includes)
npx biome lint samples/noMutation/positive.ts               # default reporter, code frames
npx biome lint --reporter=github samples/noMutation/positive.ts   # one line per diagnostic
npx biome lint --reporter=summary .                         # counts per rule; plugins show as `plugin`
```

The workbench used for this note was a throwaway npm project in the session scratchpad (not kept);
the plugins and samples above are complete, so the steps above recreate it.
