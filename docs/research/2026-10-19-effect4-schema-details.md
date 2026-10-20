# Effect 4.0.5 Schema details: Class construction, checks, defaults, dates, brands (S1-R4) — 2026-10-19

Question: six gaps left by `2026-10-19-effect-4-api.md` (its Unknowns list "Class / TaggedError constructor semantics"). Rename table and vocabulary are not repeated here.

Sources (checked 2026-10-19; nothing installed in the repo):
- `[S]` `npm pack effect@4.0.5` (shasum `3d938c2a57ee3bb309f225b9e4fe47f93a1b35f5`) unpacked in the scratchpad `research-effect4/package/`. Paths below are relative to it (`src/*.ts`, `ai-docs/`).
- `[TS]` compile-only spike: `typescript@7.0.2 tsc` (strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess) over `package/dist/*.d.ts`. Files `spike.ts`, `spike2.ts`, `spike3.ts`, `spike4.ts` in `/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/spike-effect4/`; negative controls fail as expected. No effect code was executed.
- Status: `verified` = quoted from `[S]` or accepted/rejected by the compiler `[TS]`; `inferred` = traced by reading code paths, never run; `unknown`.

## 1. Class construction: `Schema.Class<Self>("Id")(fields | Struct)`

| Item | Answer | Source | Status |
|---|---|---|---|
| `new X(props, options?)` | **Validates.** Constructor runs `struct.make(input ?? {}, options)` (constructor defaults + type-side checks, field- and struct-level), then `super(value, { disableChecks: true })`. `options: MakeOptions = { parseOptions?, disableChecks? }`; `{ disableChecks: true }` skips validation, `{ parseOptions: { errors: "all" } }` collects every issue. Unknown keys are dropped (`onExcessProperty` default `"ignore"`). | Schema.ts:15883-15884, 136-150, 16029, 16054; SchemaAST.ts:539 | verified [S]; key-drop inferred |
| Failure shape | `new X(bad)` and `X.make(bad)` throw a plain `Error("Schema validation failed", { cause: SchemaIssue.Issue })`, **not** `SchemaError`. Format with `SchemaIssue.makeFormatterDefault()(cause)` (guard with `SchemaIssue.isIssue`). Typed alternative: `X.makeEffect(input): Effect<X, SchemaIssue.Issue>`; `Effect.mapError(…, (i) => new Schema.SchemaError(i))` gives a `.message`. `Schema.TaggedError` is `Schema.Error` over the same `makeClass`: same semantics. | SchemaParser.ts:1130-1137; Schema.ts:216-221, 1212, 15913, 16611-16620, 16764-16775; SchemaIssue.ts:1427 | verified [S][TS] |
| Statics | `X.make`, `X.makeOption`, `X.makeEffect`, `X.fields`, `X.identifier`, `X.mapFields`, `X.extend`, `X.check`; `make*` also exist on every schema (`SchemaProto`). **`makeUnsafe` and `makeSync` do not exist** in 4.0.5 (0 hits in `dist/Schema.d.ts`; `X.makeUnsafe` is a tsc error). | Schema.ts:15896-15944, 228, 252, 280; internal/schema/make.ts:13-27 | verified [S][TS] |
| `make` vs `new` | `make*` return an existing instance unchanged (no re-validation); a plain object is validated and constructed. `new` always builds a distinct instance. | Schema.ts:15767-15769; internal/schema/interpreter.ts:83-90 | verified [S] |
| `.fields` | Yes: static `readonly fields: S["fields"]` (fields only, no checks). Instances have no `.fields` (tsc error). | Schema.ts:15783, 15896 | verified [S][TS] |
| Struct as argument | **Accepted.** Overload `<S extends Struct<Struct.Fields>>(schema: S, annotations?)`; impl `isStruct(schema) ? schema : Struct(schema)`. A struct with `.check(...)` keeps its checks: they run in `new`, `make` and decode. `X.extend("Y")(structWithChecks)` merges checks (run on the full subclass value). | Schema.ts:16313, 16320, 15809-15832, 15925-15939 | verified [S][TS] |
| `mapFields` drops struct checks | `X.mapFields(Struct.omit([...]))` returns a plain `Struct` **without** struct-level checks (field-level checks survive). `{ unsafePreserveChecks: true }` keeps them (unsafe if the predicate reads omitted keys); Effect itself uses it in `TaggedError(tag, struct)`. | Schema.ts:15786-15800, 3513-3547, 16769 | verified [S][TS] |

