---
paths:
  - "packages/**/*.ts"
  - "apps/worker/**/*.ts"
  - "apps/mobile/src/services/**/*.ts"
  - "apps/mobile/src/hooks/**/*.ts"
---

# Effect code rules (packages/*, apps/worker, apps/mobile services + hooks) — Effect 4.0.5

Verified against `effect@4.0.5` types on 2026-10-19 (`docs/research/2026-10-19-effect-4-api.md`).
When this file and the installed `.d.ts` disagree, the `.d.ts` wins; report it.

- Services: `class Foo extends Context.Service<Foo, FooShape>()("@tanren/Foo") {}`
  with `FooShape` a `readonly` interface of Effect-returning methods. Effectful
  construction: `Context.Service<Foo, FooShape>()("@tanren/Foo", { make })`;
  `make` returns a plain object (`Foo.of` inside `make` is a circular-reference
  error, TS2506). Layers are hand-written:
  `static readonly layer = Layer.effect(this, this.make)`,
  composed with `Layer.provide` / `Layer.mergeAll`. Access with `yield* Foo`.
  No `Context.Tag`, no `Effect.Service`, no `.Default`.
- Programs: `Effect.gen(function* () { ... })` with `yield*`. Named reusable
  functions with `Effect.fn("Name")(function* (...) { ... })`; pass pipeline
  steps as extra arguments to `Effect.fn`, not via `.pipe`.
- Errors: domain and API errors are
  `class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { id: Schema.String }) {}`
  (a schema, so it serialises). `Data.TaggedError` only for purely internal
  errors. Fail with `Effect.fail(new NotFound({ id }))`, never `throw`.
  Recover with `Effect.catchTag` / `Effect.catchTags`; `Effect.catch` (not
  `catchAll`) for everything. `Effect.die` only for true defects.
- Schema: every shape is a `Schema` in `@tanren/shared`. Derive types with
  `typeof X["Type"]` / `typeof X["Encoded"]`. Decode at boundaries with
  `Schema.decodeUnknownEffect(X)`; the failure is `Schema.SchemaError`
  (`.message` formatted, `.issue` structured) and is mapped to
  `ValidationError` there. Encode with `Schema.encodeUnknownEffect`.
  `new X(...)` / `X.make(...)` throw on invalid input (fixtures only);
  `X.makeEffect(...)` fails with a bare `SchemaIssue.Issue`, not `SchemaError`.
- Schema vocabulary: `Schema.Literals(["a", "b"])`, `Schema.Union([A, B])`,
  `Schema.String.check(Schema.isUUID())`, `Schema.Number.check(Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0))`, `Schema.isBetween({ minimum, maximum })`,
  `Schema.isMultipleOf(0.25)`, `Schema.DateTimeUtcFromString`,
  `Schema.optionalKey` (key may be absent) vs `Schema.optional` (also allows
  undefined), `Schema.Struct(...).mapFields(Struct.pick([...]))` for derived
  shapes, `Schema.brand("SessionId")`.
- Nullability: `Option` in TypeScript, `null` only on the wire via
  `Schema.OptionFromNullOr(X)`. `Option.fromNullishOr` for raw values. No
  `undefined` in domain types unless the schema says `optional`.
- Unions discriminate on `_tag`, `type` or a natural key (`table`) and match
  exhaustively: `Match.value(x).pipe(Match.tag("A", ...), Match.exhaustive)`,
  `Match.typeTags`, or `Match.discriminatorsExhaustive("table")` for natural keys.
  No `switch` on a tag or literal union, no nested `_tag` ternaries, and no
  `instanceof` on a tagged value (`Predicate.isTagged(e, "MagicLinkFailed")`
  or `Match`): no Biome plugin catches these yet, so review does (S7-P6 cost
  a round 2 on all three).
- Immutability: `readonly` on every field and array. No `let`, no `push`, no
  `Object.assign` mutation; use spreads, `Arr.map`, `Record`, `Chunk`,
  `HashMap` from `effect` (`import { Array as Arr } from "effect"`: Biome's
  `noShadowRestrictedNames` rejects a bare `Array`/`String` import). Spreading
  a `Schema.Class` instance yields a plain object: rebuild with `X.makeEffect`.
- Running: `Effect.runPromise` / `ManagedRuntime.make(layer)` only in entry
  points (Worker `fetch`, CLI, `@effect/vitest`). Library code returns Effects.
- Mobile hooks run programs with `runtime.runCallback(program, { onExit })` and
  decide the failure state from the exit (`runFailed` in `src/hooks/runExit.ts`),
  never with `runFork` plus a `catchCause` inside the program: a runtime BUILD
  failure (`DatabaseInUse` from a second tab, `StoreError`) never enters the
  program, so `catchCause` cannot see it and the hook stays loading forever
  (BS-1 black screen on tanren.me, 2026-10-27: shipped 2026-10-22, survived
  every review until the owner hit it).
- No I/O at module scope. A Worker's module scope runs at isolate start, where
  workerd forbids I/O and the clock reads 1970; `HttpRouter.toWebHandler(layer)`
  builds layers eagerly there, so a layer's `make` must not open connections or
  validate schemas. Do that inside the request, memoised with `Effect.cached`
  (hardening H3: `betterAuth()` ran its schema check at every startup).
- Time and randomness via `Clock` / `DateTime.now` / `Random`, never `Date.now()`
  or `Math.random()`, so tests can use `TestClock` from `effect/testing`.
- Imports: one import from `"effect"` for core modules; HTTP from `effect/http`
  + `effect/http-api`; SQL from `effect/sql` + `@effect/sql-d1`. `http`,
  `http-api`, `sql` are marked unstable: pin exact versions.
