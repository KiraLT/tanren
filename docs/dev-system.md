# Tanren development system

How this repository is built. Tanren is an **AI-first repo**: the code is
written by Claude Code agents working as a small professional team. This
document is the team's operating manual. It is implemented by the files
under `.claude/` and the `CLAUDE.md` files; if they disagree, fix them to
match this document (or change this document deliberately, via ADR).

## 1. Principles

1. **The repo is the team's memory.** Everything an agent needs is in the
   repo: `CLAUDE.md` (always loaded), per-package `CLAUDE.md` (loaded when
   working in that package), `.claude/rules/` (loaded for matching files),
   `.claude/skills/` (loaded on demand), `docs/` (plan, decisions, tasks,
   handoffs). Nothing important lives only in a chat transcript.
2. **The Lead coordinates; engineers execute.** The main Claude Code session
   is the Lead. It never edits source or tooling files and never researches.
   It reads, plans, writes briefs, dispatches agents (several at once),
   checks their reports, decides, and keeps the docs current. Agents do the
   typing and the reading of sources.
3. **Small briefs, explicit done-criteria.** One engineer per task, one task
   per brief. Parallel work only when the file sets do not overlap.
4. **Every change passes the gate.** `pnpm check` runs format, lint,
   functional rules, typecheck and tests. Hooks format files as they are
   written so agents never argue with the formatter.
5. **Verify, don't trust.** Engineer reports include the commands they ran
   and the output. A reviewer re-reads the diff. QA re-runs the gate. The
   Lead reports outcomes to the owner faithfully, failures included.
6. **Decisions are written down.** Anything architectural goes in an ADR.
   The plan (`docs/plan.md`) is the constitution; deviations from it need the
   owner's confirmation.
7. **Context is a budget.** Agents receive briefs, not transcripts. Long
   knowledge goes in skills, not in `CLAUDE.md`. Sessions end with a handoff
   note so the next session starts warm.

## 2. Roles

| Role | Runs as | Default model | May write | Spawned when |
| --- | --- | --- | --- | --- |
| **Lead** | main session | the session's model (Fable 5.1) | `docs/tasks/`, `docs/handoff.md`, `CLAUDE.md` files, `.claude/` | the owner starts a session |
| **Architect** | `.claude/agents/architect.md` | Fable 5.1, high effort | `docs/adr/`, `docs/design/` | a build step starts, or a cross-package contract is needed |
| **Spike** | `.claude/agents/spike.md` | Opus 5.5 | `docs/research/` | one hard question needs an experiment, not a lookup |
| **Engineer** | `.claude/agents/engineer.md` | Opus 5.5, high effort | `apps/`, `packages/`, root tooling, tests | a brief is ready |
| **Reviewer** | `.claude/agents/reviewer.md` | Opus 5.5, high effort | nothing (reports only) | an engineer reports done |
| **QA** | `.claude/agents/qa.md` | Sonnet 5.5 | tests only | review findings are resolved |
| **Team lead** | `.claude/agents/team-lead.md` | Opus 5.5 | its team sheet | company mode (§11): one per feature team |
| **Engineering Manager** | `.claude/agents/engineering-manager.md` | Fable 5.1 (high effort; max for the step retro) | `CLAUDE.md`, `.claude/skills`, `.claude/rules`, `.claude/agents`, pending briefs, `docs/retro/` | after every accepted report (background) and at step end (§12) |

The Lead is not an agent file: it is whatever model runs the main session,
instructed by the root `CLAUDE.md` and the `lead-playbook` skill. Agent roles
are process roles. Domain knowledge (Effect idioms, Cloudflare, Expo) lives in
skills that any role loads when the task needs it.

### Model selection

The right model is part of the brief. Defaults live in the agent files; the
Lead overrides per dispatch with the Agent tool's `model` parameter.

