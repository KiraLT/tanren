---
name: em-batch-watchlist-2026-10-27h
description: EM batch 14 (v6 nutrition teams + Garmin CPU chase) — items 75–79: optional-key contract defects, Lead relays vs contracts board, fix-before-measure chases, live-team file hunk staging, designer FIXes from spec gaps
metadata:
  type: project
---

Items 75–79 (2026-10-27, batch 14; metrics from transcripts: nutri-server TL 23.4 active / 45.4 span; N-F0 fix 1.2 min; GM-F1 5.4 → GM-F2 6.0 → spike 4.0).

75. **Optional-key schemas ship required-nullable** (N-F0 `NutritionProfile`): caught only by a downstream MCP tool test → escalation + fix round + REV leftover. Fixed where: architect.md (minimal input in contract block), rules/tests.md (minimal-input decode test). Watch: zero contract-defect escalations next team step.
76. **Lead relays of cross-team symbols**: 5 relays in 34 min (freeze, impl landed, fix landed, release gates). Fixed where: architect.md + team-lead.md contracts board file (`docs/tasks/<step>/contracts.md`, TLs append + poll mtime). Watch: Lead relays → 0; if TLs don't poll, the fix failed.
77. **Fix-before-measure chases**: GM-F2 (runtime diet) dispatched on a 28 ms number with unknown cause; spike GM-F3a then showed cold JIT, not layer build. P-item to playbook (spike ≤ 5 min first when the cause is unknown). Watch whether the Lead applied it.
78. **Live-team file leaked twice** (Garmin→N-F0 common.ts; SEC-1b→nutri-server oauth.workerd.test.ts) despite playbook (8) mtime rule: mtime is not the right predicate — a file inside a live team's owned paths is hunk-staged against the engineer's reported hunks or deferred. P-item text proposed in batch 14. Watch for a third.
79. **Designer FIX rounds from spec gaps**: N21 (5-way SegmentedControl clipped in a Card), N23 (desktop side column unspecified). Fixed where: architect.md screen checklist (control capacity, desktop content). Also TS1261 pure-sibling naming came from the brief's names (sheet rule + expo-mobile bullet).

**Why:** same root pattern as items 70–74: contracts stated as prose, not as decodable examples/signatures; coordination routed through the Lead.
**How to apply:** at the next team step, grep the sheet for a contracts board and minimal-input examples before judging TL waste.
