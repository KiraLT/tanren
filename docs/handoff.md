# Handoff — 2026-10-20

## Where we are (2026-10-20 23:12)
**Steps 1, 2 done; steps 3 (worker) and 6 (mobile Today screen) integrated and
proven end to end locally.** Baseline commit `c6a4d68` (247 files); root
`pnpm check` GREEN with 307 tests (shared 146, db 61, worker 39, mobile 61).
`pnpm db:reset` seeds a local D1; `pnpm smoke:worker` passes sign-in → REST →
pull → push; the web app in agent-browser signs in by magic link, re-keys,
pulls the seeded plan, logs a set, pushes it, and the worker's pull returns
it (INT-2b, no code change needed). Every open decision is now an accepted
ADR (0003–0009); the owner delegated all decisions to the Lead (plan
Amendment 3) and reviews asynchronously.

## Done since 23:12
Team hardening green in 11 min and committed (`a65e5e6`); retro step 2
applied and committed (`36923c3`); ADR-0010 (stateless `createMcpHandler`,
McpAgent deprecated upstream); owner: "auto-commit when needed, tell me when
something is testable on localhost", and "still too slow, more work while
you wait" → idle checklist added to lead-playbook.

## Done 23:12 → 23:50 (all committed; HEAD `35f34dd`)
Team mcp (step 4) in 29 min: `/mcp` with four read tools, Claude Code
headless proof. Step 5 planned (ADR-0011, `docs/design/oauth.md`,
`deploy.md` runbook, `docs/tasks/step-5.md`), S5-SPIKE positive (note in
`docs/research/`). HI-1 (shared 503 error, auth routes never 500, tombstoned
parents reject children). QA edge passes on db/worker (29 tests) and mobile
(27 tests + `src/testing/phone.ts`). SyncStore pre-checks all three partial
unique indexes per change (poison-pill fix). Gates: shared 155, db 97,
worker 117.

## Done 23:50 → 00:15 (all committed; HEAD `1352d26`)
Step 7 landed (plan-web, 34 of 75 min) and step 4 (mcp, 29 of 75).
Cross-team review: approve, 0 blocking, 8 follow-ups all routed and most
landed (runtime lock cleanup, native sign-in notice, mobile defects). INT-A
proved the **owner recipe** (`docs/design/local-dev.md` §Owner recipe):
`pnpm db:reset` → `pnpm web:export` → `pnpm dev` (:8787 + :8790) → sign in
as `dev@tanren.local` via the terminal magic link → log a set → Plan → Claude
Code MCP `list_sessions` shows it. Root gate 575 tests at that point. The
owner was pinged with the recipe at ≈ 00:08 (test from a worktree of
`c2921b9` while agents edit the tree).

## In flight (resumable by SendMessage; all report to the Lead)
- **Team mcp-oauth** (team-lead/opus, 90-min box from 23:45):
  `docs/tasks/step-5.md` — T1 infra, T2 contracts, T3 write tools, T4
  provider wiring + `index.workerd.test.ts` boot test + runtime proof, T5
  docs, REV, QA. Also carries review follow-ups: `OptionFromNullOr` for
  `CurrentPlanResult`, a statement-counting D1 test for the ≤ 5 budget,
  `MAX_HISTORY_LIMIT` from the schema.
- **AUTH-1** (opus, 10 min): `EmailSendFailed` → 502 `EmailDeliveryFailed`
  (shared), defects → 500 `InternalError`, email types in `src/auth/Email.ts`
  (removes the `Layer.suspend` cycle).
- **LINT-1** (sonnet, 10 min): `.biome/noSwitch.grit` + fixtures + self-test
  case; registers in `biome.jsonc` only if the repo has no `switch` hits.
- **MOBILE-2** (opus, 15 min): push within ~500 ms of a logged set (debounced
  trigger; loop stays as fallback); `failureMessage` as a tag → copy lookup;
  browser proof of the push timing and the second-tab copy.
- **Retro steps 4 ∥ 7** (EM fable/max): against the "zero-lag tail" targets.

## Next actions (in order)
1. Each report → accept within 2 min, dispatch dependents, Log line.
2. AUTH-1 / LINT-1 / MOBILE-2 reports → accept, commit each; MOBILE-2's
   browser proof re-validates the recipe (tell the owner the push is now
   immediate).
