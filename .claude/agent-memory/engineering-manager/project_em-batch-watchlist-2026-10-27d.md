---
name: em-batch-watchlist-2026-10-27d
description: EM batch 10 watchlist items 56–60 — paraphrased review briefs, choke-point scopes, registry-growth grants, HOLD→GO dispatch, reused engineer agents
metadata:
  type: project
---

Items 56–60 (batch 10, 2026-10-27 13:43–14:06). Check for recurrence next batch.

56. **Paraphrased review briefs.** The Lead rewrote the engineer's report as "Engineer's claims" and dropped the Verification section; the reviewer (who may not start servers) blocked on missing evidence the engineer had. Fixed reviewer.md (`evidence not forwarded`); P1 asks the playbook to paste Verification verbatim. Watch: any REQUEST CHANGES whose finding 1 is "no evidence".
57. **Choke-point guard briefs.** F3/F4 "In" lists named candidate files; the wiring file (`app.ts`, `McpRoute.ts`) was always needed. Measure: scope-deviation lines on guard/middleware tasks. P2 pending in the playbook Scope template.
58. **Registry growth grants.** TL asked a grant for 10 one-line fills outside the charter. team-lead.md now says no grant needed (`registry:` lines). Watch the next TL interim for grant asks of one-liners.
59. **HOLD→GO dispatch works.** TL prep (7 min incl. 3 briefs) overlapped a commit wait; saved ≈ 4 min. Measured: first child 2.7–3 min after GO. P4 pending. Watch: TLs idle after GO > 3 min means the hold was not used for prep.
60. **Reusing one engineer agent across 2a → 2b → r2** (LEGAL-2, 134 turns, 24.3 active / 28.5 span) cost no handoff and the 4-min gap was the 2a review. Good pattern; watch for context bloat (cache_read 28M tokens on this agent — the heaviest of the batch).

**Why:** owner measures wall-clock per step; batch 10's only extra round came from a Lead brief, not from code.
**How to apply:** at the next batch, grep incidents.md and the transcripts for these five signatures before anything else.
