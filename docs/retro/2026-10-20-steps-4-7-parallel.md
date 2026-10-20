# Retro — steps 4 (team mcp) ∥ 7 (team plan-web) after team hardening · 2026-10-20 · engineering-manager

Window: team fan-out 23:16:44 (Log: "23:14") → INT-A full-stack e2e hand-back 23:57:17, commit + owner recipe 23:58.
Numbers from 48 transcripts (UTC, converted to the Log's Europe/Vilnius clock); the Log's remembered times were 2–8 min off.

## Metrics
| metric | value |
| --- | --- |
| wall-clock | **40.5 min** fan-out → e2e (48 from the hardening dispatch 23:09:19); step 2: 51 |
| agents · time · tokens | step 4/7 proper: 35 runs · 329 span-min · 1054 turns · 1409 tool uses · 113.7M tokens (5.0M uncached). Alongside: step-5 pipelining 9 runs · 86 min · 35.6M (1.7M); EM 4 runs · 34 min · 3.6M (0.5M) |
| critical path | plan-web team 23:16:44→23:50:49 (34.1) → INT-A 23:52:21→23:57:17 (4.9) = 39.0 min → **ratio 0.96** (target ≥ 0.75; step 2: 0.72). Inside plan-web: sheet 1.8 → P1 3.5 → P4 8.8 (found P1's defect 23:33:33) → P1 fix 8.6 → P4 final proof → P6 fix r2 → REV delta → QA → report; waits on the chain ≈ 7 min |
| Lead lags, critical edges | plan-web → INT-A 1.5 · INT-A → commit + owner ping ≈ 1 · mcp → commit 0.5 · premature mcp report → "not accepted" 0.5 · (not critical: hardening → S4-T1 2.5, cross-review → 3 dispatches 2.1). One > 2: owner's sign-in request 23:26 → P6 brief 23:33 (≈ 7; P6 then formed the tail, ≈ 1.7 min) |
| engineer runs | spans > 20 min: P3 24.9, P1 24.7, S4-T3 22.3, P4 20.9 — all waiting for a fix round; **active time max 12.4** (P4), P1 12.1, T3 12.0 |
| review rounds | mcp 1 (+1 fix round) · plan-web 2 + delta (P6 two fix rounds; P1 a runtime-defect round) |
| gate / runtime | root gate red for all during fan-out (expected); 2 foreign reds inside teams (Lead's QA files in `apps/mobile`, SYNC-FIX WIP under mcp QA); **0 runtime defects behind a green team gate** at integration (step 2: 1); the Lead's QA passes found 5 real defects before the owner's recipe |
| escalations absent at fan-out | 5: P6 sign-in, `Repositories.ts` port growth, Lead QA files in exclusive paths, `allowBuilds core-js-pure`, `EntityName`→`Label` |
| hand-backs | 1 premature (mcp 23:43:18); 9 `[handback-send-enforce]` nudges across agents (idle turn ends) |

**Targets ("zero-lag tail")**: wall-clock ≤ 60 met · ratio ≥ 0.75 met · Lead lags ≤ 2 min met on every critical edge after 23:38, missed once before (P6, 7 min) · no run > 20 min missed ×4 as written, met on active time · ≤ 1 review round missed (plan-web) · Demo rows met (3/3, all real runtime proofs) · zero late escalations missed (5). 4 of 7.

## Top wastes
1. **16-min Lead dispatch gap at fan-out** (23:16:44 → 23:32:41, no new dispatch). The five side streams started in one turn at 23:32:41 after the owner's nudge; every input existed at 23:17. Cost: step 5's plan (and team mcp-oauth) started 16 min later than possible; the P6 decision took 7 min inside the gap. Lead-side fix landed (idle checklist, lead-playbook).
2. **Review latency inside teams: median 10 min from an engineer's report to its fix round** (P3 18, T3 10, P5 10, P4 8.5, T4 4). One review after the last task, plus the plan-web team-lead's turn blocked behind P6's foreground `Agent` call: REQUEST CHANGES at 23:36:31 acted on at 23:41:46. Fixed: team-lead.md step 4 (background dispatch), step 6 (rolling review, fix rounds ≤ 2 min).
3. **A runtime defect found by the wrong task**: P1 shipped on node:sqlite tests; P4's exported-build proof found the direct `/plan` load failure (OPFS + bfcache) 11.6 min later; the 8.6-min fix round was the longest segment of the critical path. Fixed by EM Mode 1 (expo-mobile: prove on the export with a direct second-route load). Related: the mcp team-lead's premature report was harness-forced (`[handback-send-enforce]` after an idle turn end at 23:42:55); fixed in team-lead.md step 5 (wait with Monitor / until-loop).

## Answers
1. Critical path = plan-web → INT-A (mcp finished 23:45:57, 5 min before plan-web). Idle on it: ≈ 7 min of team-lead turns and waits, 1.5 min Lead; the structural costs were the P1 fix round (8.6) and P6's late add (1.7 on the tail).
2. The side streams bought: step 5 planned by 23:44 and dispatched 23:45:24, 0 min after team mcp (≈ 15 min earlier than serial planning); 5 defects (exercise-name poison-pill 500; 4 mobile sync/Today) fixed before INT-A and the owner's test; HI-1's 3 leftovers. Cost to the teams: 2 escalation lines and one red mobile tsc at 23:43 (≈ 3 agent-min, 0 critical-path minutes — P1's fix was the bottleneck then). The loss was the 16 min before them, not the streams.
3. After the idle checklist (≈ 23:34): every Lead edge ≤ 2.1 min (0.4–2.1; 9 edges measured). Target held.
4. EM by event: 3 Mode 1 runs (12.9 agent-min, 0.22M uncached, 25 edits, ≈ 8 proposals applied at 23:38/23:52/23:57, each after the critical dispatch). Keep. Gap: edits to team-lead.md (23:52–23:54) never reached team mcp-oauth (started 23:45:24) → em-review skill now asks for live-team deltas; the Lead should forward them now (P1).
5. Next complaint: **"nothing works on my phone"** — the plan's first client is iPhone/Expo Go, every proof is web, native sign-in is a notice (NATIVE-1), no Xcode/simulator on this Mac (00:05 spike brief). Pre-empt (in motion since 00:05): native sign-in design + a phone recipe (LAN worker URL, `expo start`, Expo Go); measure owner round-trips to the first set logged on the phone (≤ 2). Second: deploy blocked on owner actions (D1/KV ids, Resend key, DNS, `wrangler login`) → a `deploy:preflight` script that checks each prerequisite and prints the one next owner command; one owner session, ≤ 5 pasted commands. Third: rate limit — peak ≈ 12 concurrent agents at 23:34–23:45 without a kill (S1 died at 6); hold ≤ 12. Fourth (low): 13 commits in 36 min, 5 "System:" — squash only if asked.
6. Experiments below.

## Changes made by the EM (em-log "retro S4∥S7")
`.claude/agents/team-lead.md` step 4 background dispatch · step 5 how to wait (Monitor / until-loop, never an idle turn end) · step 6 rolling review + fix rounds ≤ 2 min · `.claude/agents/architect.md` Output 4 forward-reference grep before the task list · `.claude/skills/retro/SKILL.md` UTC vs local clock, active time vs span · `.claude/skills/em-review/SKILL.md` live-team deltas · EM memory.

## Proposals for the Lead (exact text)
- **P1 action now** · SendMessage to `afc4fc7bb7ddb64c8` (team-lead mcp-oauth, running on the 23:38 team-lead.md): "Rule deltas since your start: (1) dispatch children with `run_in_background: true`, never two foreground Agent calls in one message; (2) hand back only after every fix round landed and you re-ran the package gates — wait with Monitor or a Bash until-loop on `tasks/<id>.output`, never an idle turn end (the harness forces a hand-back); (3) review rolls: review finished tasks while others run, forward fix rounds within 2 min; (4) parallel budget = the charter's; more ready tasks → ≤ 5-line interim."
- **P2 lead-playbook "Parallel by default"**, after "Stop only when the dependency graph itself is empty, and say so.": "Run the list in the fan-out turn itself: at 23:17 all five items had their inputs; they started at 23:32:41 in one turn after the owner's nudge — 16 min of parallel capacity, and step 5 started 16 min late."
- **P3 lead-playbook "Company mode"**, new item: "A role file is read once, at spawn. After any Mode 1 or retro edit to `team-lead.md`/`engineer.md`, forward the delta (≤ 3 lines) to every live team-lead id (team mcp-oauth started 23:45:24 on the 23:38 team-lead.md and never saw the 23:52 rules)."
- **P4 engineering-manager.md Mode 2**, after "usage deduped per message id)": ", timestamps UTC against the Log's Europe/Vilnius clock; report engineer active time and fix-round wait, never spans".
- **P5 docs/handoff.md**: replace the "zero-lag tail" block with the two experiments below.
- **P6 dev-system §11 "Mechanisms"** (optional, one bullet): "Team-leads dispatch children in the background and wait with Monitor/until-loops; a turn that ends idle is force-handed-back by the harness."

## Experiments
- **Step 5 (team mcp-oauth, 90-min box from 23:45) — "rolling review"**: every engineer's report → fix-round wait ≤ 3 min (this step: median 10) · no foreground `Agent` pair in a team-lead message · 0 `[handback-send-enforce]` nudges on the team-lead · team final ≤ 45 min of the box (step 4: 29/75, step 7: 34/75) · ≤ 1 review round per task. Requires P1 now.
- **Closing phase (owner deploy, native auth) — "one owner session"**: owner round-trips ≤ 1 to prod e2e and ≤ 2 to the first set logged on the phone; every owner step pre-validated by a preflight script agents ran in dry-run; agent wall-clock from "owner done" to the proof ≤ 15 min.

## Keep
All Lead edges ≤ 2.1 min after 23:38; team mcp-oauth dispatched 0 min after team mcp; INT-A pre-written and dispatched 1.5 min after plan-web; EM resumed for two team reports instead of a second spawn; QA-on-HEAD passes that found 5 defects before the owner did; 0 runtime defects behind a green team gate.

## Escalate to research
None. Watchlist: if the step-5 report → fix-round wait stays > 5 min despite rolling review, research per-task review patterns (reviewer bound to each engineer brief).
