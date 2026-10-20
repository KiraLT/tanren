---
name: effect-conventions
description: How Tanren writes Effect 4.0.5 code — Context.Service classes with explicit static layers, Schema-first shapes (branded UUIDs, Schema.Class entities, checks, OptionFromNullOr, DateTimeUtcFromString), Schema.TaggedError errors, Effect.fn, exhaustive Match, HttpApi from effect/http-api, effect/sql + @effect/sql-d1, and @effect/vitest 4 tests (it.effect, layer, TestClock from effect/testing). Load for any code under packages/ or apps/worker.
---

# Effect conventions for Tanren (Effect 4.0.5)

§2–§3 are trimmed copies of `packages/shared/src`. Every §4–§9 snippet compiled against the
real shared exports (TS 7.0.2, repo tsconfig) and the §9 tests passed (S1-T10, 2026-10-20);
not installed yet, so unchecked: `@effect/sql-d1` (§1 import, §8 comment). The installed
`.d.ts` wins; `node_modules/effect/ai-docs/` is the reference. Real examples: `references/`.

## 1. Imports

```ts
import { D1Client } from "@effect/sql-d1"
import { describe, expect, it, layer } from "@effect/vitest"
import { Context, Data, Effect, Layer, Match, Option, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { SqlClient, SqlSchema } from "effect/sql"
import { TestClock } from "effect/testing"
```

- Core: one import from `"effect"`; `http`, `http-api`, `sql`, `@effect/sql-d1`,
  `@effect/vitest` are unstable: exact pins. No extension on `"./ids"`.
- Biome's `noShadowRestrictedNames` rejects global names: import `Array as
  Arr`, `String as Str`; never name a type `Set`/`Map` (hence `WorkoutSet`).

## 2. Schema-first shapes (`packages/shared`)

```ts
// ids.ts: every id is a branded UUID
export const Uuid = Schema.String.check(Schema.isUUID())
export const SetId = Uuid.pipe(Schema.brand("SetId"))
export type SetId = typeof SetId.Type

// common.ts: branded units, wire timestamps, the sync columns every row has
export const Timestamp = Schema.DateTimeUtcFromString // ISO string on the wire, DateTime.Utc in TS
export const Rpe = Schema.Number.check(
  Schema.isBetween({ minimum: 1, maximum: 10 }),
  Schema.isMultipleOf(0.5),
).pipe(Schema.brand("Rpe")) // WeightKg (0.25 steps) and Reps (int) are branded the same way
export const ROW_COLUMNS = ["id", "userId", "createdAt", "updatedAt", "deletedAt"] as const
export const rowFields = <Id extends Schema.Constraint>(id: Id) => ({
  id,
  userId: UserId,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: Schema.OptionFromNullOr(Timestamp),
})

// session.ts: entity = rowFields + own fields; Insert/Patch derived, never retyped
export const WorkoutSetFields = {
  sessionId: SessionId,
  weightKg: WeightKg,
  reps: Reps,
  rpe: Schema.OptionFromNullOr(Rpe), // … exerciseId, order, note, plannedSetId, loggedAt
}
export class WorkoutSet extends Schema.Class<WorkoutSet>("@tanren/shared/WorkoutSet")({
  ...rowFields(SetId),
  ...WorkoutSetFields,
}) {}
/** Client input: no id (IdGenerator), no userId (auth), no sync columns (server). */
export const WorkoutSetInsert = WorkoutSet.mapFields(Struct.omit(ROW_COLUMNS))
export type WorkoutSetInsert = typeof WorkoutSetInsert.Type
// Patch: also omit the immutable parent key, then `.mapFields(Struct.map(Schema.optionalKey))`

// sync.ts: one union discriminated on `table`; a soft delete is a row with deletedAt: Some
const member = <T extends SyncTable, Row extends Schema.Constraint>(table: T, row: Row) =>
  Schema.Struct({ table: Schema.Literal(table), row })