| Work | Model | Why |
| --- | --- | --- |
| Architecture, cross-package contracts, Effect type design, sync semantics | **Fable 5.1** | hardest reasoning; mistakes here are expensive to unwind |
| Implementing a brief in Effect/TypeScript, code review | **Opus 5.5** | strong, careful coding at lower cost than Fable |
| Hard engineering briefs (HttpApi wiring, sync algorithm, Schema transformations), re-review of a contested finding | **Fable 5.1** (override) | escalate when the brief says "escalated" or an Opus engineer reports being stuck |
| Engineering Manager: judging the system from each task's evidence, rewriting rules and skills | **Fable 5.1** | the owner's priority; its edits shape every later agent, so mistakes compound |
| Running the gate, writing straightforward tests, config boilerplate, mechanical multi-file edits | **Sonnet 5.5** | fast and reliable on well-specified work |
| Spikes: one question settled by a throwaway experiment | **Opus 5.5** | designing a decisive experiment is engineering judgement |
| One-line fact checks, listing files, formatting output | **Haiku 5.5** | only for trivially specified work |

Rules: never send a Fable-grade problem to Sonnet to save tokens; never send
boilerplate to Fable. When a cheaper model fails a brief once, re-dispatch
the same brief one tier up rather than iterating at the same tier.

## 3. Workflow for one build step

```
owner: "do step N"
  │
  ▼
Lead reads docs/plan.md step N, docs/handoff.md, docs/tasks/
  │
  ├─► Spike (only for a question an experiment must settle; runs alongside, never ahead)
  ├─► Architect (15-min box, ≤ 300 lines, briefs ready to paste) ──► docs/adr/*, docs/tasks/step-N-briefs.md
  │
  ▼
Lead writes docs/tasks/step-N.md (checklist, owner, status) and one brief per task
  │
  ▼  for each task, in parallel where file sets are disjoint
Engineer(s) implement ──► report (files, decisions, verification output)
  │
  ▼
Reviewer reviews the diff against the brief + hard rules ──► findings
  │
  ├─ blocking findings ──► same Engineer fixes (SendMessage, keeps context) ──► re-review
  ▼
QA (only for steps touching ≥ 2 packages or diffs > ~800 lines; otherwise the reviewer runs the gate)
  │
  ▼
Lead updates docs/tasks/step-N.md, writes docs/handoff.md, reports to owner
(commit/push only when the owner asks)
```

Slash commands drive it: `/plan-step N`, `/build-step N`, `/review`,
`/gate`, `/adr <title>`, `/em-review <task|step N>`, `/retro N`, `/ui-check`,
`/handoff`. See `.claude/skills/`. Large steps
scale out to several teams; see §11.

## 4. Artifacts and their templates

- **Brief** (Lead → Engineer). Goal · Context to read · Scope in / out ·
  Constraints · Interfaces · Done when (commands that must pass) · Report
  format. Template in `.claude/skills/lead-playbook/SKILL.md`.
- **Report** (Engineer → Lead). Summary · Files changed · Decisions made and
  why · Verification (exact commands and output) · Open questions ·
  Suggested next brief. Template in `.claude/agents/engineer.md`.
- **Review** (Reviewer → Lead). Findings with `file:line`, severity
  (`blocking` / `should` / `nit`), rule violated, suggested fix. Empty list is
  a valid result.
- **ADR** (`docs/adr/NNNN-slug.md`). Context · Decision · Consequences ·
  Status (`proposed` / `accepted` / `superseded`). Decisions the owner has
  not confirmed are `proposed`.
- **Task sheet** (`docs/tasks/step-N.md`). One checklist per build step with
  task id, owner role, status, and the brief's done-criteria.
- **Handoff** (`docs/handoff.md`). Where we are, what is verified, what is
  next, open decisions for the owner. Rewritten at the end of every session.
- **Research note** (`docs/research/YYYY-MM-DD-topic.md`). Facts with
  sources and the date they were checked.

## 5. Quality gate

`pnpm check` is the single gate and must pass before a task is reported done.
It runs, in order:

1. `biome ci .` — formatting, lint, and the functional rules (no `let`, no
   mutation, no `class` outside adapters, no `throw`). Biome is the only
   linter; built-in rules cover part of this and Biome GritQL plugins cover
   the rest (ADR-0002). No ESLint.
2. typecheck across the workspace (TypeScript, see ADR-0003)
3. `vitest run` across the workspace

Hooks (`.claude/settings.json`):

- `PostToolUse` on `Edit|Write`: `biome check --write` on the touched file.
- The "Lead writes no code" rule is a convention in `CLAUDE.md`, not a hook
  (a guard hook was tried and removed as overkill).

## 6. Context design