## 2. Custom (cross-field) checks

| Item | Answer | Source | Status |
|---|---|---|---|
| API | `Schema.makeFilter<T>(predicate, annotations?: Annotations.Filter, abort?: boolean): SchemaAST.Filter<T>`. Attach with `struct.check(...filters)` or pipeable `Schema.check(...filters)`. `T` = decoded (Type-side) value, inferred from the `.check` context. A filter also has `.annotate({...})`, `.abort()`, `.and(other)`; `Schema.makeFilterGroup` groups checks. | Schema.ts:6775-6779, 6837, 201, 5185; SchemaAST.ts:4078-4090 | verified [S][TS] |
| Predicate | `(input: T, ast: AST, options: ParseOptions) => FilterOutput`. `FilterOutput = undefined \| boolean \| FilterIssue \| ReadonlyArray<FilterIssue>`; `FilterIssue = string \| SchemaIssue.Issue \| { path: ReadonlyArray<PropertyKey>; issue: string \| SchemaIssue.Issue }`. `undefined`/`true` pass, `false` = generic failure, `string` = message, `{ path, issue }` points at a nested key (wrapped in `Pointer`), an array reports several (Composite). | Schema.ts:6800-6830, 6730-6745; SchemaIssue.ts:1063-1112 | verified [S][TS] |
| Message / identifier | `Annotations.Filter` (2nd arg or `.annotate`): `message` (replaces the whole message), `expected` (renders `Expected <expected>`), `identifier` (names the schema after the filter, **not** the failed filter), `title`, `description`. | Schema.ts:17944-17990 | verified [S] |
| `SchemaError.message` | `= SchemaIssue.defaultFormatter` (`makeFormatterDefault()`). Precedence: returned string / `InvalidValue.message` > filter `message` annotation > `Expected <expected>` > `Expected <filter>`; `, got <input>` only with `parseOptions.reportInput: true` (default false). Root string renders as itself; `{ path: ["to"], issue: "msg" }` renders `msg` + `\n  at ["to"]`. Gotcha: for `{ path }` results a filter-level `message` annotation wins and the path is dropped. | Schema.ts:1208-1222; SchemaIssue.ts:1258, 1434-1487; Formatter.ts:214; SchemaAST.ts:598 | inferred (traced) |
| Standard Schema | `SchemaIssue.makeFormatterStandardSchemaV1()(issue)` returns `{ issues: [{ path, message }] }` with the same precedence: root string gives `path: []`, pointer gives `path: ["to"]`. Static type is `StandardSchemaV1.Issue` (`path?: ReadonlyArray<PropertyKey \| { key }>`); runtime emits `ReadonlyArray<PropertyKey>`. | SchemaIssue.ts:1303-1360; StandardSchema.ts:112-123 | types verified [TS]; runtime inferred |
| When checks run | Node checks run only after the node's own parse succeeds: a failing field means the struct-level check never runs. Default `errors: "first"` reports only the first failing check (`"all"` collects; `abort` stops later checks). A failed check surfaces as `Composite(ast, [Filter(…)])` (interpreter.ts:186); the JSDoc example at Schema.ts:6730-6745 tests `issue._tag === "Filter"` at top level, which the code contradicts: format issues, do not walk the tree. | internal/schema/interpreter.ts:138-195; SchemaAST.ts:5049-5075, 519; Schema.ts:6730-6745 | verified [S] (traced) |

## 3. Unique arrays

| Item | Answer | Source | Status |
|---|---|---|---|
| Signatures | `Schema.UniqueArray<S extends Constraint>(item: S): UniqueArray<S>` (= `Array(item).check(isUnique())`, Type `ReadonlyArray<S["Type"]>`); `Schema.isUnique<T>(annotations?): SchemaAST.Filter<ReadonlyArray<T>>`; `Schema.isUniqueKey<Key, Value>()` for `[key, value]` tuples. | Schema.ts:4799-4815, 9090-9093, 9124 | verified [S][TS] |
| Equivalence | Effect `Hash` + `Equal.equals` via `Array.dedupe`: not `===`, not the item schema's `toEquivalence`. The `UniqueArray` JSDoc (4807-4808) says `Schema.toEquivalence(item)`; the code contradicts it (4815 -> 9092). Strings compare exactly (case-sensitive). | Schema.ts:9075-9093; Array.ts:7078-7092, 9705-9741 | verified [S] (code); behaviour inferred |
| Patterns | No duplicate literals: `Schema.UniqueArray(Schema.Literals(["a", "b", "c"]))`. Case-insensitive strings (no built-in): `Schema.Array(Schema.String).check(Schema.makeFilter((xs) => new Set(xs.map((s) => s.toLowerCase())).size === xs.length \|\| "must be unique (case-insensitive)"))`. | spike.ts | verified [TS] |