export const SyncChange = Schema.Union([
  member("exercise", Exercise),
  member("session", Session),
  member("set", WorkoutSet), // … one per synced table (8)
])
export type SyncChange = typeof SyncChange.Type
```

- Rows carry the sync columns; `Option` in TS, `null` on the wire. Branded numbers
  still multiply: `set.weightKg * set.reps`.
- `X.makeEffect` fails with a bare `SchemaIssue.Issue` (`ValidationError.fromIssue`);
  `decodeUnknownEffect(X)(raw)` with `Schema.SchemaError`
  (`Effect.mapError(ValidationError.fromSchemaError)`). `X.make`, `Rpe.make(8)`
  and `new X(...)` throw: tests and fixtures only (`{ disableChecks: true }` builds an invalid brand).
- `mapFields` **drops struct-level checks**: with a cross-field filter (`Session`, `Exercise`)
  build Insert as `X.mapFields(Struct.omit(ROW_COLUMNS)).check(filter)`.
- Types: `typeof X.Type` / `(typeof X)["Encoded"]`.

## 3. Errors

```ts
// errors.ts. Domain/API errors are schemas, so HttpApi can serialise them.
export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { message: Schema.String, issues: Schema.Array(ValidationIssue) },
  { httpApiStatus: 400 },
) {
  /** For `X.makeEffect` failures (a bare `SchemaIssue.Issue`). */
  static fromIssue(issue: SchemaIssue.Issue): ValidationError {
    return new ValidationError({ message: formatMessage(issue), issues: [/* path + message per issue */] })
  }
  /** For `decodeUnknownEffect` failures. */
  static fromSchemaError(error: Schema.SchemaError): ValidationError {
    return ValidationError.fromIssue(error.issue)
  }
}
// NotFound { entity, id } (404), Forbidden (403), SyncConflict (409): same shape.
/** Internal-only error: never crosses a schema boundary. */
export class ClockSkew extends Data.TaggedError("ClockSkew")<{ readonly driftMs: number }> {}
declare const load: (id: string) => Effect.Effect<string, NotFound | ValidationError | ClockSkew>
export const loadName = Effect.fn("loadName")(
  function* (id: string) {
    const name = yield* load(id)
    if (name.length === 0) {
      return yield* new ValidationError({ message: "empty name", issues: [] }) // `return yield*` on failure
    }
    return name
  },
  Effect.catchTag("ClockSkew", () => Effect.succeed("unknown")),
)
// loadName: (id: string) => Effect<string, NotFound | ValidationError>; also `catchTags`, `Effect.catch`
```

`Schema.TaggedError` + `httpApiStatus` for anything a caller or the wire sees;
`Data.TaggedError` only internally. Fail with `Effect.fail(new E(...))` or
`return yield* new E(...)`; `Effect.die` only for defects; never `.pipe` an `Effect.fn`.

## 4. Services and layers

```ts
export interface SetServiceShape {
  readonly logSet: (userId: UserId, input: WorkoutSetInsert) => Effect.Effect<WorkoutSet, ValidationError>
}

export class SetService extends Context.Service<SetService, SetServiceShape>()(
  "@tanren/SetService",
  {
    make: Effect.gen(function* () {
      const repo = yield* SetRepo // dependencies, resolved when the layer is built
      const ids = yield* IdGenerator
      const logSet = Effect.fn("SetService.logSet")(
        function* (userId: UserId, input: WorkoutSetInsert) {
          const now = yield* DateTime.now
          const id = SetId.make(yield* ids.next) // `next` yields a validated Uuid
          const set = yield* WorkoutSet.makeEffect({
            ...input,
            id,
            userId,
            createdAt: now,
            updatedAt: now,
            deletedAt: Option.none(),
          })
          yield* repo.upsert(set)
          return set
        },
        Effect.mapError(ValidationError.fromIssue), // pipeline steps are extra arguments, not .pipe()
      )
      return { logSet } // plain object: `SetService.of` is not available inside make
    }),
  },
) {
  static readonly layerNoDeps = Layer.effect(this, this.make) // tests provide SetRepo + IdGenerator.layerTest
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(Layer.mergeAll(SetRepo.layer, IdGenerator.layer)),
  )
}

