# Handoff — 2026-10-20

## Where we are (2026-10-20 22:47)
**Step 1 DONE. Step 2 (db) DONE. Company mode delivered steps 3 and 6 to
"integrated locally":** root `pnpm check` is GREEN with 306 tests (shared 146,
db 61, worker 38, mobile 61). `pnpm db:reset` seeds a local D1 (16 sessions,
276 sets); `pnpm smoke:worker --port <p> --log <file>` passes the full
sign-in → /exercises → pull → push loop against it. The mobile app has an
offline store, Today screen, sync engine, and the CurrentUser/re-key logic;
its e2e against the local worker (INT-2b) is the one open integration item
(cookie across :8081/:8799 may need a dev bearer path). Nothing is committed.

## Verified
- Gate green at 306 tests; smoke script passes end to end on seeded local D1.
- Worker runs under `wrangler dev` (Better Auth on D1, magic link logged).
- Mobile package gate green; `agent-browser` drove the Today screen headless
  (log set → reload → persisted) in the spike.
- Dev system: 7 roles (architect, engineer, reviewer, qa, spike, team-lead,
  engineering-manager), all-tools + deny lists, Kaizen loop (incidents → EM
  per task → retro per step). Role audit (fable) done; blocking fixes applied,
  rest with the EM.

## In flight / resumable
- EM applying role-audit findings 4–19 (proposals for settings/CLAUDE.md come
  back to the Lead).
- /doctor report pending the owner's two confirmations.

## Next actions (in order)
1. INT-2b: mobile e2e on web via `ui-check` (sign in through the magic link in
   the same browser or add a dev bearer path to the worker); then step 7 (Plan
   screen, web layout, deploy) and step 4 (MCP) as parallel teams with
   charters that fill `Assumes (cross-team)` first.
2. TOOLING brief: per-package `check` scripts; apps/worker workerd vitest
   project (retire the manual smoke); `@types/node` for worker scripts; biome
   noNamespace override for `*.d.ts`; ADR for pnpm isolated linker + Expo 58.
3. `/retro 2` (step 2 + company mode) then `/handoff`; ask the owner to commit.

## Decisions for the owner
- ADR-0004 (proposed): Effect 4.0.5 instead of the plan's Effect 3 names
  (LTS to 2029; http-api/sql in core; @effect/sql-d1 4.0.5; no
  @effect/sql-drizzle for v4 → step 2 picks drizzle@rc effect-d1 or
  effect/sql). Flip to 3.22 costs a catalog pin + renames.
- ADR-0003 (proposed): TypeScript 7.0.2 native `tsc`; `@effect/tsgo` for the
  editor.
- ADR-0002 (accepted by owner message "use Biome, no ESLint"; written in
  S1-T2b): Biome only; functional rules via built-ins + GritQL plugins.
- Formatter style: 2-space, no semicolons (Lead's call; override freely).
- Data model (docs/design/data-model.md §14): Q1 enum lists; Q2 opaque
  `SyncCursor` for pull (recommended yes); Q3 `weekStart` any weekday; Q4
  bodyweight = `weightKg 0`, holds = `reps` seconds, no AMRAP; Q5 no profile
  extras yet.
- Owner confirmed in-session: Biome only; newest TypeScript; per-role model
  matrix; company mode for big steps; Lead never writes code or researches;
  engineering-manager + /retro loop; broad permission allowlist.

## Gotchas learned this session (also in docs/retro/incidents.md)
- Start everything whose inputs exist; never serialize on research. Split
  research 3–4 questions per agent. Engineers verify empirically.
- Custom agent types appear a few minutes after creation; fall back to
  `general-purpose` + "read .claude/agents/<role>.md first" if "not found".
- Hooks must guard their scope: format.sh now skips files outside the repo
  (Biome panics on them).
- Architect briefs need a time box; it waited on its own spike.
- Biome rejects `import { Set }` / `{ Array }` (noShadowRestrictedNames):
  entity is `WorkoutSet`, imports are `Array as Arr`.
- `.claude/**` is excluded from Biome; workflow scripts are plain JS.
- Auto mode still prompts for network/download/out-of-tree writes unless
  allow-listed; settings.json now has 93 allow rules.
- Research-note code snippets are leads, not truth: two engineers found gaps
  in the spike's GritQL and Effect snippets. Compile before teaching.

## Metrics so far (step 1)
~17 dispatches · 1 failed round (agent types) · 0 review rounds yet ·
≈2.3M subagent tokens · wall-clock ≈ 2h10m from kickoff · gate green.

## Company mode (started 2026-10-20 22:08, owner request)
Three streams run concurrently: db (Lead-run, step 2), worker team (step 3,
docs/tasks/step-3/team-worker.md), mobile team (step 6,
docs/tasks/step-6/team-mobile.md). Integration task after all three: wire
worker handlers to @tanren/db repositories, point the app at the local worker,
full gate, cross-team review. Risk accepted: ~7 concurrent agents may hit the
session rate limit; all are resumable within the session.

## Plugins to install (owner action; see docs/research/2026-10-20-plugins-and-skills.md)
`claude plugin install cloudflare@claude-plugins-official --scope project` (lock its API MCP to read-only or `ask`), `claude plugin install session-report@claude-plugins-official --scope project`; installed by owner: `cloudflare`, `expo`, `mcp-server-dev`. Owner to install once: `npm i -g agent-browser && agent-browser install` (ui-check skill). Playwright dropped (not needed; web checks by hand / built-in browser).
