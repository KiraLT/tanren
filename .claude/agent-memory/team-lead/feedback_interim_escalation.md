---
name: interim-escalation-via-sendmessage
description: How a team-lead sends interim escalations to the Lead without ending its run (SendMessage to "main", not SubagentHandback)
metadata:
  type: feedback
---

Send interim escalations (≤ 5 lines) with `SendMessage` `to: "main"`; it queues for the Lead's next turn and the team-lead keeps running. `SubagentHandback` ends the run, so use it only for the final team report.

**Why:** step 5 (mcp-oauth, 2026-10-21): three interims sent this way were answered by the Lead within minutes (grants for a foreign file, a D1-limit decision) while engineers stayed in flight.

**How to apply:** any escalation, cross-team file-overlap notice or decision request mid-run → `SendMessage main`; wait for children with a Bash until-loop on `tasks/<id>.output` (count `"name":"SubagentHandback"`), never an idle turn end.