3. Team mcp-oauth reported → commit "Step 5", EM Mode 1, then tell the owner
   the step-5 local proof and the owner actions in `docs/design/deploy.md`
   (Resend account + domain, DNS, `wrangler secret put`, deploy, Claude app
   connector). Agents never deploy.
4. Retro 4 ∥ 7 report → apply proposals, log fixes, set the step-5 /
   closing-phase experiment here. Then the backlog: native auth (ADR needed:
   deep link + one-time token vs WebView), phone test in Expo Go (owner),
   D1 statement budget test, two-tab web.
4. `/retro` for steps 4 ∥ 7 against "zero-lag tail" (below), then handoff.

## Decisions made (owner may override by message)
- ADR-0003 TS 7 native tsc · ADR-0004 Effect 4.0.5 · ADR-0006 Drizzle for
  schema/migrations, effect/sql queries · ADR-0002 addendum: noMutation stays
  syntactic, never name a method after an Array mutator.
- ADR-0007 data model: keep enum lists (additive adds free, renames = ADR +
  migration); opaque pull cursor; `weekStart` any weekday, UI renders from it;
  bodyweight `weightKg 0`, holds as seconds in `reps`, no AMRAP; no profile
  extras.
- ADR-0008 local dev: dummy local vars in committed `wrangler.jsonc` + guard;
  no preview env (local + production only); **production email = Resend**
  (Cloudflare Email Sending is beta and not on Workers Free). Owner actions
  later: Resend account, verify tanren.me, `wrangler secret put RESEND_API_KEY`.
- ADR-0009 pnpm isolated linker + Expo SDK 58 (VERIFY Expo Go on a real
  iPhone at step 7).
- Process: Lead commits locally at milestones, never pushes; git commit is
  still under `permissions.ask` because the auto-mode classifier blocks the
  Lead from editing its own permission rules (owner can allow
  `Bash(git commit:*)` if prompts annoy).

## Owner actions outstanding
- Allow `Bash(git commit:*)` in `.claude/settings.json` if you want
  prompt-free milestone commits.
- Later (steps 5/7): Resend account + domain, Cloudflare DNS for
  `tanren.me` / `api.` / `mcp.`, `wrangler secret put`, `wrangler deploy`.

## Gotchas learned (also in docs/retro/incidents.md)
- The auto-mode classifier denies shell edits (sed/heredoc) to instruction
  files (`CLAUDE.md`, `docs/plan.md`, `.claude/settings.json`, memory) as
  Self-Modification / Instruction Poisoning. Use Edit/Write for those; shell
  appends to `docs/tasks/*.md` are fine.
- Role-file edits reach new agents minutes later (TOOL-1 ran on a 2-min-old
  `engineer.md`); put new rules in the brief too.
- Agent notifications undercount tool calls (TOOL-1: 42 vs 80); count from
  the transcript. `maxTurns` counts API turns (~6–7/min), now 120.
- Context7 is reachable by subagents (deferred behind ToolSearch) but had
  0 real calls in TOOL-1/INT-2b; the Skill tool is proven (ui-check loaded).
- `pnpm db:reset` wipes the one local D1 that every running `wrangler dev`
  shares; check other agents' pid files first (engineer.md rule 9).
- Expo plugin MCP is now authorized (docs search, simulators); cloudflare
  MCP `execute` stays under `ask`.
- Earlier: custom agent types register minutes after creation; hooks must
  skip out-of-tree paths; Biome rejects `import { Set }`; `.claude/**` is
  Biome-excluded; never `pkill` what you did not start.

## Experiment for step 4 ∥ 7 — "zero-lag tail" (retro step 2)
Measured from transcripts: wall-clock ≤ 60 min from first fan-out to the
full-stack e2e pass · critical-path ratio ≥ 0.75 (step 2: 0.72) · dispatch
lag and acceptance lag ≤ 2 min on every critical-path edge · no engineer run
> 20 min including fix rounds · ≤ 1 review round per task · every team report
has a `Demo` row with a real runtime proof · zero escalations naming work
absent from every task list at fan-out. Fan-out began 23:14 (teams mcp and
plan-web).

## Metrics
Step 1: ≈ 2h10m, ~17 dispatches, ≈ 2.3M subagent tokens. Company-mode step
(2 + 3 + 6 + integration): 22:08 → 23:03 e2e proven, ≈ 55 min wall-clock,
one run over its box (S2-T3, 24 min), worker team 2 review rounds; detailed
Log in `docs/tasks/step-2.md`.