| Layer | File | Loaded | Budget |
| --- | --- | --- | --- |
| Project brief + hard rules + team model | `CLAUDE.md` | always, every role | ≤ 150 lines |
| Package context | `apps/*/CLAUDE.md`, `packages/*/CLAUDE.md` | when working in the package | ≤ 80 lines **and ≤ 12k chars** (`wc -c`; lines are not a budget when they run to 300 chars). A team-lead whose Docs step would push a file over moves the contract into its design doc and leaves a one-line pointer; per-file export lists never go in — `ls src/*` and module headers give them (/doctor 2026-10-27: worker 22k → 12k, mobile 56k). |
| Code-kind rules | `.claude/rules/*.md` with `paths:` | when matching files are touched | ≤ 60 lines each |
| Process know-how | `.claude/skills/lead-playbook`, `/plan-step`, … | Lead, on demand | — |
| Domain know-how | `.claude/skills/effect-conventions`, `monorepo`, `cloudflare-workers`, `expo-mobile` | engineers, on demand or preloaded | long form OK, with `references/` |
| State | `docs/tasks/`, `docs/handoff.md` | Lead at session start | — |

## 7. Parallelism rules

- Run Spike and Architect in parallel when both are needed.
- Run multiple Engineers in parallel only when their briefs name disjoint
  file sets; the Lead owns root `package.json` merges, through an Engineer.
- Reviewer runs after all parallel engineers of a task group report done.
- Use `SendMessage` to continue an agent that already has the context
  (fix loops). Start a fresh agent for a new task.
- Optional: the review stage may fan out as a `Workflow`
  (`.claude/workflows/`) when the diff is large: one reviewer per dimension
  (hard rules, Effect idioms, correctness, tests), then a verifier per
  finding.

## 8. Escalation

The plan says: ask before architectural decisions it does not cover. When
the owner is present, ask. When the session is autonomous, the Lead
decides, records the decision as a `proposed` ADR, and lists it under
"Decisions for the owner" in the handoff and in the final message.

## 9. Session lifecycle

**Start:** Lead reads `CLAUDE.md` (automatic), then `docs/handoff.md`,
`docs/tasks/`, and `git status`. **During:** the workflow above. **End:**
`/handoff` rewrites `docs/handoff.md`; the Lead's final message to the
owner states what is verified, what is not, and the decisions waiting.

## 10. Evolving this system

The system is itself under version control. Change it like code: an ADR
for a change of roles or gate, a normal edit for wording. After every build
step the Lead asks: what did an agent not know that it should have? Put the
answer in the right layer (rule, skill, package `CLAUDE.md`), not in a chat.

## 11. Scaling: from one team to a company

Section 3 is **solo mode**: one team, one pipeline. When a build step is
large, the Lead switches to **company mode**: it acts as the program lead,
splits the step by feature into teams, and each team is run by a
`team-lead` agent with its own engineers, reviewer and QA. Teams run
concurrently; the Lead spends its context on charters and integration, not
on reading every diff.

### When to split

Split when the architect's breakdown shows two or more independent feature
areas with disjoint file sets, or more than about four engineer tasks, or
work in two packages whose contract can be fixed up front. Do **not** split
when tasks are sequentially dependent or the contract between them is still
unknown: design the contract first, then split.

Examples from the plan: step 3 → teams *api* (HttpApi endpoints), *auth*
(Better Auth), *sync* (push/pull); steps 6–7 → *today-screen*, *local-store
+ sync-client*, *plan-screen + web layout*.

### Shape

```
Lead (program lead)
  │
  ├─► Architect: contracts, team charters, integration plan
  │
  ├─► Foundation (one engineer, serial): contracts in packages/shared,
  │     dependencies installed, stubs so every team compiles on its own
  │
  ├─► team-lead A ─► engineers ∥ ─► reviewer ─► qa ─► team report   (owns paths A)
  ├─► team-lead B ─► engineers ∥ ─► reviewer ─► qa ─► team report   (owns paths B)
  └─► team-lead C ─► …                                            (owns paths C)
  │
  └─► Integration (one engineer): wire the teams' outputs, full gate
        ─► cross-team reviewer ─► qa ─► Lead bookkeeping + handoff
```

### Team charter (Lead → team-lead)

