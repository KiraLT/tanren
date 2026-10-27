---
name: em-batch-watchlist-2026-10-27u
description: Retro evening 2026-10-27 (20:00–21:31) items 145–149 — Lead tool mix is measurable from the main-session jsonl, fix-round waits are Lead latency not boxes, commit-at-land-points experiment set, gallery Artifact at the 511-file cap, QA literals live in lazy chunks
metadata:
  type: project
---

Items 145–149 (retro `docs/retro/2026-10-27-evening.md`, offset UTC+2 since DST ended 2026-10-25):

145. **Lead tool mix is measurable**: the main session's transcript is `~/.claude/projects/-Users-lukas-Documents-Personal-tanren/<session>.jsonl` (≈ 108 MB on 2026-10-27); filter `type == assistant` by timestamp and count Bash commands matching git/index/signing. Evening: 49 of 131 Lead tool calls were git mechanics for 27 commits; 30 dispatches, 9 resumes.
146. **Fix-round waits are Lead latency**: 5 rounds parked engineers 7–9 min (DESK 4) while the reviews took 1.3–2.1 min; every report → dispatch edge ≥ 5 min fell inside a commit burst (20:04–20:37). Fix-round boxes (EM-22 box 6) were never the constraint. Playbook now says "a landed report's reviewer is the Lead's next tool call".
147. **Experiment set (next step)**: commit at land points only (playbook Speed tactic 11) — metric Lead commits/h ≤ 8 (was 18) and report → dependent-dispatch p90 ≤ 2 min (was 6); guard: rounds > 1 and leak incidents unchanged. Check it in the next retro; if it held, propose the dev-system paragraph (P2) to the Lead.
148. **Gallery Artifact is at the 511-file cap** (two failed publishes 21:23–21:31; fixed by removing superseded files in the same publish). ui-check names the cap; P3 proposes an archive Artifact. Watch for a third failure.
149. **Production literals live in lazy route chunks** (`_expo/static/js/web/<route>-<hash>.js`), not `entry-<hash>.js`; qa.md step 5 now says so. A Lead QA brief that names the entry is a brief error, not a QA defect.

**Why:** the owner measures wall-clock; this evening's wall-clock losses were Lead-local (signing 24-min window, commit count, serial dispatch), not agent speed (reviews ≤ 2.3 min, fix rounds ≤ 3.5).
**How to apply:** in the next Mode 2 run compute 145/146 first; grade 147 against its metric before proposing new commit rules; items 148–149 are facts to verify, not re-propose.
