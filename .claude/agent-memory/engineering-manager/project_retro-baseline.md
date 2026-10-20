---
name: retro-baseline
description: Owner primary process metric (wall-clock per step), step-1 and step-2 (company mode) baselines, the experiment targets set for step 4 ∥ 7, and the repeat-waste watchlist for the next retro
metadata:
  type: project
---

Owner (Lukas) said step 1 "progress was too slow"; wall-clock per step is the Lead's primary goal (2026-10-20). Since 23:00 on 2026-10-20 the owner delegates all decisions to the Lead (plan Amendment 3).

**Why:** retros must compare against a baseline, and a waste that repeats in two consecutive retros triggers "Escalate to research".

**How to apply:** baselines — step 1 (docs/retro/2026-10-20-step-1.md): ≈3h10m, ratio ≈0.3, 2 review rounds. Step 2 company mode (docs/retro/2026-10-20-step-2-company-mode.md; three build steps 2+3+6 at once): 51 min to e2e / 57 to acceptance, ratio 0.72, 35 agents, 258 agent-min, 71.6M tokens (3.9M uncached), worker 2 review rounds, 1 runtime defect behind a green team gate.

Experiment set for step 4 (mcp) ∥ step 7 (plan-web), "zero-lag tail": wall-clock ≤ 60 min fan-out→e2e; ratio ≥ 0.75; dispatch lag and acceptance lag ≤ 2 min on every critical-path edge; no engineer run > 20 min (span incl. fix rounds); ≤ 1 review round per task; every team report has a real Demo row; zero escalations naming work absent from all task lists at fan-out. Check each from transcripts.

Watchlist for the next retro:
1. Runs over the box — re-measured: the real offenders were continuation agents inside teams (W-T2+T3+fixes 16.7 min / 9.3M tokens; M2 24.1-min span), not S2-T3 (5m42s, mislogged as ~24). team-lead.md now says fresh engineer per task. If a continuation agent again exceeds 20 min → propose maxTurns per team engineer or a hard split rule.
2. Lead tail latency (NEW, top waste of step 2): 8.2 + 5.7 min on INT-2b. Proposals P1/P2 to lead-playbook pending the Lead's acceptance; verify they were applied before judging.
3. Runtime proof (watchlist 4 from steps 3/6): first check = Demo rows in the hardening and step-4/7 team reports; the hardening charter already carries a Runtime proof line (good sign). Workerd coverage rule (health + get-session + one authed route) added to the cloudflare-workers skill; check H1/H3 landed it.
4. Cross-stream needs discovered mid-flight (S2-T6/T7, LOCAL_USER_ID): architect.md now requires them as tasks + pre-written team sheets. Check step-4/7 sheets (written 23:03–23:13, i.e. BEFORE the architect.md edit reached any agent) — expect the gap once more; count it as a role-file failure only if a later architect run misses it.
5. `team-build.js` workflow: never executed; retro 2 judged it +13 min on step 2 (barrier + single integration engineer). Proposal P3/P6 to retire its mention; do not re-propose running it.
6. EM Mode 1 trigger is now event-based (em-review skill). Count runs and Lead turns spent on EM proposals next step; if Lead turns on proposals > 5 while a critical-path report waits, batch per step instead.
7. `.biome/noMutation.grit` check 4 is syntactic; own methods named `push` trip it. Convention = rename. Third bite → propose receiver allowlist or dropping check 4.
8. context7: engineers still 0 calls after ~20 runs; only fable architects used it. If step 4/7 engineers still never call it, drop the "verify via context7" wording from engineer.md in favour of `.d.ts` only.
