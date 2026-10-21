# MCP server (step 4 read tools; step 5 shapes typed, not served)

Status: accepted (Lead delegation), 2026-10-20. Normative for `packages/shared/src/mcp.ts`,
`apps/worker/src/mcp/**` and the `/mcp` route. Tags: **[V]** verified today (installed types, npm,
Cloudflare docs via context7), **VERIFY:** engineer checks against installed `.d.ts` before relying on it.

## 1. Shape: stateless `createMcpHandler`, no Durable Object

- `McpAgent` is deprecated and feature-frozen (Cloudflare Agents docs, Jul/Oct 2026; research
  2026-10-19 §0.3) and needs a Durable Object. New servers use `createMcpHandler` from
  `agents/mcp/server`: one `McpServer` per request, no DO binding, no `migrations`/`exports` block,
  no session state [V]. The plan's words "McpAgent" are read as "the Cloudflare Agents SDK MCP
  adapter"; the deviation is recorded for ADR-0010 (after 0007–0009). Every fact that matters here
  (free tier, `wrangler dev`, same Worker, step-5 OAuth) is unchanged or simpler.
- Packages (foundation installs; exact pins in the catalog): `agents` **0.28.1** (0.29.0 shipped
  2026-10-20 15:25Z and trips `minimumReleaseAge`; 0.28.1 exports `./mcp/server` and peers
  `@modelcontextprotocol/server 2.3.1` [V]), `@modelcontextprotocol/server` **2.3.1** (SDK v2; the
  v1 `@modelcontextprotocol/sdk` is only for `McpAgent` [V]). `zod` only if S4-SPIKE says the
  v2 `registerTool` cannot take an Effect Schema (see §4).
- Same Worker (`apps/worker`), route `/mcp`, dispatched in `src/index.ts` **before** `app.handler`:
  ```ts
  export default {
    fetch: (request, env, ctx) =>
      new URL(request.url).pathname === "/mcp" ? mcp.handle(request, env, ctx) : app.handler(request),
  }
  ```
  `createMcpHandler(createServer, options)(request, env, ctx)`; options used: `route: "/mcp"`,
  `responseMode: "json"` in tests only (drops notifications; fine for tool calls) [V]. Production
  (step 5/7, owner-set vars): `allowedHostnames: ["mcp.tanren.me"]` — the default allowlist is
  localhost/workers.dev only [V]. CORS stays default: Claude Code sends no `Origin`.

## 2. Auth in step 4 (no OAuth yet), and the step-5 seam

- `src/mcp/McpAuth.ts`: `class McpAuth extends Context.Service<McpAuth, { resolve: (request: Request) =>
  Effect<Option<UserId>> }>()("@tanren/worker/McpAuth")`.
  - `McpAuth.layerDevToken: Layer<McpAuth, never, WorkerConfig>`: `Authorization: Bearer <token>`
    equal (constant-time compare) to `config.devMcpToken` **and** `config.environment === "local"`
    → `Some(DEV_USER_ID)` (`00000000-0000-4000-8000-000000000001`, the seed user; constant already
    in `src/auth/BetterAuth.ts`, move it to `src/auth/devUser.ts` so mcp does not import Better Auth).
    Anything else → `None`. `Config.ts` already refuses `DEV_MCP_TOKEN` outside `local`; nothing new.
  - Step 5 adds `McpAuth.layerOAuth` reading `ctx.props` set by `@cloudflare/workers-oauth-provider`
    (1.2.3 [V npm]) and wraps the export in `OAuthProvider({ apiRoute: "/mcp", ... })`. The step-4
    adapter therefore takes `ctx` and passes `request`, never reads cookies, never calls `Sessions`.
- `None` → `401` with `WWW-Authenticate: Bearer` and an empty body; the adapter returns it before
  `createMcpHandler` runs. Step 5 replaces the header with the resource-metadata challenge.
- The user id reaches tools by closure, not by `getMcpAuthContext()` (shape unverified):
  `createMcpHandler(() => createServer({ userId, run }), options)` is built per request.

## 3. Contract in `packages/shared/src/mcp.ts` (exported from the barrel)

All shapes are Effect Schemas; outputs are the JSON `Encoded` form (`Option` → `null`,
`DateTime` → ISO string). Tool names are the plan's. `Period`, `Timestamp`, `LocalDate`, ids,
entities come from the existing modules. Example wire forms in §5.

