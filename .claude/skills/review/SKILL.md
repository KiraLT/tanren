---
name: review
description: Lead-only. Dispatch the reviewer on the current diff (or given paths / task id) against its brief, then route blocking findings back to the engineer. Use when the owner asks for a review or after an engineer reports done.
argument-hint: [paths or task id]
---

# /review $ARGUMENTS

Diff scope:
!`git status --short | head -60`
!`git diff --stat | tail -20`

1. Find the brief for this change (task sheet in `docs/tasks/`, or the
   owner's words). If `$ARGUMENTS` names a task id, use that task's
   done-criteria.
2. Spawn the `reviewer` (model `opus`) with: the brief, the done-criteria,
   and the scope (paths, or "all uncommitted changes").
3. Relay findings to the owner ranked by severity, unedited. Blocking
   findings go to the engineer who wrote the code (`SendMessage`) or, if
   that agent is gone, to a fresh `engineer` with the findings as the brief.
4. Record `should` findings as follow-ups in the task sheet.
