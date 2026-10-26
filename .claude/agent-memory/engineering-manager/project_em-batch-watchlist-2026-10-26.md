---
name: em-batch-watchlist-2026-10-26
description: Watchlist items (28)–(32) from EM batches 2–3 on 2026-10-26 (Bash-banner citations, route inventory, commit-stamped measurements, pair CLAUDE.md lines, sequential team-lead children) plus the two running speed metrics and their last values
metadata:
  type: project
---

Watchlist added by EM batches 2–3 (2026-10-26 evening, UI-P polish pairs + feed + strava streams):

- (28) **Harness banner vs rule 6**: count engineer reports that write repo files via Bash heredoc/`sed -i` and cite the auto-mode banner ("prefer Bash for file changes"). Two on 2026-10-26 (mobile-A r2, EMAIL-1) before rule 6 named the banner. Expect 0; if it recurs, the fix is a PreToolUse hook on Bash (Lead-owned), not more text.
- (29) **Route inventory**: `apps/mobile/CLAUDE.md` Layout `app/` block is the canonical list (19 route files on 2026-10-26). Check each new route task's diff touches it; QA capture sets and designer specs must cover it or name the skipped routes. The owner's first live-site complaints were about routes outside the "10 screens" set (Sign-in, email).
- (30) **Commit-stamped measurements**: every measure/screenshot report line carries `rev-parse --short HEAD` + dirty count. Expect 0 "drift" findings debugged as defects when two layout streams run at once (FEED-5's 696 moved under the desktop pair).
- (31) **Pair CLAUDE.md lines**: a polish pair's team report lists its package CLAUDE.md lines under Decisions. mobile-A (DONE 21:59) wrote none; check the Lead assigned them (proposal P3) and that mobile-B/desktop reports carry theirs.
- (32) **Sequential children**: inside a nested team-lead, background Agent calls return on completion (measured by two team-leads 2026-10-26). Team sheets must not promise overlap; count sheets that do. If the harness changes, drop the "sequential by construction" sentence in team-lead.md step 4.

Running metrics (report both every Mode 1 batch):
- **Zero capture rework**: recipe-caused re-shoots per batch. Batch 2 → 3: 0 (mobile-A r2/r3 reshoots were code rounds, not recipe).
- **Leak metric**: designer (fable) rounds that found engineer-visible defects (invisible control in one scheme, truncation at 390, wrong JSON). mobile-A r1 = 1 round (3 defects), r2 = 0, r3 = 0; mobile-B r1 pending at batch 3. Target 0 after engineer.md rule 14 + team-lead step 6 self-check gate.

**Why:** these are the repeat-waste candidates that the next retro should prove fixed or escalate to hooks/settings; the metric values are not recoverable from git.

**How to apply:** at the next Mode 1 batch or Mode 2 retro, grep the new reports/transcripts for each item, update the values here, and drop an item after two clean batches.
