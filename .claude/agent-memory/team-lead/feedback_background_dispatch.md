---
name: background-dispatch-blocks
description: An Agent call can block the team-lead's turn for hours even with run_in_background true; dispatch every ready task in the same message and never leave one long child alone
metadata:
  type: feedback
---

Dispatch every task that is ready to start in the same message as the long one. A single long child must never be the only thing in a turn.

**Why:** v2 illustrations (2026-10-21). The I1 Agent call (opus, `run_in_background: true`) returned control only after about 8.4 h (`duration_ms` 30 354 901). The Lead's budget messages and the 120-min box all passed while my turn was blocked, and no batch was dispatched. The wave of 5 sonnet batches dispatched in one message at 09:21 finished in 4.5–6.4 min each.

**How to apply:** the phase-gating trick ("start dependents when file X appears") only works if your turn is free to poll. If a dependent wave must wait on a long child, split the long task into two dispatches instead (a short API phase, then a separate phase-2 task) so the dependents' dispatch never sits behind one blocking call. See [[interim-escalation-via-sendmessage]].
