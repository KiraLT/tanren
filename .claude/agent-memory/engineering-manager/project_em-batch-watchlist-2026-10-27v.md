---
name: em-batch-watchlist-2026-10-27v
description: EM batch 25 (Hardening 2, 22:25–22:40) items 150–155 — brief contradictions (Out ∧ Decision), behaviour claims written as `if`, two-file "no copy left" greps, HEAD via GET route, web-only field proofs, skill copy quotes going stale within minutes; first land-point/reviewer-first measurement
metadata:
  type: project
---
Items 150–155 (watch for recurrence; each already has a system edit, see em-log 2026-10-27 batch 25):
- 150 Brief Out ∧ Decision contradiction (H2-A: Out `packages/*`, Decision put the email read in packages/db). Lead reads Out against Decisions once before dispatch.
- 151 Brief states a function outcome for a case the Lead never read (`if bestSet returns None for all-0-kg`; it scores by reps). Rule: behaviour is a fact only with body/test line, else a question.
- 152 "No copy left" grep limited to the two files the brief touched missed a third copy (`programTools.ts:569`). Greps span `apps packages`.
- 153 `method === "GET"` gate: Effect HttpRouter serves HEAD through GET → confirm/consent bypass. Gate on `!== "POST"`. Now in effect-conventions §7 + reviewer auth item (8).
- 154 Web-only proof of an input state (browser focus ring, Enter) ≠ phone proof: iOS has no focus ring, `number-pad` has no return key. Engineer names the native affordance.
- 155 A ui-check recipe line quoted UI copy that a fold-in changed 5 min later. Recipe lines point at the copy's file and say "re-grep before quoting".

**Why:** 3 of 4 reviews found things the engineer's own web proof could not see; 2 of 4 briefs carried a Lead error. Both classes recur across batches (items 75, 115, 139).
**How to apply:** when a review should is "invisible on web" or a CONFLICT is "brief vs code fact", check whether these lines fired before adding new text.

Experiment measurement (reviewer-first + one land-point commit, first batch under it): Lead latency over 8 dependent dispatches median 0.85 / p90 1.5 / max 1.5 min (retro v6 edges were ≥ 5 min); no engineer blocked; fold-ins by resume cost 1 min each on finished agents (idle 1.6–4.5 min, not on the path); one commit 1.3 min after the last fold-in; commits/h 4 vs 18. Downside seen: 4 serial Lead touches per task (report → reviewer → fold → accept) — 16 Lead turns in 11 min; fine at 4 tasks, saturates at ~8.