```ts
export const Period = Schema.Literals(["7d", "30d", "90d"])
export const DateRange = Schema.Struct({ from: Timestamp, to: Timestamp })          // half-open [from, to)

// get_overview(period)
export const GetOverviewInput = Schema.Struct({ period: Schema.optionalKey(Period) })  // default "30d"
export const ExerciseSummary = Schema.Struct({
  exerciseId: ExerciseId, name: Label, muscleGroups: Schema.Array(MuscleGroup),
  sessions: Schema.Int, sets: Schema.Int, volumeKg: Schema.Number,                 // Σ weightKg·reps, live sets
  best: Schema.OptionFromNullOr(Schema.Struct({ weightKg: WeightKg, reps: Reps, loggedAt: Timestamp })), // max weight, then reps
  lastLoggedAt: Schema.OptionFromNullOr(Timestamp),
})
export const Overview = Schema.Struct({
  period: Period, range: DateRange, sessions: Schema.Int, sets: Schema.Int, volumeKg: Schema.Number,
  exercises: Schema.Array(ExerciseSummary),                                          // by volumeKg desc, then name
  currentPlan: Schema.OptionFromNullOr(Schema.Struct({ planId: PlanId, name: Label, weeks: Schema.Int })),
})

// get_exercise_history(exerciseId)
export const GetExerciseHistoryInput = Schema.Struct({ exerciseId: ExerciseId, limit: Schema.optionalKey(PageLimit) }) // default 20 sessions
export const HistoryEntry = Schema.Struct({ session: Session, sets: Schema.Array(WorkoutSet) })  // live sets of this exercise, (order, createdAt, id)
export const ExerciseHistory = Schema.Struct({ exercise: Exercise, entries: Schema.Array(HistoryEntry) }) // newest session first

// list_sessions
export const ListSessionsInput = Schema.Struct({ from: Timestamp, to: Timestamp, includeSets: Schema.optionalKey(Schema.Boolean) }) // default false
export const SessionWithSets = Schema.Struct({ session: Session, sets: Schema.Array(WorkoutSet) })  // sets = [] when includeSets is false
export const SessionList = Schema.Struct({ range: DateRange, sessions: Schema.Array(SessionWithSets) }) // oldest first (repo order)

// get_current_plan — no input; output = CurrentPlan | null (existing shared schema)
export const GetCurrentPlanInput = Schema.Struct({})
export const CurrentPlanResult = Schema.NullOr(CurrentPlan)

// Step 5 inputs: typed now, no handler, no registration until step 5.
export const PlannedSetSpec = PlannedSet.mapFields(Struct.omit([...ROW_COLUMNS, "plannedSessionId"]))
  // = { exerciseId, order, targetWeightKg, targetReps, targetRpe, restSeconds, note }
export const PlannedSessionSpec = Schema.Struct({
  ...Struct.omit(PlannedSessionFields, ["planWeekId"]),          // name, order, scheduledDate, notes
  sets: Schema.Array(PlannedSetSpec) })
export const WritePlanWeekInput = Schema.Struct({ planId: Schema.OptionFromNullOr(PlanId), // None = active plan, created if absent
  weekStart: LocalDate, notes: Schema.OptionFromNullOr(Note), sessions: Schema.Array(PlannedSessionSpec) })
export const LogSessionInput = Schema.Struct({ startedAt: Timestamp, finishedAt: Schema.OptionFromNullOr(Timestamp),
  plannedSessionId: Schema.OptionFromNullOr(PlannedSessionId), notes: Schema.OptionFromNullOr(Note),
  sets: Schema.Array(Schema.Struct({ exerciseId: ExerciseId, weightKg: WeightKg, reps: Reps,
    rpe: Schema.OptionFromNullOr(Rpe), note: Schema.OptionFromNullOr(Note) })) })
export const UpdateProfileInput = ProfilePatch

// search_exercises (v2, docs/design/v2-catalog.md §6): read scope, static catalog, 0 D1 statements
// (1, the profile, with availableAt). Input keys all optional (query, muscle, equipment, kind,
// availableAt: LocationId | "active" (v3, equipment.md §5), limit default 20); output
// { results: CatalogMatch[], total } where total = matches before the limit.
// get_profile (v3, equipment.md §5): GetProfileInput = Struct({}), GetProfileResult = OptionFromNullOr(Profile).
// Read tools are kept contiguous: slice(0, 6).
export const MCP_TOOLS = ["get_overview", "get_exercise_history", "list_sessions", "get_current_plan",
  "search_exercises", "get_profile", "write_plan_week", "log_session", "update_profile"] as const
export const McpToolName = Schema.Literals(MCP_TOOLS)
```
Names checked against `plan.ts`/`user.ts`/`common.ts` today (`PlannedSetFields`, `PlannedSessionFields`,
`ProfilePatch`, `PageLimit`, `RestSeconds`, `MuscleGroup` exist). The `mapFields`/`Struct.omit`
derivation is the one `ExercisePatch` already uses; VERIFY that `Struct.omit` on the plain
`PlannedSessionFields` record types as expected, else list the four fields explicitly.

