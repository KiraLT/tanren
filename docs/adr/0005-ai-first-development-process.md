# ADR-0005: AI-first, multi-agent development process

Date: 2026-10-19 · Status: **accepted** (owner decision at kickoff;
`docs/plan.md` Amendment 1). The operating manual is `docs/dev-system.md`;
this ADR records the decision, the manual holds the detail.

## Context

The owner wants the repository built by Claude Code agents, acting himself as
product owner and reviewer of decisions rather than as the typist. A single
long-running agent session hits context limits, loses track of state, mixes
planning with typing, and reviews its own work. Quality therefore has to come
from structure: separated roles, written briefs, a mechanical gate, review by
an agent that did not write the code, and a repository that carries all the
state between sessions.

## Decision

Tanren is developed by a team of agents coordinated by a Lead, as specified in
`docs/dev-system.md`:

1. **The main session is the Lead.** It plans, briefs, dispatches, checks
   reports and keeps `docs/` current. It never edits code or tooling; a hook
   enforces this. It writes `docs/tasks/`, `docs/handoff.md`, `CLAUDE.md`
   files and `.claude/`.
2. **Roles are agent files** in `.claude/agents/`: architect (design, ADRs,
   task breakdown), researcher (verified facts → `docs/research/`), engineer
   (one brief → code, tests, green gate), reviewer (read-only findings), qa
   (gate plus breakage tests), team-lead (company mode). Each role has a
   default model; the Lead overrides per dispatch using the model matrix in
   `docs/dev-system.md` §2.
3. **The repo is the team's memory.** `docs/plan.md` (constitution), `CLAUDE.md`
   files, `.claude/rules` and skills, `docs/adr`, `docs/design`, `docs/tasks`,
   `docs/research`, `docs/handoff.md`, `docs/retro`. Nothing important lives
   only in a transcript.
4. **One gate.** `pnpm check` (Biome ci incl. functional rules, typecheck,
   tests). Hooks format on write. A task is done only when the report contains
   green gate output.
5. **Small briefs, explicit done-criteria.** One task per brief; parallel
   work only on disjoint file sets; large steps run in company mode (teams
   with frozen contracts, `docs/dev-system.md` §11).
6. **Verify, don't trust.** Reports carry commands and output; a reviewer
   re-reads the diff; QA re-runs the gate; the Lead reports to the owner
   faithfully, failures included.
7. **The process is versioned.** Friction goes to `docs/retro/incidents.md`;
   a retro after each step changes rules, skills or agent files. Changes of
   roles or gate get an ADR; wording changes are normal edits.

## Consequences

- Parallel, specialised work with bounded context per agent; decisions and
  state survive sessions; the owner is involved at decision points, not
  keystrokes.
- Quality rests on independent review and a mechanical gate instead of trust
  in one agent's self-assessment.
- Token cost is a multiple of a single-agent approach (every hand-off
  re-reads context) and each step has pipeline latency (brief → implement →
  review → fix → QA). Accepted for correctness and resumability.
- Hand-offs lose detail, so briefs and role files need upkeep; `.claude/` is a
  first-class, reviewed part of the codebase.
- The setup is specific to Claude Code (agents, skills, hooks, workflows).
  Portability to other tooling is not a goal.

## Alternatives considered

- **One agent, one session; owner reviews diffs.** Simplest, but context
  limits, self-review bias and no persistent memory. Rejected.
- **Owner writes code with AI assistance.** Rejected by the owner (AI-first).
- **Fully autonomous, no owner checkpoints.** Rejected; the plan requires
  asking before architectural decisions it does not cover (ADR-0001 handles
  the autonomous case with `proposed` ADRs).
- **External orchestration frameworks.** Rejected for now; Claude Code's
  agents, skills, hooks and workflows suffice and keep the repo self-contained.
