---
name: em-batch-watchlist-2026-10-27f
description: EM batch 12 (Garmin team, v6 gating incident, v6b/nutrition architects) — items 65–69: registry size/index consumers, commit-as-gate assumption, forbidden-string grep, parallel research+design, delta-pass review shape
metadata:
  type: project
---
Items 65–69 (2026-10-27, EM batch 12):
65. Registry growth defects hide in files NOT in the diff (Cursor.ts one-digit rank regex after SYNC_TABLE_ORDER went 10→12). Diff-scoped reviews (REV-1 0 reads of Cursor.ts; GM-R 3 passes) miss them; QA found it. Fixed: engineer.md 18, reviewer.md consumer check, rules/tests.md, architect.md sheet lists consumers. Watch: does the next registry growth (v6 nutrition tables) fail in its own gate?
66. "Released at the commit" sat in three places (playbook, team-lead.md path release, architect sheets "starts at the hand-off commit"). Fixed team-lead.md + architect.md; playbook template line proposed (P1). Watch for any brief still saying "after the commit".
67. Owner "don't mention X" → architect must grep forbidden strings before reporting (v6b "Lean Body" title). Fixed architect.md.
68. Parallel research architect (opus, 3 min) ∥ design architect (fable, 12 min) worked: design never waited on research. Reuse for any design with an open API/library question.
69. Delta-pass review (GM-R: 3 passes, 8.4 active / 25.5 span, 8.7M in-tok) is fine up to 3 deltas; it costs context re-reads, not critical path. Team final report 78 lines → team-lead.md ≤ 40 rule.
Metrics method reminder: team-lead active time = 25.3 of 63.3 min; the rest were child waits (gaps 10.2/11.8/5.7/7.2/3.0) — report the two separately.
