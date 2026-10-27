---
name: em-batch-watchlist-2026-10-27g
description: EM batch 13 (N-F0, SEC-1a/b, GM-F1, P-D1, four v6 team-leads on HOLD, Garmin commit leak) — items 70–74: one-task synced tables, cross-team port signatures in sheets, HOLD question defaults + GO→child latency, multi-run pagination tests, scripted-rewrite slips on multi-hunk patches
metadata:
  type: project
---
Items 70–74 (2026-10-27, EM batch 13):
70. A synced table split across two tasks/teams (literal in N-F0, Drizzle table + migration in N-S1) leaves the tree red by design for everyone. Fixed architect.md: one task. Watch: any v6b/v7 sheet that puts a literal and its table in different rows.
71. Cross-team ports (FoodEntryRepo for nutri-food, buildDayTotals for N-M1/N-S2) were named in the v6 sheet without signatures; the Lead relayed them mid-run. Fixed architect.md (signatures in Frozen contracts; foundation report `## Exports` = GO payload). Watch: does the Lead relay any contract in the next team step?
72. HOLD → GO → first child: 1.4 / 2.7 / 4.7 / 5.3 min (programs / nutri-today / nutri-server / nutri-food). Slow ones re-read rulings and filled slots after GO. Fixed team-lead.md (questions carry defaults, ≤ 2 min). Measure next time: Agent tool_use timestamp minus GO arrival.
73. Paginated jobs: fixtures that fit one run hide stalls (Garmin back-fill past 100 activities, missed by 3 review passes + 2 QA). Fixed rules/tests.md + reviewer.md. Watch: sync pull / feed import tests.
74. Scripted rewrites recur on multi-hunk patches (SEC-1b python + 4 seds; P-D1 doc sed). Rule 6 now says one Edit per hunk, no exception. If it slips again, propose a PreToolUse hook on `python3 -` / `sed -i` touching tracked files (Lead-owned settings).
Metrics: N-F0 20.8 active of 20 box, 187 tools, 22.8M in-tok, no round 2 — 20 min was right. SEC-1b 17.5 active, 113 tools. TL prep 5–9 min each; TL active 7–12 min inside 18–30 min spans.
