---
name: em-review
description: Run the Engineering Manager on a finished task (or on "step N" for the end-of-step retrospective) — it reviews the work against its brief and improves CLAUDE.md, skills, rules, agents and pending briefs directly. Use after an engineer or reviewer report is accepted, or when the owner asks how to make the team better.
argument-hint: <task id | step N>
---

# /em-review $ARGUMENTS

When to run it (step-2 retro): after every team report and every integration
task, and after any task with an incident, a second review round, an over-box
run, or the first task in a new package or runtime. Skip a one-round sonnet
task that had none of these; the retro covers it. Two tasks may share one run;
Mode 1 is ≤ 8 min per task. Step 2: 6 runs, 32 agent-min, 46 system edits,
0 min on the critical path — the cost is your turns, not its tokens.

Spawn the `engineering-manager` agent in the background (model `fable`; pass
`effort: max` for "step N") with: the task id, where the brief is
(`docs/tasks/step-N-briefs.md` or the task sheet), the agent's report (paste
the relevant part), the reviewer's findings if any, and the list of files
changed. Do not wait for it; continue dispatching. When it reports, read its
changes (`docs/retro/em-log.md`) and act on its proposals; its handback ends
with `## Proposals for the Lead` as exact old→new text, so applying one is a
paste, done only when every runnable task is running. For "step N", also
feed it the Log section of `docs/tasks/step-N.md` and `docs/retro/incidents.md`.

Role-file edits never reach a running agent: when a Mode 1 run changes
`team-lead.md` or `engineer.md` while a team is live, its handback names the
live team-lead ids and a ≤ 3-line delta for the Lead to forward as one
message (team mcp-oauth started 23:45:24 on the 23:38 team-lead.md; the
hand-back, budget and port rules landed 23:52–23:54 and it never saw them).
