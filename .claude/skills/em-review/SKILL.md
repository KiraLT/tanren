---
name: em-review
description: Run the Engineering Manager on a finished task (or on "step N" for the end-of-step retrospective) — it reviews the work against its brief and improves CLAUDE.md, skills, rules, agents and pending briefs directly. Use after an engineer or reviewer report is accepted, or when the owner asks how to make the team better.
argument-hint: <task id | step N>
---

# /em-review $ARGUMENTS

Spawn the `engineering-manager` agent in the background (model `fable`; pass
`effort: max` for "step N") with: the task id, where the brief is
(`docs/tasks/step-N-briefs.md` or the task sheet), the agent's report (paste
the relevant part), the reviewer's findings if any, and the list of files
changed. Do not wait for it; continue dispatching. When it reports, read its
changes (`docs/retro/em-log.md`) and act on its proposals. For "step N", also
feed it the Log section of `docs/tasks/step-N.md` and `docs/retro/incidents.md`.