## 4. Worker modules (`apps/worker/src/mcp/`)

- `tools.ts` (pure Effect, Node-testable with `Repositories.layerMemory`):
  ```ts
  export interface ReadTool<I extends Schema.Top, O extends Schema.Top> {
    readonly name: McpToolName; readonly description: string; readonly input: I; readonly output: O
    readonly run: (userId: UserId, input: I["Type"]) => Effect.Effect<O["Type"], ToolError, ToolDeps>
  }
  export type ToolDeps = ExerciseRepo | PlanRepo | SessionRepo | ProfileRepo
  export type ToolError = NotFound | ValidationError | PersistenceError
  export const readTools: ReadonlyArray<AnyReadTool>   // the four step-4 tools + search_exercises + get_profile, in MCP_TOOLS order
  ```
  Tool count (v3, 2026-10-21): **6 read** (`get_overview`, `get_exercise_history`, `list_sessions`,
  `get_current_plan`, `search_exercises`, `get_profile`) + **3 write** in `writeTools.ts` (`write_plan_week`,
  `log_session`, `update_profile`) = **9 total**; a `tanren:read`-only grant lists 6.
  Clock: `DateTime.now` for `to`; `from = to - period`. `get_exercise_history` → `NotFound` for a
  foreign/unknown id (repo scoping makes both look the same). Descriptions tell Claude the units
  (kg, ISO-8601 UTC, half-open ranges) and that ids come from `get_overview`/`get_current_plan`.
- `@tanren/db` additions (mcp team owns `packages/db/src/repositories/Session.ts` + test):
  `SessionRepo.listSetsInRange(userId, range): Effect<ReadonlyArray<WorkoutSet>, PersistenceError>`
  (live sets whose session `started_at` is in range, one statement) and
  `SessionRepo.listSetsForExercise(userId, exerciseId, limit): Effect<ReadonlyArray<WorkoutSet>, PersistenceError>`
  (live sets of the newest `limit` sessions containing that exercise). Reason: Free allows 50 D1
  queries per invocation; a 90-day overview over `listSets` per session would exceed it.
- `server.ts` (adapter; `McpServer` instance lives here only): `createServer({ userId, run })`
  registers each `readTool` with `registerTool(name, { description, inputSchema, annotations:
  { readOnlyHint: true } }, handler)`. `inputSchema` = **VERIFY (S4-SPIKE)**: SDK v2 accepts a
  Standard Schema (`Schema.toStandardSchemaV1(tool.input)` exists in effect 4.0.5 `Schema.ts:1386`
  [V]) or a JSON Schema (`Schema.toJsonSchemaDocument`, `Schema.ts:17040` [V]); use whichever
  `registerTool`'s types take, else duplicate the four inputs in zod inside `server.ts` only.
  Handler: `run(tool.call(userId, args))` (`AnyReadTool.call` decodes the raw args once, runs, encodes the
  output; S4-T3) → `{ content: [{ type: "text", text: JSON.stringify(encoded) }], structuredContent: encoded }`;
  a non-object result (`get_current_plan` → null) is text only. `inputSchema` = the encoded side,
  `toStandardJSONSchemaV1(toStandardSchemaV1(toEncoded(input)))` (S4-SPIKE/T4, 2026-10-20).
  Errors → `{ isError: true, content: [{ type: "text", text }] }`: `NotFound`/`ValidationError` use
  their own message; `PersistenceError` is logged (`Effect.logError`) and shown as
  `"storage unavailable"`. Never `throw`.
