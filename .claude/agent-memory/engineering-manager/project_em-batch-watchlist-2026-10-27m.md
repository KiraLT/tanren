---
name: em-batch-watchlist-2026-10-27m
description: EM "CLAUDE.md diet" watchlist items 101–104 — package CLAUDE.md files grow as file-by-file export tours (worker 22k → 12.4k), line budgets dodged by 300-char lines, stale "known gaps" and "asserts" claims that nobody re-verifies, mobile 56k pending
metadata:
  type: project
---

Items 101–104 (CLAUDE.md diet part 1, 2026-10-27 18:20):
101. **Package CLAUDE.md as export tour.** apps/worker's `## Layout` was 15.3k chars of per-file method lists that `ls src/*` + module headers give in two tool calls; team-leads append a paragraph per task and nobody cuts. Cut to a per-directory map with the gotcha per line (22,025 → 12002 chars, 126 lines). Watch: every team-lead "Docs" step that touches a package CLAUDE.md — does it add a gotcha or a listing?
102. **Line budget dodged by long lines.** dev-system §6 says ≤ 80 lines; the worker file was 187 lines of up to 330 chars, mobile is 598 lines / 56k. Proposed to the Lead: a `wc -c` budget (≤ 12k chars per package file) next to the line budget, and "over budget → move the contract to the design doc".
103. **Stale negatives survive diets.** The worker file still said the Better Auth limiter "needs `rateLimit: { enabled: true }` (escalated)" — `rateLimitFor(environment)` has forced it on in production for some time — and that `writeTools.workerd.test.ts` *asserts* D1 counts (it prints them: "counts printed, not budgeted"). Both fixed in the rewrite. Watch: any "Known gaps" / "escalated" / "asserts N" sentence in a CLAUDE.md older than the latest task in that package; grep the named symbol before keeping it.
104. **Mobile file 56k, above the 40k memory warning**, part 2 pending until CONFIRM-1 (engineer, live in apps/mobile) lands; its `src/ui` line is the one CONFIRM-1 may touch.

**Why:** `/doctor` (owner-run, 18:00) showed the package CLAUDE.md files are the heaviest context every agent carries; the content was mostly derivable, and part of it was wrong.
**How to apply:** on every Mode 1 review of a task that edited a package CLAUDE.md, run `wc -c` and check the diff adds a gotcha, not a listing; re-grep one "known gap" per diet.