// Entry points (Worker fetch, scripts) are the only places that run Effects.
export const runtime = ManagedRuntime.make(SetService.layer) // long-lived: `await runtime.dispose()`
```

- Ids `"@tanren/<Name>"`; the `readonly` shape is the 2nd type parameter, so `make` is
  checked against it. `X.of(...)` works in statics (§6). Layers: `layer`, `layerNoDeps`,
  `layerTest`. `Layer.provide` hides the provided service, `provideMerge` exposes it too.

## 5. Immutability and control flow

```ts
export const totalVolume = (sets: ReadonlyArray<WorkoutSet>): number =>
  pipe(
    sets,
    Arr.filter((set) => Option.isNone(set.deletedAt)),
    Arr.map((set) => set.weightKg * set.reps),
    Arr.reduce(0, (total, volume) => total + volume),
  )

/** Class instances: rebuild so the class and its checks survive; plain objects: spread. */
export const withReps = (set: WorkoutSet, reps: Reps) => WorkoutSet.makeEffect({ ...set, reps })
/** Union on a natural key (`table`): exhaustive, adding a member is a compile error here. */
export const parentId = (change: SyncChange): Option.Option<string> =>
  Match.value(change).pipe(
    Match.discriminatorsExhaustive("table")({
      profile: () => Option.none(),
      exercise: () => Option.none(),
      plan: () => Option.none(),
      planWeek: ({ row }) => Option.some(row.planId),
      plannedSession: ({ row }) => Option.some(row.planWeekId),
      plannedSet: ({ row }) => Option.some(row.plannedSessionId),
      session: () => Option.none(),
      set: ({ row }) => Option.some(row.sessionId),
    }),
  )
```

`{ ...classInstance }` is a plain object, not a `WorkoutSet`. Also
`Option.fromNullishOr(raw)`; `_tag` unions use `Match.tag` / `Match.typeTags<U>()({...})`.

## 6. Time, randomness, ids

```ts
export const stamp = Effect.gen(function* () {
  const now = yield* DateTime.now // DateTime.Utc
  const millis = yield* Clock.currentTimeMillis // number
  return { iso: DateTime.formatIso(now), millis, jitter: yield* Random.nextIntBetween(0, 100) }
})

/** ids.ts. Ids come from a service so tests are deterministic. `next: Effect<Uuid>`. */
export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()(
  "@tanren/IdGenerator",
) {
  /** Web Crypto exists in Workers, Hermes and browsers; `Effect.sync` keeps it lazy. */
  static readonly layer = Layer.succeed(
    this,
    this.of({ next: Effect.sync(() => crypto.randomUUID()).pipe(Effect.flatMap(toUuid)) }),
  )
}
```

No `Date.now()`, `new Date()`, `Math.random()`, inline `crypto.randomUUID()`.
`Random` has no UUID and `Crypto` is unstable, hence `IdGenerator`. `IdGenerator.layerTest`
counts `00000000-0000-4000-8000-000000000001`, `…002`; `yield* newId(SetId)` gives a branded
id. Seed: `effect.pipe(Random.withSeed(42))`.

## 7. HttpApi (`apps/worker`, step 3)

```ts
export class SetsApi extends HttpApiGroup.make("sets").add(
  HttpApiEndpoint.get("byId", "/sets/:id", {
    params: { id: SetId },
    success: WorkoutSet,
    error: NotFound, // status 404 comes from the error's httpApiStatus annotation
  }),
  HttpApiEndpoint.post("log", "/users/:userId/sets", {
    params: { userId: UserId },
    payload: WorkoutSetInsert,
    success: WorkoutSet,
    error: ValidationError,
  }),
) {}