Name · Mission (one paragraph) · Owned paths (exclusive) · Read-only paths ·
Contracts (exact signatures and schemas the team consumes and provides;
frozen during the fan-out) · Runtime proof (worker: `wrangler dev` + `curl`;
mobile/web: the core flow driven once via the `ui-check` skill, or the
report states "UI not driven by any agent") · Assumes (cross-team: user id /
auth source, headers, ports, seeds — the Lead reconciles these across
charters before fan-out) · Docs (team-lead writes the package `CLAUDE.md`;
Lead ratifies) · Tasks from the architect, each with a model · Done when ·
Budget (max engineers in parallel, max review rounds) · Report format.
Template in `.claude/skills/lead-playbook/SKILL.md` ("Charter template").

### Rules that make parallel teams safe

1. **Foundation first.** Nothing fans out until the contracts compile and
   `pnpm install` has run. After fan-out no team adds dependencies or edits
   root config; it requests that from the Lead.
2. **Exclusive ownership.** A team edits only its owned paths. A need in
   another team's paths becomes a message to the Lead, who adjusts a charter
   or queues it for integration.
3. **Frozen contracts.** Changing a contract during the fan-out means
   stopping the affected teams; the architect decides, charters are updated,
   teams resume.
4. **Per-team gate.** Before reporting, a team passes its package's lint and
   tests (`pnpm -F <pkg> …`) and the workspace typecheck, and proves the
   code runs in its target runtime (worker: workerd via `wrangler dev` +
   `curl`, or a vitest-plugin project; mobile/web: the charter's core flow
   driven once through the `ui-check` skill, else the report says "UI not
   driven by any agent"). Node tests of a Worker are not a gate: step 3's
   worker passed 45 Node tests while every route returned 500 under workerd
   (a better-auth re-export broke in wrangler's bundle). Step 6's mobile
   team shipped 51 green tests and nobody had opened the app.
5. **One report shape.** Every team returns the same report so the Lead can
   integrate mechanically.

### Mechanisms, in order of preference

- **`team-lead` agents** that spawn their own engineers, reviewer and QA
  through the Agent tool (nested subagents; Claude Code allows three
  layers below the main session and 20 concurrent subagents by default,
  raised via `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). The Lead spawns all
  team leads in one message so the teams run at the same time. Custom agent
  types register at session start; in the session that creates one, the
  Lead spawns `general-purpose` with "read the role file first".
- **Workflow scripts** (`.claude/workflows/*.js`) when the fan-out is
  regular. Deterministic, resumable, visible in `/workflows`. Two ship with
  the repo: `review-fanout` (five read-only reviewers, one per dimension,
  then independent skeptics try to refute each finding; blocking findings
  need a majority to survive) and `team-build` (foundation engineer →
  parallel `team-lead`s → integration engineer → cross-team review → QA).
  The Lead invokes them with the Workflow tool by name and passes charters
  and briefs as `args`. Only the main session can run workflows; subagents
  cannot, so a team lead orchestrates with nested agents, not workflows.
  `team-build` has never run and is not used (step-2 retro): it barriers on
  all team reports and serialises integration; direct team-leads until it is
  revised. Background dispatch is proven by the ack text ("Async agent
  launched"), not by the flag: a string `"true"` runs in the foreground
  (v2-night retro). Unattended runs need the Lead's mtime watchdog and the
  ask list switched to deny by the owner.
- **Git worktrees** (`isolation: "worktree"`) when teams must touch
  overlapping paths. This needs commits on feature branches, so the Lead
  asks the owner once for standing permission to commit on `wip/*` branches.

### Models in company mode

Team leads run on Opus 5.5 (Fable 5.1 for the team that owns the hardest
contract). Engineers, reviewers and QA keep the defaults from section 2.
The Lead itself does not read team diffs; it reads team reports and the
integration review.

### Cost

Company mode multiplies tokens roughly by the number of teams. Use it when
wall-clock time matters and the work is genuinely parallel; use solo mode
for sequential work. Charters point to files instead of pasting them.

## 11b. Plugins

Installed plugins extend, never replace, the roles in `.claude/agents/`.
superpowers (v7) supplies working-method skills (TDD, systematic debugging,
verification before completion, parallel dispatch); our agent files tell each
role which to use. context7 supplies verified library docs to spikes and
engineers. frontend-design guides the mobile UI. Vendor plugins (Cloudflare,
Expo, MCP server dev) carry the generic platform knowledge; our domain skills
keep only Tanren-specific, verified deltas (Effect D1 layer, workerd tests,
McpAgent boundary, sqlite sync, hooks boundary) and win on conflict. Plugin
instructions that conflict with `CLAUDE.md` or this document are ignored; the
retro decides whether to adopt them. Any MCP that can change cloud state must
run read-only or under `permissions.ask`, or it bypasses our wrangler rules.

## 12. Continuous improvement (Kaizen)

The process is a product too, and the owner's standing instruction is Kaizen:
many small improvements, continuously, from evidence, by every role. Nobody
waits for a retro to fix a brief, a rule or a skill that just caused friction.
The loop runs every step:

```
observe ──► retro ──► change ──► measure
 incidents    engineering-manager    Lead edits CLAUDE.md /    next step's
 + metrics    reads evidence,     .claude/* (ADR if roles   metrics show
 logged by    proposes exact      or the gate change)       whether it
 the Lead     edits                                          worked
```

- **Observe.** The Lead logs friction to `docs/retro/incidents.md` the
  moment it happens, and dispatch metrics (duration, tokens, tool uses,
  rounds, outcome) to the task sheet Log. Agents with `memory: project`
  keep their own lessons in `.claude/agent-memory/<role>/`.
- **Continuous.** After every accepted report the Lead spawns the
  `engineering-manager` in the background (`/em-review <task>`). It reviews
  the work against its brief, asks what the agent lacked or misread, and
  edits the system directly (skills, rules, agent files, pending briefs,
  package `CLAUDE.md`s), logging each change in `docs/retro/em-log.md`. It
  never sits on the critical path and never edits code or designs.
- **Retro.** `/retro N` runs the same agent in retrospective mode: a separate agent, on
  purpose. Fresh context finds waste the Lead has rationalised, it costs
  less than the Lead's context, and the Lead stays on the build. It
  reconstructs the timeline, computes the critical-path ratio, finds rework
  and brief defects, and proposes exact edits.
- **Change.** The Lead accepts, adapts or rejects each proposal, applies the
  accepted ones to the system files, and records one experiment with a
  measurable target for the next step.
- **Measure.** The next retro checks the target.
- **Evidence first, literature second.** The team evolves from its own
  incidents. Only a waste that survives two consecutive retros triggers a
  spike on external multi-agent development practice
  (`docs/research/process-*.md`).

Metrics tracked per step: wall-clock, total agent time, total tokens, tasks,
review rounds, gate failures, incidents, critical-path ratio (critical path
÷ wall-clock; 1.0 means nothing waited needlessly).

## 13. Production operations (owner lift of 2026-10-26)

The plan's "agents never deploy" held until production existed. On 2026-10-26 the owner lifted it
for the **Lead only** ("I gave you full access to cloudflare project" / "you can do deploy.md
instructions yourself"): the Lead runs `docs/design/deploy.md` with the Cloudflare MCP `execute`
tool and wrangler while the owner is present to approve the `permissions.ask` prompts. Engineer,
QA, reviewer and team-lead roles keep denying the `execute` tool and never run `wrangler
deploy|secret|login`, `d1 … --remote`, DNS changes or `eas`. Facts learned that day live in the
`cloudflare-workers` skill ("Production deploy facts"); the state lives in `docs/handoff.md`.
Secrets the owner pastes into chat are set once and then rotated by the owner.

Hooks note (2026-10-26): hooks registered in `.claude/settings.json` are snapshotted when a session
starts; a hook added mid-session (the EM cadence guard, `.claude/hooks/em-cadence.sh`) fires only from
the next session. Until then the Lead dispatches the EM by the playbook rule (≥ 3 accepted reports or
≥ 4 commits since the last `docs/retro/em-log.md` entry).

### §11 addendum (retro 2026-10-26-v4-evening, Lead)
- Any stream with three or more dependent tasks is a `team-lead` stream; the Lead runs at most a two-task disjoint pair itself. Team-lead children run concurrently only when dispatched in one message (single Agent calls serialise).
- Every designer brief names the reference product(s) the owner judges against (Apple Fitness and Apple Health for health and stat surfaces, Strava for feed and activity cards) and scores per module against them; a text row of `·`-joined stats is a FIX, not a PASS (EM batch 15, P3; the owner rejected the Garmin strip on 2026-10-27 after two designer rounds had passed it).
- Deploys are Lead-run but never foreground during a fan-out (background script; acceptance lag stays ≤ 5 min).
