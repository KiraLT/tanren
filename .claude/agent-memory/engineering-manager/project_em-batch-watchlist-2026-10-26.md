---
name: em-batch-watchlist-2026-10-26
description: Watchlist items (28)–(33) from EM batches 2–4 on 2026-10-26 (Bash-banner citations, route inventory, commit-stamped measurements, pair CLAUDE.md lines, sequential team-lead children, shared-file commits) plus the two running speed metrics and their last values
metadata:
  type: project
---

Watchlist added by EM batches 2–4 (2026-10-26 evening, UI-P polish pairs + feed + strava + programs streams):

- (28) **Harness banner vs rule 6**: batch 4 = 0 violations (every engineer used Edit), but reports still carried a paragraph citing the banner; rule 6 now says "comply silently". If a real heredoc/`sed -i` on a repo file recurs, the fix is a PreToolUse hook on Bash (Lead-owned), not more text. Drop after batch 6 if clean.
- (29) **Route inventory**: `apps/mobile/CLAUDE.md` Layout `app/` block is the canonical list. Check each new route task's diff touches it; QA capture sets and designer specs cover it or name the skipped routes. Batch 4: feed added `/feed` + `/activity/[sessionId]` — verify the block has both at the next pass.
- (30) **Commit-stamped measurements**: every measure/screenshot line carries `rev-parse --short HEAD` + dirty count. Batch 4: LOGO-2's light/dark shots carried two shas (Lead committed mid-run) → ui-check now says rev-parse before and after. Expect 0 mixed-sha sets.
- (31) **Pair CLAUDE.md lines**: a polish pair's team report lists its package CLAUDE.md lines under Decisions. mobile-A wrote none (DOC-1 backfilled 22:11); mobile-B FINAL 22:32 — check its lines at the next pass.
- (32) **Sequential children**: inside a nested team-lead, background Agent calls return on completion (team feed confirmed a third time, 22:29). Team sheets must not promise overlap. If the harness changes, drop the "sequential by construction" sentence in team-lead.md step 4.
- (33) **Shared-file commits**: a file two charters name (mobile-B `app/settings.tsx` + strava "ONE row") was committed with one stream's untracked import → HEAD unbuildable ~1 h (22:11). engineer.md/team-lead.md now require `shared with <stream>` / `imports untracked <path>` markers; lead-playbook rule proposed (P1 batch 4). Count: reports that touch a charter-shared file without the marker; expect 0.

Running metrics (report both every Mode 1 batch):
- **Zero capture rework**: recipe-caused re-shoots per batch. Batch 2 → 3: 0; batch 3 → 4: 0 (LOGO-2 sha split is a stamp defect, not a re-shoot).
- **Leak metric**: designer (fable) rounds that found engineer-visible defects. mobile-A r1 = 1 (3 defects), r2 = 0, r3 = 0; mobile-B r1 = not-pass (defect classes not logged; counted 1 unclassified), r2 = PASS. Target 0 after engineer.md rule 14 + team-lead step 6 self-check gate; ask team-leads to classify r1 defects (engineer-visible vs design) in the sheet.

Pending design-doc proposal to re-check: v2-programs §9 recovery ≈ 4.0 min line (P2 batch 4) — if the Lead did not apply it, PROG-R's brief carries the fact.

**Why:** these are the repeat-waste candidates that the next retro should prove fixed or escalate to hooks/settings; the metric values are not recoverable from git.

**How to apply:** at the next Mode 1 batch or Mode 2 retro, grep the new reports/transcripts for each item, update the values here, and drop an item after two clean batches.
