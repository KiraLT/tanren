---
name: plan-step
description: Lead-only. Decompose build-order step N from docs/plan.md into an ordered task sheet (docs/tasks/step-N.md) via the architect, with ADRs for open decisions. Use when the owner asks to start, plan or re-plan a build step.
argument-hint: <step-number>
---

# /plan-step $ARGUMENTS

Current handoff:
!`sed -n '1,60p' docs/handoff.md 2>/dev/null || echo "(no handoff yet)"`

Existing task sheets:
!`ls docs/tasks 2>/dev/null || echo "(none)"`

## Steps

1. Read step $ARGUMENTS in `docs/plan.md`, the package `CLAUDE.md` files it
   touches, and any `docs/research/` notes that apply. Versions and API
   names are not spike material (engineers verify them against `.d.ts` +
   context7). Only when a step hinges on one runtime question ("does X work
   on Y") spawn a `spike` (model `opus`, ≤ 10 min) in parallel with the
   architect.
2. Spawn the `architect` (model `fable`) with: the step text, the package
   `CLAUDE.md` files in scope, the research notes, and every decision the
   owner has already made. Ask for ADRs, design notes where a contract spans
   packages, and the task breakdown in the architect's format.
3. Write `docs/tasks/step-$ARGUMENTS.md` from the breakdown using the
   template below. Mark parallel groups. Each task gets a model.
4. Report to the owner: the tasks, which run in parallel, and the decisions
   that need confirmation (proposed ADRs).

## Task sheet template

```
# Step N — <title>
Source: docs/plan.md step N · Status: planning | building | review | done · Updated: YYYY-MM-DD

## Decisions
- ADR-NNNN <title> — accepted | proposed (owner)

## Tasks
| id | title | role / model | depends on | files | status |
| --- | --- | --- | --- | --- | --- |
| SN-T1 | … | engineer / opus | — | … | todo |

## Done-criteria
### SN-T1 <title>
- [ ] …

## Log
- YYYY-MM-DD · created from architect breakdown
```