## 4. `optionalKey` and decoding defaults

| Item | Answer | Source | Status |
|---|---|---|---|
| Argument type | `withDecodingDefault*` take an **Effect**, not a thunk: `withDecodingDefaultKey(defaultValue: Effect<S["Encoded"], SchemaError, R>, options?: { encodingStrategy?: "omit" \| "passthrough" })`. `() => 200` is a tsc error; write `Effect.succeed(200)`. `…TypeKey` / `…Type` variants take the default as a Type value. `withConstructorDefault(Effect<S["~type.make.in"], SchemaIssue.Issue>)` is separate (only in `make*` / `new`). | Schema.ts:6009-6011, 6056-6058, 6116-6118, 6168-6170, 5930-5934, 5908, 5963 | verified [S][TS] |
| Resulting types (`limit: Schema.Int.pipe(…)`) | `withDecodingDefaultKey`: Type `{ readonly limit: number }`, Encoded `{ readonly limit?: number }` (key may be absent, `undefined` rejected). `withDecodingDefault`: Encoded `{ readonly limit?: number \| undefined }`. `withDecodingDefaultTypeKey`: as the Key variant. **`Int.pipe(Schema.optionalKey, Schema.withDecodingDefault(…))` leaves the Type optional** (`limit?: number`): apply the default to the base schema. | Schema.ts:5946, 5981, 6074; spike2.ts, spike3.ts | verified [TS] |
| Encode / decode / make | Missing key (and `undefined` for the non-Key variant) gives the default, then the field's checks run. Encode: `"passthrough"` (default) always emits the key; `"omit"` drops it. Decoding defaults do not make the field optional in `make` / `new` (`make({})` is a tsc error): also add `Schema.withConstructorDefault(Effect.succeed(200))`. | Schema.ts:6013-6016, 5908; SchemaGetter.ts:1016, 1050; spike2.ts | decode/encode inferred; make-input verified [TS] |

## 5. Timestamps and derived partials

| Item | Answer | Source | Status |
|---|---|---|---|
| Encoding | `Schema.DateTimeUtcFromString`: Type `DateTime.Utc`, Encoded `string`. Encode = `DateTime.formatIso` = `new Date(epochMilliseconds).toISOString()`, i.e. `YYYY-MM-DDTHH:mm:ss.sssZ`: always milliseconds and `Z`, offsets normalised to UTC. | Schema.ts:11675-11683; SchemaTransformation.ts:2168-2186; internal/dateTime.ts:556, 1261 | verified [S][TS]; format is JS `toISOString` |
| Decode inputs | **Not ISO-only.** Any string `DateTime.make` accepts: `new Date(s)`, or `new Date(s + "Z")` when `/Z\|GMT\|[+-]\d{2}$\|[+-]\d{2}:?\d{2}$\|\]$/` finds no zone (zone-less = UTC). Invalid gives "Expected a valid UTC DateTime string". Date-only `2026-10-19` takes the `new Date(s)` branch. | internal/dateTime.ts:208-242, 297; SchemaTransformation.ts:2168-2186; Schema.ts:11658-11662 | verified [S]; non-ISO parsing is engine-dependent (unknown) |
| Stricter wire format | `SchemaTransformation.dateTimeUtcFromString` is exported: `Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)).pipe(Schema.decodeTo(Schema.DateTimeUtc, SchemaTransformation.dateTimeUtcFromString))` has Type `DateTime.Utc`, Encoded `string`. | SchemaTransformation.ts:2168; spike2.ts | types verified [TS]; runtime not run |
| `Struct.map` | `import { Schema, Struct } from "effect"` (`Struct` module vs `Schema.Struct` constructor). `Base.mapFields(Struct.map(Schema.optionalKey))` (`optionalKey` is a `Struct.lambda`) gives Type and Encoded `{ readonly a?: number; … }`: under `exactOptionalPropertyTypes` `{}` is OK and `{ a: undefined }` is rejected. `Struct.map(Schema.optional)` gives `a?: number \| undefined`. Also `Struct.mapPick(["a"], Schema.optionalKey)` and `Struct.pick/omit([...keys])`. | index.ts:735; Struct.ts:1184, 1294, 261, 348; Schema.ts:2395, 2460; spike.ts, spike2.ts | verified [S][TS] |

