---
name: retro-baseline
description: Owner primary process metric (wall-clock per step), baselines for step 1, step 2 (company mode) and steps 4 ∥ 7 (parallel teams), the experiments set for step 5 and the closing phase, and the repeat-waste watchlist for the next retro
metadata:
  type: project
---

Owner (Lukas) said step 1 "progress was too slow" and, at 23:32 on 2026-10-20 with two teams running, "still too slow; more tasks while you wait?"; wall-clock per step is the Lead's primary goal. Since 23:00 on 2026-10-20 the owner delegates all decisions to the Lead (plan Amendment 3) and asked for auto-commits at milestones (23:26).

**Why:** retros must compare against a baseline, and a waste that repeats in two consecutive retros triggers "Escalate to research".

**How to apply:** baselines — step 1 (docs/retro/2026-10-20-step-1.md): ≈3h10m, ratio ≈0.3, 2 review rounds. Step 2 company mode (…step-2-company-mode.md; steps 2+3+6): 51 min to e2e, ratio 0.72, 35 agents, 258 agent-min, 71.6M tokens (3.9M uncached). Steps 4 ∥ 7 (…steps-4-7-parallel.md): 40.5 min fan-out→e2e (48 from the hardening dispatch), ratio 0.96, 35 agents / 329 span-min / 113.7M tokens (5.0M uncached), plus 9 step-5 agents pipelined alongside; team boxes 75 → used 29 (mcp) and 34 (plan-web); 0 runtime defects behind a green team gate; engineer active time max 12.4 min; report→fix-round wait median 10 min.

Experiments set 2026-10-21 00:1x: step 5 (team mcp-oauth) "rolling review" — report→fix-round wait ≤ 3 min, no foreground Agent pair in a team-lead message, 0 `[handback-send-enforce]` on the team-lead, team final ≤ 45 of the 90-min box, ≤ 1 review round per task. Closing phase "one owner session" — owner round-trips ≤ 1 to prod e2e and ≤ 2 to the first set logged on the phone, preflight script pre-validates every owner step, ≤ 15 min agent wall-clock from "owner done" to proof.

Watchlist for the next retro:
1. Review latency inside teams (NEW top in-team waste): median 10 min report→fix round, one review after the last task + team-lead turn blocked by foreground Agent calls. Rule now in team-lead.md steps 4/6; team mcp-oauth started on the OLD file (23:45:24) — judge it only if the Lead forwarded the delta (P1). If the wait stays > 5 min → research per-task review patterns.
2. Lead dispatch gap at fan-out: 16 min (23:16:44→23:32:41) before the owner's nudge; after the idle checklist every Lead edge was ≤ 2.1 min. Check the next fan-out turn starts the idle list immediately (P2).
3. Scope gaps after fan-out: P6 sign-in (Log had routed it to step 7 at 23:06). architect.md Output 4 now requires the forward-reference grep; check the step-5 closing charters list "Deferred" lines.
4. "No run > 20 min": measure active time, not span (4 false fails this step). Keep the 20-min bar on active time; if any engineer's active time > 15 min, look at the brief size.
5. Role-file lag now has a mechanism cost: edits during a live team never reach it; em-review asks for live-team deltas. Verify the Lead forwards them (P3).
6. `.biome/noMutation.grit` check 4 syntactic (`push` names): no new bites this step; drop from the list after one more clean step.
7. context7: engineers still 0 calls through step 4/7 (plan-web engineers loaded expo/frontend-design skills instead). One more clean step → propose dropping "verify via context7" from engineer.md in favour of `.d.ts` + vendor skills.
8. Concurrency: peak ≈ 12 agents (23:34–23:45) with no rate-limit kill (S1 died at 6). Record the peak each retro; if a kill recurs, cap at the last safe peak.
