---
name: em-batch-watchlist-2026-10-26
description: Watchlist items still open after EM batches 2–6 (2026-10-26/27): commit-stamped measurements, shared-file commits, design predicates without writers, layout proofs by bounding box, derived writes in SyncEngine, owner-leaving commit check, team-lead watchdog grouping; plus the running speed metrics and their last values
metadata:
  type: project
---

Watchlist (dropped after two clean batches: 28 banner citations, 31 pair CLAUDE.md lines, 32 sequential children — disproved, children in one message run concurrently, R4a ∥ R4b 2026-10-26 21:18; 34 pair timeout arithmetic — desktop r4 reported 23:48 on 23:55 with its Log filled; 35 charter ports — r4 probed 8899 and noted LAND-2's 8897):

- (30) **Commit-stamped measurements**: "stamp when the content is fixed" (export → `$S/<task>-dist/COMMIT`). R4c did it (`ff83f34, 29 dirty`). Expect 0 two-sha sets.
- (33) **Shared-file commits**: batch 5 and 6 = 0 unmarked (r4 marked every shared file). Drop after batch 7 if clean.
- (36) **Design predicates without writers**: architect.md Output 2 + reviewer.md "Data predicates". No new design doc since; check at the next one.
- (37) **Layout proofs by bounding box** (batch 6): TODAY-FIN's button passed a snapshot + height check while floating over Set 2 at 390; REV-TF approved on code; a desktop designer found it in production. reviewer.md "Layout proofs", engineer.md item 14, ui-check "New or moved element" now require box order + opening the PNG. Brief-template line proposed (P3 batch 6). Check: every screen-change report pastes neighbour boxes; every reviewer APPROVE on a UI diff names the PNG it opened.
- (38) **Derived writes in SyncEngine** (batch 6): the Lead's AUTO-FIN brief put `finishStaleSessions` in `useToday`; REV-AF found the between-pull-pages tombstone. expo-mobile skill now states the rule. Check the next brief that touches synced tables.
- (39) **Owner-leaving commit check** (batch 6, P1 pending): 1Password signing locked ~23:50, three Lead commits failed, DEPLOY-4 slid to the morning. Proposed: commit in the turn the owner announces leaving + `SSH_AUTH_SOCK=~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock ssh-add -l` before the last wave (verified: lists 2 keys when unlocked).
- (40) **Team-lead watchdog grouping** (batch 6, P2 pending): the watchdog fired on the desktop team-lead's transcript while its children ran (22.4 idle min of 35.8). Liveness = newest mtime of the team-lead's transcript and its children's (`grep -o '"agentId":"a[0-9a-f]*"' <tl>.output | sort -u`).

Running metrics (report both every Mode 1 batch):
- **Zero capture rework**: recipe-caused re-shoots per batch. 2→3: 0; 3→4: 0; 4→5: 1 (desktop r6 session loss); 5→6: 0.
- **Leak metric**: designer rounds finding engineer-visible defects. mobile-A r1 = 1, r2–r3 = 0; mobile-B r1 unclassified, r2 PASS; desktop r3 design-side only; desktop r4 = 1 cross-stream (TODAY-FIN 390 overlap). Target 0.
- **Architect overrun**: LAND-0 24.7 on 15 (4 deliverables), BRAND-0 10 on 30. architect.md box = 15 + 5 per extra deliverable; no architect run in batch 6.

Pending Lead proposals to re-check: batch 5 P3 GAL-2 (done 23:24); batch 6 P1 (owner-leaving commit + signing check), P2 (watchdog children), P3 (brief Done-when box-order line), P4 (brief scope "the component that renders X, grep").

Measuring note: transcripts under `<session>/tasks/a*.output` are symlinks to `~/.claude/projects/<proj>/<session>/subagents/agent-<id>.jsonl`; the final report is the `SubagentHandback` tool_use input, not a text block; the "auto mode" banner text appears in every user turn, so grep assistant `tool_use` commands (`sed -i` / `cat >` on `apps/`) for rule-6 violations, never the raw file.

**Why:** these are the repeat-waste candidates the next retro should prove fixed or escalate to hooks/settings; the metric values are not recoverable from git.

**How to apply:** at the next Mode 1 batch or Mode 2 retro, grep the new reports/transcripts for each item, update the values here, and drop an item after two clean batches.