## 6. Branded values in tests

| Item | Answer | Source | Status |
|---|---|---|---|
| Idiomatic constructor | `WeightKg.make(100)`. API: `make(input: this["~type.make.in"], options?: MakeOptions): this["Type"]` (Schema.ts:228) with `brand<S, B>` setting `"~type.make.in": S["~type.make.in"]` and `"Type": S["Type"] & Brand.Brand<B>` (5266, 5270), i.e. unbranded `number` in, `number & Brand<"WeightKg">` out. Runs the underlying checks (`isMultipleOf(0.25)`) and throws the plain `Error` from section 1 if invalid; `brand` itself adds no check. `makeOption(100)`: `Option<WeightKg>`; `makeEffect(100)`: `Effect<WeightKg, SchemaIssue.Issue>`. `WeightKg.make("100")` is a tsc error. The tarball docs use the same idiom: `ProductId.make("p-1")`. | ai-docs/src/71_ai/20_tools.ts:16, 88-89; Schema.ts:5254-5275, 5289-5292, 5301; spike.ts | verified [S][TS] |
| Alternatives | `Schema.decodeUnknownSync(WeightKg)(100)` also yields `WeightKg`, but takes `unknown` (no compile-time guard) and throws `SchemaError`. `new Row({ id, w: 100 })` is a tsc error: build `w` with `WeightKg.make(100)`. `make(x, { disableChecks: true })` builds deliberately invalid fixtures. | Schema.ts:1872-1877, 1308-1316; spike.ts | verified [S][TS] |

## Recommendation (packages/shared)
1. Put cross-field invariants in the class: `Schema.Class<X>("tanren/X")(Schema.Struct({...}).check(Schema.makeFilter((v) => ok || { path: ["field"], issue: "msg" })))`. Use the `{ path, issue }` form so the error names the field, and do not add a filter-level `message` to it.
2. Never call `new X(...)` / `X.make(...)` on wire or derived data (plain `Error` throw). Use `Schema.decodeUnknownEffect(X)` (`SchemaError`) for wire data and `X.makeEffect(input)` for programmatic construction; reserve `new` / `make` for fixtures and trusted values.
3. Insert/patch shapes: `X.mapFields(Struct.omit([...]))` and `.mapFields(Struct.map(Schema.optionalKey))` return plain structs with **no** struct-level checks: re-attach a tailored `.check(...)` (preferred) or pass `{ unsafePreserveChecks: true }` when the predicate reads only kept fields. Use `optionalKey` (exact) for PATCH bodies.
4. Defaults: `Schema.Int.pipe(Schema.withDecodingDefaultKey(Effect.succeed(200)))`, plus `Schema.withConstructorDefault(Effect.succeed(200))` if `new X({})` must default too. Never `() => 200`; never `optionalKey` before `withDecodingDefault*`.
5. Timestamps: `Schema.DateTimeUtcFromString` encodes canonically but decodes leniently; for client-supplied input use the strict composition in section 5 and test it.
6. Sets and tags: `Schema.UniqueArray(Schema.Literals([...]))`; case-insensitive uniqueness needs a custom filter. Do not rely on `toEquivalence`.
7. Tests: `WeightKg.make(100)` for fixtures; `Schema.decodeUnknownSync` only for wire-shape tests.

## Unknowns
- Runtime strings and shapes marked `inferred` were traced, not run: `SchemaError.message`, standard-schema `issues`, the thrown `Error` from `new X`, encode `passthrough` vs `omit`, `UniqueArray` on `["a", "A"]`, `DateTimeUtcFromString` of `2026-10-19T12:00:00+02:00` (expect `2026-10-19T10:00:00.000Z`). Confirm with a ~20-line `@effect/vitest` spike in `packages/shared` before step 1 relies on them.
- Non-ISO date strings: parsing is engine-dependent; Hermes (Expo) and Workers V8 were not compared. Keep the wire format ISO with `Z`.
- `UniqueArray` JSDoc contradicts its code (see section 3). Re-check on every `effect` bump; versions are pinned exactly.
- `SchemaJITCompiler` (opt-in side-effect import in `package.json` `sideEffects`) has its own `make` fast path; not examined, assumed not enabled.
- effect.website/docs/v4 pages and the `SCHEMA.md` guide linked from `ai-docs/src/01_effect/02_schema/index.md` (not in the tarball) were not read.
