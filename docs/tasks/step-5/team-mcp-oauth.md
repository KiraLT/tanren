# Team sheet: mcp-oauth (step 5)
Charter: `docs/tasks/step-5.md` · Team lead started 23:45 (2026-10-20; read + T1a before the box) · Box 90 min from the Lead's "team mcp done" (23:45) → 01:15
Owned paths: see charter, plus (Lead 23:45) `src/mcp/**`, `src/index.ts`, `src/auth/devUser.ts`, `packages/shared/src/mcp.ts`, `packages/db/src/repositories/**`. Read-only: `src/api/**`, `src/auth/**` (AUTH-1 edits authRoutes/EmailSender/ResendEmailSender/Email.ts from ~00:00), `src/sync/**`, `src/repos/**`.
Lead overrides of the charter: ports **8794–8796** only; never `pnpm db:reset` (shared local D1 already seeded); owner away from ~00:08 → no permissions.ask commands (`wrangler deploy` incl. `--dry-run`, `rm -r*`, `git push|reset|checkout`, `wrangler secret|d1 execute`, `eas`); sonnet for docs and test-only work.

## Assumes (cross-team) — copied from the charter
- mcp (step 4): `src/mcp/{tools,server,McpRoute,McpAuth}.ts` as mcp.md §4; `makeMcp` passes `ctx`; `inputSchema` path from S4-SPIKE reused for write tools. ✔ (verified 23:47)
- plan-web (step 7): `wrangler.jsonc` has `ALLOWED_ORIGINS` + `EMAIL_FROM`; `wrangler.web.jsonc` exists; Resend `layerProvider`; `Config.ts` has `emailFrom`/`resendApiKey`. ✔ (committed 154232c; T1b started after plan-web's 23:52 report)
- hardening: `cloudflareEnv.d.ts` holds the `Cloudflare.Env` merge; `tsconfig.test.json` covers `src/testing/**`; `Sessions.current` may fail 503. ✔
- Lead/owner: all remote actions are owner actions (`docs/design/deploy.md`); ADR-0011 by the Lead.

## Tasks
| id | model | group | status | agent id |
| --- | --- | --- | --- | --- |
| S5-T1a infra on unowned lines (dep, KV, var, test KV, ambient types) | engineer/sonnet | pre-box | done | ae1d4cfbacc0f26a6 |
| S5-T2 contracts (shared mcp.ts, McpPrincipal, Tool generalisation) | engineer/opus | A | done | a3d119d4bc8949d36 |
| S5-T3 write tools + Node tests | engineer/opus | A | done | a6de60c7a387b1203 |
| S5-T4a `src/oauth/**` authorize module + VERIFY answers | engineer/opus | A | done | a4570d7e1542ce396 |
| S5-T1b Env/Config keys, fromEnvSync, test vars, env.production | engineer/sonnet | B | done | ac654e2d060af31d1 |
| S5-T4b wiring (provider, McpAuth.layerOAuth/Live, 401, scope registration, workerd flow, runtime proof) | engineer/opus (continuation) | B | done → fix r1 in flight | a4570d7e1542ce396 |
| S5-T6 `index.workerd.test.ts` + `countingD1` (Lead's INT-B replacement) | engineer/opus | B | done | a1d87110fed0fa887 |
| S5-T7 Lead review follow-ups (a) CurrentPlanResult Option, (c) MAX_HISTORY_LIMIT | engineer/sonnet | B | done | a653b05a1875785ba |
| S5-T5 docs (skill, local-dev §5, CLAUDE.md draft) | engineer/sonnet | C | done | a48eb62f86fbcfc71 |
| S5-REV-A oauth + config | reviewer/opus | C | APPROVE (2 should, 2 nit → T4 fix r1) | ad9868c3bec0f580b |
| S5-REV-B mcp + write tools | reviewer/opus | C | APPROVE (2 should → QA + escalation, 2 nit) | a7ff807de248749ad |
| S5-QA cross-user tests, challenge test move, workerd replace paths + D1 counts | qa/sonnet | D | PASS (worker red only in T4's in-flight oauth) | afb440bca9cb4c449 |

## Frozen contracts
- oauth.md §1–§6 names. FROZEN at team start.
- shared `mcp.ts` step-5 schemas + `tools.ts` `Tool`/`AnyTool`/`eraseTool`/`ToolDeps`/`ToolError` + `McpPrincipal`/`resolve(request, ctx)` — FROZEN 23:52 (T2 part 1 compiled; consumed by T3, T4).
- `Env.OAUTH_KV`, `Env.MCP_RESOURCE_URL`, `Env.OAUTH_PROVIDER?`, `WorkerConfigShape.mcpResourceUrl`, `WorkerConfig.fromEnvSync` — FROZEN 23:59 (written into T1b and T4b briefs before either compiled; T1b landed 00:03).
- `createServer({ principal, run })` — FROZEN 23:54 (T2 report).
- VERIFY answers (T4a, 23:55): (1) issuer = token-endpoint origin → full-URL endpoints put the AS on `BETTER_AUTH_URL`'s host, `.well-known/oauth-authorization-server` answers on any host (`js:3003-3007, 3056, 3305-3309`) → cross-subdomain cookie fallback NOT needed; (2) `authorization_servers` optional, defaults to token-endpoint origin (`js:3365`); (3) `auth.api.signInMagicLink` needs `headers` (`requireHeaders: true`) — but bypasses Better Auth's rate limit + origin check (REV-A) → fix r1 moves to `auth.handler(new Request(...))`; (4) sharing Better Auth with `makeApp` needs a MemoMap option on `makeApp` → keep the second lazy instance (team-lead decision); (5) consent helpers exist (`d.ts:1233-1263`), `beginConsent` headers forwarded.

## Decisions (team-lead; Lead to ratify)
- T1b started on plan-web's committed report (23:52, commit 154232c) without a separate "plan-web done" message.
- `makeAuthorize(env, { betterAuth, sessions?, oauth? })`; approve with no scopes = deny; signed-out approve → 401 page; defects → 503 page; second lazy Better Auth instance; no value import of the provider package outside `oauth/provider.ts` (its JS imports `cloudflare:workers`).
- Dev token through the provider via `resolveExternalToken` (audience = mcpResourceUrl, local only); `challenge` lives in `McpAuth.ts`; `createServer({ principal, run })`; `ANNOTATIONS` keyed by `McpToolName`; `log_session` annotated destructive (worst case); `tools.ts` does not re-export `writeTools` (circular import).
- `update_profile` revives a tombstoned profile; `log_session` replace skips the duplicate-`startedAt` check.
- `CurrentPlanResult = OptionFromNullOr(CurrentPlan)`, `MAX_HISTORY_LIMIT` removed (Lead review findings a, c).
- T1b edited one `MCP_RESOURCE_URL` line in each of `src/auth/{auth,EmailSender,ResendEmailSender}.test.ts` (required by `EnvVars`); Lead told 00:05.

## Escalations
- 00:05 (sent) · T1b's one-line edits in AUTH-1's `src/auth/*.test.ts`; T4 needs no `src/auth` file.
- 00:16 (sent) · D1 Free 50-statement limit vs write tools: measured (QA, real D1, executions incl. batch members) `write_plan_week` 4×6 new 37 / replace 61; 6×8 new 63 / replace 111; `log_session` 20 sets create 25 / replace 46. Unknown whether batch members count individually. Options: confirm docs; stable set ids by `order` (writeTools only, halves replace); bulk upsert/tombstone in `packages/db` (`syncClock.ts` makePut is outside our paths; 100 bound params/statement). Awaiting Lead.

## Log
- 23:45 team-lead started; read charter, oauth.md, spike, mcp.md, ADR-0010, worker CLAUDE.md, team-mcp sheet
- 23:46→23:48 · S5-T1a · engineer/sonnet · ae1d4cfbacc0f26a6 · 78k · 15 · 1 · done; 1.2.3 installed, KV + var, dry-run 3792 KiB, :8794 /health 200, worker 117 green
- 23:48→23:54 · S5-T2 · engineer/opus · a3d119d4bc8949d36 · 146k · 74 · 1 · done; shared 168, own worker tests 48 green; part 1 announced 23:52
- 23:48→23:54 · S5-T3 · engineer/opus · a6de60c7a387b1203 · 183k · 37 · 1 · done; 23 tests, worker 146 green
- 23:48→23:55 · S5-T4a · engineer/opus · a4570d7e1542ce396 · 155k · 34 · 1 · done; 16 tests, worker 162 green; VERIFY 1–5 answered
- 23:59→00:03 · S5-T1b · engineer/sonnet · ac654e2d060af31d1 · 113k · 42 · 1 · done; 169 tests; typecheck red only in AUTH-1's authRoutes.ts; prod dry-run bundles
- 23:59→00:04 · S5-T6 · engineer/opus · a1d87110fed0fa887 · 132k · 33 · 1 · done; 9 workerd tests on the real index.ts; get_overview = 5
- 23:59→00:10 · S5-T4b · engineer/opus (SendMessage) · a4570d7e1542ce396 · ~93k · ~41 · 1 · done; oauth.workerd 6 green, worker 197, shared 175; curl runtime proof on :8794 (7 tools, update_profile + get_overview)
- 00:05→00:07 · S5-T7 · engineer/sonnet · a653b05a1875785ba · 92k · 23 · 1 · done; shared 175, worker 197 green
- 00:10→00:12 · S5-T5 · engineer/sonnet · a48eb62f86fbcfc71 · 102k · 27 · 1 · done; + 00:13 continuation (markers filled)
- 00:12→00:15 · S5-REV-A · reviewer/opus · ad9868c3bec0f580b · 104k · 21 · 1 · APPROVE; should: signInMagicLink bypasses rate limit/origin check; 3 missing tests
- 00:12→00:15 · S5-REV-B · reviewer/opus · a7ff807de248749ad · 105k · 16 · 1 · APPROVE; should: D1 budget on replace; cross-user + D1 replace tests
- 00:16→ · S5-T4 fix r1 (REV-A 1–4) · SendMessage a4570d7e1542ce396 · in flight
- 00:16→00:18 · S5-QA · qa/sonnet · afb440bca9cb4c449 · 102k · 18 · 1 · PASS; +3 cross-user, +3 workerd replace tests, D1 count table
- 00:18 team-lead: apps/worker/CLAUDE.md Status step 5 + D1 budget wording (REV-B nit 3)

## Integration checklist
- [ ] Root `pnpm check` green after AUTH-1 lands (worker typecheck depends on `src/auth/authRoutes.ts`) · Lead · `pnpm check`
- [ ] AUTH-1 keeps the `MCP_RESOURCE_URL` line in `src/auth/{auth,EmailSender,ResendEmailSender}.test.ts` · AUTH-1 · `pnpm -F @tanren/worker typecheck`
- [ ] INT-5 on :8787: committed vars already match (`BETTER_AUTH_URL`/`MCP_RESOURCE_URL` = localhost:8787) · `claude mcp add --transport http tanren-local http://localhost:8787/mcp` (browser flow; unproven by agents) · local-dev.md §5 recipe
- [ ] Existing Claude Code setups with `Authorization: Bearer <DEV_MCP_TOKEN>` keep working (provider `resolveExternalToken`, local only) · `curl -X POST localhost:8787/mcp -H 'authorization: Bearer local-dev-only-mcp-token' …tools/list` → 7
- [ ] D1 budget decision (Escalation 00:16) → follow-up task in `packages/db` or writeTools
- [ ] Root `CLAUDE.md` adapter wording: two adapters now (MCP handler, `oauth/provider.ts`); `biome.jsonc` noClass override covers `src/mcp/**` + `src/index.ts` only — `src/oauth/**` declares no class · Lead
- [ ] CIMD stays off (`global_fetch_strictly_public` not set); decide at deploy · owner
- [ ] ADR-0011 records: issuer on the API host via full-URL endpoints (VERIFY 1–2 answered), `resolveExternalToken` for the dev token, magic link via `auth.handler` (rate limit) · Lead
- 00:16→00:20 · S5-T4 fix r1 · SendMessage a4570d7e1542ce396 · 40 · 1 · done; login via auth.handler, scope ∩ requested, +tests; worker 208 green
- 00:19→00:21 · S5-T3 follow-up (stable planned-set ids by order, Lead decision) · SendMessage a6de60c7a387b1203 · 13 · 1 · done; 27 Node tests
- 00:19→00:20 · S5-QA r2 (D1 docs + re-measure) · SendMessage afb440bca9cb4c449 · 12 · 1 · docs: Free = 1000 subrequests to Cloudflare services; batch semantics undocumented; 4×6 replace 37, 6×8 63
- 00:20→00:22 · S5-REV-A delta · SendMessage ad9868c3bec0f580b · 13 · 2 · APPROVE; should: rate-limit IP header (BetterAuth.ts = AUTH-1 → escalated 00:23; authorize.ts → T4 r2); nit: empty scope
- 00:22→00:23 · S5-QA fix (toSorted → Arr.sort) · afb440bca9cb4c449 · 4 · 1 · done; worker typecheck clean, 223 tests
- 00:23 team-lead: oauth.md §5 sets rule amended (stable set ids by order, Lead decision 00:19); escalation D1 closed, BetterAuth IP header escalated
- 00:23→ · S5-T4 fix r2 (cf-connecting-ip only; advertise both scopes in challenge + PRM; empty scope → MCP_SCOPES) · SendMessage a4570d7e1542ce396 · in flight
- 00:23→00:25 · S5-T4 fix r2 · SendMessage a4570d7e1542ce396 · 35 · 2 · done; cf-connecting-ip only; requiredScopes = both (advertised, not enforced) → 401 + PRM list both; empty scope → MCP_SCOPES; curl re-proof :8794
- 00:26→00:28 · S5-T8 BetterAuth ipAddressHeaders (Lead grant) + toolsFor read gate · engineer/sonnet · a68c90c6e94127a7f · 105k · 26 · 1 · done; rateLimit.workerd 429 proof (NODE_ENV stubbed); finding: limiter off unless NODE_ENV=production
- 00:29→00:29 · S5-T9 shared mcp.test catalogId fixture (V2-F1's Exercise.catalogId) · engineer/sonnet · a04f76b70dad273b4 · 67k · 5 · 1 · done; shared 215 green
- 00:30 team-lead: package gates shared 215 · db 107 · worker 230 green; root `pnpm check` red only in apps/mobile (`CurrentUser.ts`, `runtime.ts` — another stream). CLAUDE.md scopes + Status updated. Team report.
