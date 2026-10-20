---
name: build-step
description: Lead-only. Run the full pipeline for build-order step N — plan (if no task sheet), brief and dispatch engineers, review, fix loop, QA, bookkeeping, handoff. Use when the owner says "do step N", "build step N", or "continue step N".
argument-hint: <step-number>
---

# /build-step $ARGUMENTS

Task sheet:
!`cat docs/tasks/step-$ARGUMENTS.md 2>/dev/null || echo "(no task sheet: run /plan-step $ARGUMENTS first)"`

Working tree:
!`git status --short | head -40`

## Pipeline

1. **Plan.** No task sheet → run `/plan-step $ARGUMENTS` first. Load the
   `lead-playbook` skill if it is not loaded.
2. **Mode.** If the task sheet marks the step as company mode (teams
   section present), follow the company-mode procedure in lead-playbook:
   foundation → team-leads in parallel → integration. Otherwise continue in
   solo mode below.
3. **Brief.** For the next group of `todo` tasks whose dependencies are
   `done`, write one brief each (lead-playbook template). Set status
   `in-progress`.
4. **Dispatch.** Spawn one `engineer` per brief, in a single message when the
   file sets are disjoint. Model from the task sheet (`opus` default,
   `fable` for escalated tasks, `sonnet` for boilerplate).
5. **Accept.** Check each report against the acceptance list in
   lead-playbook. Verification missing or red → send it back.
6. **Review.** Spawn the `reviewer` (model `opus`) with the brief(s) and the
   diff scope. Status `in-review`.
7. **Fix loop.** Blocking findings → `SendMessage` to the same engineer:
   "fix only these, re-run the gate, report". Re-review blocking items only.
   Two rounds without convergence → escalate the model or spawn the
   architect to decide.
8. **QA** only if the step touches two or more packages or the diff is over
   ~800 lines: spawn `qa` (model `sonnet`) with the briefs and done-criteria;
   `FAIL` → back to step 7. Otherwise the reviewer runs the gate and QA is
   skipped.
9. **Bookkeeping.** Mark tasks `done` with the date in the Log. Decisions
   engineers made → ADR via `/adr`. Anything an agent lacked → rule, skill
   or package `CLAUDE.md`.
10. Repeat from 3 until every task is `done`, then `/handoff` and report to
    the owner: verified / not verified / decisions for the owner.