- `McpRoute.ts`: `makeMcp(env, { persistence, auth }): { handle(request, env, ctx): Promise<Response> }`
  builds one `ManagedRuntime.make(Layer.mergeAll(persistence, auth, WorkerConfig.layerFromEnv(env)))`
  (effect 4.0.5 has `ManagedRuntime` [V]; `apps/mobile/src/services/runtime.ts` shows the pattern)
  and per request: resolve user → 401 or `createMcpHandler(() => createServer({ userId, run:
  runtime.runPromise }), options)(request, env, ctx)`. `index.ts` passes `d1Persistence(env.DB)` and
  `McpAuth.layerDevToken`; tests pass memory layers and `McpAuth` fixed layers.

## 5. Wire examples

Attach locally (Claude Code; `--header` syntax **VERIFY** with `claude mcp add --help`, the CLI is
not on this shell's PATH):
```
claude mcp add --transport http tanren-local http://localhost:8787/mcp \
  --header "Authorization: Bearer local-dev-only-mcp-token"
```
`tools/call` request body and the result's `structuredContent` for `get_overview`:
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "get_overview", "arguments": { "period": "7d" } } }
```
```json
{ "period": "7d", "range": { "from": "2026-10-13T00:00:00.000Z", "to": "2026-10-20T00:00:00.000Z" },
  "sessions": 4, "sets": 58, "volumeKg": 18740.5,
  "exercises": [ { "exerciseId": "7d4e…", "name": "Back Squat", "muscleGroups": ["quads", "glutes"],
    "sessions": 2, "sets": 10, "volumeKg": 6200,
    "best": { "weightKg": 110, "reps": 5, "loggedAt": "2026-10-17T17:21:04.000Z" },
    "lastLoggedAt": "2026-10-17T17:21:04.000Z" } ],
  "currentPlan": { "planId": "a1b2…", "name": "Upper / lower, autumn block", "weeks": 5 } }
```
`search_exercises` (v2): request `"arguments": { "query": "ohp", "limit": 5 }`, `structuredContent`:
```json
{ "results": [ { "catalogId": "overhead-press", "name": "Overhead Press",
    "aliases": ["OHP", "Military Press"], "kind": "reps", "primaryMuscles": ["shoulders", "triceps"],
    "secondaryMuscles": ["upperBack", "core", "chest"], "equipment": ["barbell"], "movement": "verticalPush" } ],
  "total": 1 }
```
`get_profile` (v3): request `"arguments": {}`, `structuredContent` (or text `null` before the
first `update_profile`):
```json
{ "id": "0000…0001", "userId": "0000…0001", "createdAt": "2026-09-14T08:00:00.000Z",
  "updatedAt": "2026-09-14T08:00:00.000Z", "deletedAt": null,
  "goals": [ { "kind": "strength", "note": "Squat 140, bench 100, deadlift 180 by spring." } ],
  "constraints": [], "availableDays": ["mon", "wed", "fri", "sat"],
  "locations": [ { "id": "56fb…", "name": "Gym", "equipment": ["barbell", "dumbbell", "…"] },
                 { "id": "110e…", "name": "Home", "equipment": ["dumbbell", "kettlebell", "bench", "pullUpBar", "band"] } ],
  "activeLocationId": "56fb…", "timezone": "Europe/Berlin" }
```
`search_exercises { "query": "press", "availableAt": "<Home id>" }` keeps only entries Home's
equipment covers; an id not in `locations` → `NotFound: location <id> not found`.
Unauthenticated: `HTTP/1.1 401`, `WWW-Authenticate: Bearer`, empty body. Unknown exercise:
`{ "isError": true, "content": [{ "type": "text", "text": "NotFound: exercise 7d4e… not found" }] }`.

## 6. Not decided here

- OAuth flow details, the Claude app connector and `mcp.tanren.me` routing (step 5; ADR-0010 covers
  the adapter choice only). Tool-level pagination beyond `limit` (add when a tool output nears 1 MB).
- Whether `createMcpHandler`'s `authContext` option is the better seam for step 5 (closure works today).
