---
name: em-batch-watchlist-2026-10-27c
description: EM batch 9 (2026-10-27 afternoon) items 51–55 — spec gaps that became serial UI fix rounds, untrusted-fetch recipe vs numbers, in-path leftovers pushed to integration, shared barrel commit waits, Lead phantom Log lines
metadata:
  type: project
---

Items 51–55 (watch for recurrence; each already has a rule edit):
51. UI design specs that name a role without a level/hit box turn into 3–5 serial fix rounds (LEGAL-1: frame, title dup, h1s, inline anchors, overlap). Check: does the architect's screen checklist (architect.md) get used on the next page design? Metric: rounds per page-type task.
52. Security designs that carry numbers ("5 s, 5 KiB") without the recipe produce one review round per number (REV-W2). Check the auth checklist line is cited in the next OAuth/webhook design.
53. Team reports listing in-path leftovers under Integration notes → a needless Lead dispatch (INT-STLS). Metric: integration agents whose items were all inside one team's paths.
54. Shared barrels (`packages/*/src/index.ts`) appended by two live streams block the Lead's commit; rule 15 says export line last. Metric: commit waits attributed to barrels.
55. Lead wrote a "dispatched" Log line before the Agent ack (phantom). Proposed P1: Log only after the ack with the agent id.

**Why:** owner measures wall-clock; batch 9's legal stream ran 30 min wall for a 20-min task purely on spec gaps.
**How to apply:** in the next EM batch, count rounds caused by spec gaps vs code defects separately; if spec-gap rounds > 1 per stream, escalate to a mandatory checklist pass in the design review (reviewer reads the design against architect.md checklists before code).
