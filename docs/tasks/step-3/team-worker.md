# Step 3 — team worker (apps/worker)
Charter: Lead, 2026-10-20 22:08 · team-lead/opus · Target ≤ 90 min · Budget: ≤ 2 engineers parallel, ≤ 2 review rounds
Owned: apps/worker/{src,test}/**, apps/worker/{package.json,tsconfig.json,vitest.config.ts,CLAUDE.md}; wrangler.jsonc additive only (never remove D1 `DB`); catalog entries for own deps in pnpm-workspace.yaml.
Contracts read-only: packages/shared, docs/design/{data-model,db,local-dev}.md. Engineers use superpowers:test-driven-development + verification-before-completion (the brief replaces brainstorming/planning).

## Team-internal interfaces (frozen for this team; any change goes through the team lead)
- `src/Env.ts` `interface Env { DB: D1Database; ENVIRONMENT; BETTER_AUTH_URL; BETTER_AUTH_SECRET; ALLOWED_ORIGINS; EMAIL_MODE; DEV_MCP_TOKEN? }` (types from `@cloudflare/workers-types`).
- `src/Config.ts` `WorkerConfig` (Context.Service): `{ environment: "local"|"preview"|"production"; betterAuthUrl; betterAuthSecret: Redacted; allowedOrigins: ReadonlyArray<string>; emailMode: "console"|"provider"; devMcpToken: Option<Redacted> }`, `WorkerConfig.layerFromEnv(env)`; startup guard (LD §2) fails with a config error.
- `src/auth/Sessions.ts` `Sessions` (Context.Service) `{ current: (headers: globalThis.Headers) => Effect<Option<UserId>> }`, `Sessions.layerFixed(Option<UserId>)` for tests/dev. T4 provides `Sessions.layer` via Better Auth.
- `src/app.ts` `makeApp(env: Env): { handler(req: Request): Promise<Response>; dispose() }` (pure of `cloudflare:workers`, used by tests); `src/index.ts` = adapter: `import { env } from "cloudflare:workers"`, `makeApp(env)` once at module scope, `export default { fetch }`.
- `src/api/Authentication.ts` `CurrentUser` service `{ userId: UserId }` + `Authentication` HttpApiMiddleware (provides CurrentUser, fails `HttpApiError.Unauthorized`), implemented on `Sessions`.
- `src/repos/` ports = db.md §6 shapes exactly (`ProfileRepo`, `ExerciseRepo`, `PlanRepo`, `SessionRepo`, worker-local `PersistenceError` with db.md's shape) + `layerMemory` on one shared in-memory store. `src/repos/index.ts` is the single import point, so integration swaps to `@tanren/db` there.
- `src/sync/SyncStore.ts` port — FROZEN 22:40 (Lead dispatches the D1 implementation in packages/db against it; changes only via the Lead):
  ```ts
  interface SyncKey { readonly table: SyncTable; readonly id: string }
  interface PullPage { readonly changes: ReadonlyArray<SyncChange>; readonly cursor: SyncCursor; readonly hasMore: boolean }
  interface SyncStoreShape {
    /** The caller's existing rows for `keys`, tombstones included; unknown keys skipped. */
    readonly getRows: (userId: UserId, keys: ReadonlyArray<SyncKey>) => Effect<ReadonlyArray<SyncChange>, PersistenceError>
    /** Writes every change atomically (one D1 batch) at ONE new sync position (one sync_clock bump). Foreign userId → Forbidden. No LWW here (Sync service decides). */
    readonly apply: (userId: UserId, changes: ReadonlyArray<SyncChange>) => Effect<void, PersistenceError | Forbidden>
    /** Rows strictly after `after` in server sync order (server_seq, SYNC_TABLE_ORDER rank, id), at most `limit`; tombstones included; None = from the start. Bad cursor → ValidationError. */
    readonly pull: (userId: UserId, after: Option<SyncCursor>, limit: number) => Effect<PullPage, PersistenceError | ValidationError>
  }
  class SyncStore extends Context.Service<SyncStore, SyncStoreShape>()("@tanren/worker/SyncStore") {}
  ```
  Cursor wire format `"<seq>:<rank>:<id>"` (`-` for empty id), helpers `encodeCursor`/`decodeCursor`/`tableRank`/`positionOrder` exported from the same file; the cursor of an empty page echoes `after` (or the start). `PersistenceError` = db's shape (`operation`, `cause`). The memory impl is `SyncStore.layerMemory` on the shared `MemoryStore`.
- HTTP surface (all but `/health` and `/api/auth/*` behind `Authentication`; every query scoped to `CurrentUser.userId`):
  `GET /health` · `GET|PUT /profile` (PUT body `ProfileInsert`, id = userId) ·
  `GET /exercises` · `GET|PATCH|DELETE /exercises/:id` · `POST /exercises` (`ExerciseInsert`/`ExercisePatch`) ·
  `GET /sessions?from&to` (both required, half-open) · `GET|PATCH|DELETE /sessions/:id` · `POST /sessions` · `GET|POST /sessions/:sessionId/sets` · `PATCH|DELETE /sessions/:sessionId/sets/:id` (R1: no `getSet` in db ports) ·
  `GET /plans` · `GET /plans/current` (worker-local `CurrentPlan` schema, flagged for a move to shared) ·
  `POST /sync/push` · `POST /sync/pull` (shared Push/Pull schemas, DM §10.2 rules) · `/api/auth/*` → Better Auth.
  DELETE = soft delete (`deletedAt`), 204. Errors: shared `NotFound`/`Forbidden`/`ValidationError`; `PersistenceError` is logged and becomes `HttpApiError.InternalServerError`. Server-side ids via `IdGenerator`, times via `DateTime.now`.
- Tests: Node Vitest via `makeApp(fakeEnv)` + `handler(new Request(...))` with memory layers and `Sessions.layerFixed`. Real-D1/workerd tests come with integration.

## Tasks
| id | title | model | depends on | files | status |
| --- | --- | --- | --- | --- | --- |
| W-R1 | Research: Better Auth on Workers; http-api middleware + raw route + CORS; `cloudflare:workers` env | researcher/sonnet | — | docs/research/2026-10-20-worker-auth-httpapi.md | done |
| W-T1 | Deps, wrangler vars/main/nodejs_compat, tsconfig, Env, Config + guard, Sessions port, stub entry | engineer/sonnet | — | package.json, pnpm-workspace.yaml (catalog), lockfile, tsconfig.json, wrangler.jsonc, src/{Env,Config,index}.ts, src/auth/Sessions.ts | done |
| W-T2 | HttpApi resources + Authentication middleware + repo ports/memory + makeApp/CORS | engineer/opus | T1, R1 | src/api/**, src/repos/**, src/app.ts, src/index.ts | done |
| W-T4 | Better Auth: EmailSender (console/capture), auth instance, `/api/auth/*` route layer, `Sessions.layer` | engineer/opus | T1, R1 | src/auth/** (except Sessions.ts port shape) | blocked-in-flight: memoryAdapter under workerd |
| W-T3 | Sync push/pull service + SyncStore port/memory + sync group wiring | engineer/opus (T2's engineer, continuation) | T2 | src/sync/**, src/api/Api.ts, src/app.ts | done |
| W-REV | Review + gate | reviewer/opus | T2, T3, T4 | owned paths | R1 done (request changes: 2 blocking repos, 3 should, 5 nit); R2 pending |
| W-QA | QA (only if diff > 800 lines) | qa/sonnet | REV | *.test.ts | todo |

Parallel groups: A = {T1, R1} · B = {T2, T4} · C = {T3, review of T4} · D = {REV fixes}.

## Log (HH:MM→HH:MM · task · role/model · tokens · tool uses · rounds · outcome)
- 22:20→ · W-T1 ∥ W-R1 dispatched
- 22:20→22:23 · W-R1 · researcher/sonnet · 54k tok · 28 tools · 1 · note written (role since retired: use spike agents)
- 22:20→22:23 · W-T1 · engineer/sonnet · 74k · 29 · 1 · accepted (worker gate green; root red from mobile/db only). Incident: engineer ran `pkill -f "wrangler dev"` (may kill other streams' dev servers); later briefs forbid it
- 22:24→22:30 · W-T2 · engineer/opus · 127k · 38 · 1 · accepted, 10 min over box
- 22:24→22:27 · W-T4 · engineer/opus · 72k · 19 · 1 · accepted
- 22:31→ · W-T3 (continuation of T2 engineer) ∥ W-REV R1 (reviewer/opus · 63k · 14 · 2 min) → R1 fixes routed: repos → T2/T3 engineer, auth nits + CLAUDE.md → T4 engineer
- 22:36 · team-lead forced to hand back early by harness; W-T3 + R1 fixes (engineer abc1124b93460c1e3) and R1 auth nits (a931386bc4fbeef2c) still running; worker gate RED mid-edit (app.test 8 fail, typecheck fail)
- 22:40 · Lead: decisions 1–9 ratified; 401 on getSession failure accepted (follow-up: map store failures to 503); SyncStore D1 impl + auth-table migration go to the db stream; SyncStore port frozen in this sheet
- 22:31→22:52 · W-T3 + R1 fixes · engineer/opus (continuation) · 208k · 30 · 1 · gate green (42 tests); 15 min over box; wrangler smoke FAILED: `memoryAdapter is not a function` under workerd (BetterAuth.ts)
- 22:53→22:55 · W-REV R2 · reviewer/opus · 71k · 18 · R1 blockers fixed; 1 new blocker (cursor regex rejects uppercase UUID) → engineer; backlog: duplicate (table,id) in one push breaks partition; child accepted when its parent write was skipped as foreign
- 22:55→ · R2 fix (abc1124) ∥ memoryAdapter/workerd fix + smoke (a931386)
- Follow-ups (Lead-ratified): map Sessions store failures to 503 instead of 401; HTTP tests for nested set routes + /sync/*; dedupe push keys; parent re-check after skipped foreign writes
- 22:58 · R2 cursor fix + sync CORS tests done (45 tests, gate green). memoryAdapter/workerd fix (a931386) still running at hand-back
