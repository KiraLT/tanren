# Team sheet: mcp-oauth (step 5)
Charter: `docs/tasks/step-5.md` · Team lead started __:__ (2026-10-__) · Time box 90 min → __:__
Owned paths: see charter. Read-only: `src/api/**`, `src/auth/**` (except `BetterAuth.ts` fallback), `src/sync/**`, `src/repos/**`, `packages/db/**`, `packages/shared/src/**` except `mcp.ts`.
Sequencing: steps 4 and 7 have reported and INT-4/7 is green before this team starts; nobody else edits `apps/worker/**` during this step. Ports: 8791–8793 only; `pnpm db:reset` at most once at the start of the runtime proof, logged below.

## Assumes (cross-team) — copied from the charter
- mcp (step 4): `src/mcp/{tools,server,McpRoute,McpAuth}.ts` as mcp.md §4; `makeMcp` passes `ctx`; `inputSchema` path from S4-SPIKE is reused for write tools.
- plan-web (step 7): `wrangler.jsonc` has `ALLOWED_ORIGINS` + `EMAIL_FROM`; `wrangler.web.jsonc` exists; Resend `layerProvider`; `Config.ts` has `emailFrom`/`resendApiKey`.
- hardening: `cloudflareEnv.d.ts` holds the `Cloudflare.Env` merge; `tsconfig.test.json` covers `src/testing/**`; `Sessions.current` may fail 503.
- Lead/owner: all remote actions are owner actions (`docs/design/deploy.md`); ADR-0011 by the Lead.

## Tasks
| id | model | group | status | agent id |
| --- | --- | --- | --- | --- |
| S5-T1 foundation infra (dep, Env/Config, wrangler*.jsonc) | engineer/sonnet | A | todo | |
| S5-T2 foundation contracts (shared mcp.ts, McpAuth principal, Tool generalisation) | engineer/opus | A | todo | |
| S5-T3 write tools + Node tests | engineer/opus | A (skeleton) → B | todo | |
| S5-T4 OAuth wiring + workerd flow test + runtime proof | engineer/opus | B (after T1, T2) | todo | |
| S5-T5 docs (skill, local-dev §5, worker CLAUDE.md draft) | engineer/sonnet | C (after T4 interim) | todo | |
| S5-REV | reviewer/opus | C (after T3, T4) | todo | |
| S5-QA (if diff > 800 lines) | qa/sonnet | D | todo | |

## Frozen contracts
- oauth.md §1 constructor options + host rule · §2 `OAUTH_KV`, `MCP_RESOURCE_URL`, `WorkerConfig.mcpResourceUrl`, `WorkerConfig.fromEnvSync` · §3 `OAuthApi` port, routes `/authorize`, `/authorize/login` · §4 `MCP_SCOPES`, `OAuthProps`, `McpPrincipal`, `McpAuth.resolve(request, ctx)`, `layerOAuth`, `layerLive`, `layerFixed` · §5 schema amendments + tool rules · §6 wire forms. FROZEN at team start; changes only via the team-lead with a Log line and an `oauth.md` edit.
- Open VERIFY (first thing in T4, answer logged here): full-URL endpoints across two hosts (oauth.md §1); `auth.api.signInMagicLink` name/shape; sharing the Better Auth instance with `makeApp` (§3).

## Escalations
(none yet)

## Log
- __:__ team-lead started; read charter + oauth.md + spike note