export class Api extends HttpApi.make("tanren").add(SetsApi) {}
export const SetsHandlers = HttpApiBuilder.group(
  Api,
  "sets",
  Effect.fn(function* (handlers) {
    const repo = yield* SetRepo
    const service = yield* SetService
    return handlers.handleAll({
      byId: ({ params }) => repo.byId(params.id),
      log: ({ params, payload }) => service.logSet(params.userId, payload),
    })
  }),
)
const ApiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(SetsHandlers),
  Layer.provide(
    SetService.layerNoDeps.pipe(
      Layer.provideMerge(Layer.mergeAll(SetRepo.layer, IdGenerator.layer)),
    ),
  ),
  Layer.provide(HttpServer.layerServices),
)
// Worker entry: build once at module scope, call per request.
export const { handler, dispose } = HttpRouter.toWebHandler(ApiLayer) // fetch: handler(request)
```

Ran under Node via `handler(new Request(…))`: 404 + encoded `NotFound`, 200 + wire shape,
empty 400 when payload/params fail. **Unverified:** reaching the per-request Worker `env`
(D1) from a module-scope handler (`handler(request, context)` takes a `Context`). Spike at step 3.

## 8. SQL (`packages/db`, step 2), compile-checked only

```ts
export class SetRows extends Context.Service<SetRows>()("@tanren/SetRows", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const bySession = SqlSchema.findAll({
      Request: Schema.Struct({ userId: UserId, sessionId: SessionId }),
      Result: WorkoutSet,
      execute: ({ userId, sessionId }) =>
        sql`SELECT * FROM sets WHERE ${sql("userId")} = ${userId} AND ${sql("sessionId")} = ${sessionId}`,
    })
    return { bySession }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
}
// Built where `env.DB` is in scope: `.pipe(Layer.provide(D1Client.layer({ db: env.DB })))`
```

`Request` is encoded before `execute`; rows are decoded with `Result`. Also `findOne`
(`NoSuchElementError`), `findOneOption`, `findNonEmpty`, `void`. `D1Client.layer` also takes
`transformQueryNames: Str.camelToSnake` / `transformResultNames: Str.snakeToCamel` (unverified).

## 9. Testing (`@effect/vitest` 4.0.5)

```ts
const input = WorkoutSetInsert.make({
  sessionId: SessionId.make("00000000-0000-4000-8000-000000000002"),
  exerciseId: ExerciseId.make("00000000-0000-4000-8000-000000000004"),
  order: OrderIndex.make(0),
  weightKg: WeightKg.make(100),
  reps: Reps.make(5),
  rpe: Option.some(Rpe.make(8)),
  note: Option.none(),
  plannedSetId: Option.none(),
  loggedAt: DateTime.makeUnsafe("2026-10-19T08:00:00.000Z"),
})

// One layer for the block: built once, state shared, torn down after.
const TestLayer = SetService.layerNoDeps.pipe(
  Layer.provideMerge(Layer.mergeAll(SetRepo.layer, IdGenerator.layerTest)),
)
layer(TestLayer)("SetService", (it) => {
  it.effect("stamps createdAt from the Clock", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 19, 8))
      const set = yield* (yield* SetService).logSet(owner, input)
      expect(DateTime.formatIso(set.createdAt)).toBe("2026-10-19T08:00:00.000Z")
      expect(set.id).toBe("00000000-0000-4000-8000-000000000001") // IdGenerator.layerTest
    }),
  )
})

// Fresh layer per test: provide it inside the test.
const setId = SetId.make("00000000-0000-4000-8000-0000000000ff")
it.effect("reports NotFound for an unknown id", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip((yield* SetRepo).byId(setId))
    expect(error).toMatchObject({ _tag: "NotFound", entity: "set" })
  }).pipe(Effect.provide(SetRepo.layer)),
)
```

- `it.effect` (TestClock at epoch 0) and `it.live` (real clock) are already scoped: no
  `it.scoped`. Time travel: `Effect.forkChild(eff)`, `TestClock.adjust("90 seconds")`, `Fiber.join`.
- `layer(L)("name", (it) => …)` shares one layer and its state; no `.live`.
- Typed failures: `Effect.flip` (error becomes the value) or `Effect.result(eff)` +
  `Result.isFailure`. Type-level: `expectTypeOf`.
