---
name: em-batch-watchlist-2026-10-26
description: Watchlist items (28)–(36) from EM batches 2–5 on 2026-10-26 (Bash-banner citations, route inventory, commit-stamped measurements, pair CLAUDE.md lines, sequential team-lead children, shared-file commits, pair hard-timeout arithmetic, charter ports, design predicates without writers) plus the running speed metrics and their last values
metadata:
  type: project
---

Watchlist added by EM batches 2–5 (2026-10-26 evening, UI-P polish pairs + feed + strava + programs + landing + brand streams):

- (28) **Harness banner vs rule 6**: batch 4 and 5 = 0 violations. Drop after batch 6 if clean.
- (29) **Route inventory**: `apps/mobile/CLAUDE.md` Layout `app/` block carries `(tabs)/feed`, `activity/[sessionId]`, landing (verified batch 5). Check each new route task's diff touches it.
- (30) **Commit-stamped measurements**: batch 5 replaced the "rev-parse before and after" rule with "stamp when the content is fixed" (export time → `$S/<task>-dist/COMMIT`; dev server → tree md5 before/after). Expect 0 two-sha sets and 0 Lead commit batching.
- (31) **Pair CLAUDE.md lines**: mobile-B FINAL carried its lines (22:32). Desktop r4 charter says "shared with Lead" Layout lines — check at its final.
- (32) **Sequential children**: desktop r4 charter states it explicitly. Drop the team-lead.md sentence if the harness changes.
- (33) **Shared-file commits**: batch 5 = 0 unmarked (LAND-1 flagged `_layout.tsx` adjacency). Drop after batch 6 if clean.
- (34) **Pair hard-timeout arithmetic** (team-lead.md step 6, batch 5): a round starts only when now + engineer + capture (8–12 min) + designer ≤ stop − 3. Desktop ran 93/90 with r3c unreviewed. Check desktop r4 (70-min box, hard stop in the charter) reports on time with every round reviewed; also check its sheet Log is non-empty (desktop's was empty — sonnet team-lead).
- (35) **Charter ports**: Lead-assigned 8861/8862 belonged to a live strava wrangler. team-lead.md step 1 now probes before briefing; per-session port table proposed (P2 batch 5). Count collisions; expect 0.
- (36) **Design predicates without writers**: ADR-0018 §4 export predicate had no Today write path (found by QA last → TODAY-FIN). architect.md Output 2 now requires the grep-verified writer. At the next design-doc task, grep its predicates for a named code path.

Running metrics (report both every Mode 1 batch):
- **Zero capture rework**: recipe-caused re-shoots per batch. Batch 2→3: 0; 3→4: 0; 4→5: 1 (desktop r6 session loss shot the sign-in form; ui-check now checks get-session per batch).
- **Leak metric**: designer (fable) rounds that found engineer-visible defects. mobile-A r1 = 1 (3 defects), r2–r3 = 0; mobile-B r1 not-pass (unclassified), r2 PASS; desktop r3 "another round" was design-side (scores 3–4), no engineer-visible defect logged. Target 0; ask team-leads to classify r1 defects in the sheet.
- **Architect overrun**: LAND-0 24.7 on 15 (4 deliverables), BRAND-0 10 on 30. architect.md box now 15 + 5 per extra deliverable; expect ≤ 10 % overrun next.

Pending Lead proposals to re-check at the next batch: P1 `du -ch <glob>` in the brief template, P2 port table, P3 GAL-2 gallery manifest, P5 architect box table line 189 (all batch 5).

**Why:** these are the repeat-waste candidates that the next retro should prove fixed or escalate to hooks/settings; the metric values are not recoverable from git.

**How to apply:** at the next Mode 1 batch or Mode 2 retro, grep the new reports/transcripts for each item, update the values here, and drop an item after two clean batches.
