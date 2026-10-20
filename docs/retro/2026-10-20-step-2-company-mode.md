# Retro — company-mode step (build steps 2 db · 3 worker · 6 mobile) · 2026-10-20 · engineering-manager

Window 22:06 (S2-T1 dispatched) → 22:57 (INT-2b e2e handed back) / 23:03 (Lead accepted). Numbers come from the
35 agent transcripts of the step, not from the Log (which undercounts tool uses ~2× and misdated S2-T3).

## Metrics
| metric | value |
| --- | --- |
| wall-clock | 51 min to the e2e hand-back, 57 min to acceptance, for three build steps (step-1 target ≤ 95 for one: met) |
| agents · agent-time | 35 runs · 258 agent-min (first→last timestamp; resumed agents include idle) → parallelism ≈ 4.5× |
| tokens | 71.6M context processed, 94% cache reads; 3.9M uncached (cache-creation + in + out = the Log's "k" figures) |
| turns · tool uses | 879 API turns · 1195 `tool_use` |
| review rounds | worker 2 (R1 on T2/T4 while T3 ran; R2 found a new blocker in T3) · mobile 1 + fix · TOOL-1 1 · integration 0 |
| gate failures | root gate red for everyone during fan-out (expected); 1 runtime defect behind a green team gate (worker 500 under workerd) |
| incidents | 3 logged (python edit wipe, unfixed "fixed", pkill) + 2 unlogged (Lead Bash denied ×3; INT-2b `db:reset` wiped TOOL-1's D1) |
| runs > 20 min | team-leads 24–27 (expected); M2 24.1-min span (3 hand-backs incl. fix round); W-T2+T3+fixes 16.7 min on one agent, 71 turns, 9.3M tokens (13% of the step). **S2-T3 ran 5m42s, not the logged ~24 min** |
| critical path | worker chain: team-lead setup 3.4 → W-T1 2.7 → W-T2/T3/fixes 16.7 → R2 + memoryAdapter fix 3.5 → INT-1 9.1 → INT-2b 5.6 = **41 min**; the db chain (T1→T3→T4→T6) converged within 30 s of it at 22:33:30 |
| critical-path ratio | 41 / 57 = **0.72** (target ≥ 0.6 met; step 1: 0.3) |
| EM Mode 1 | 6 runs · 32 agent-min · 4.3M tokens (0.46M uncached) · 46 system edits · 0 min on the critical path |

## Top wastes
1. **Lead latency once the fan-out ended: ≈ 14 min, 25% of wall-clock.** INT-1/INT-2 handed back 22:43:30/42 →
   INT-2b dispatched 22:51:41 (8.2 min: role-audit fixes, /doctor, CLAUDE.md trim, EM proposals). INT-2b handed
   back 22:57:17 → accepted 23:03–23:06 (≈ 6 min: owner message, ADR acceptance, architect dispatch). While three
   streams ran the Lead was never the bottleneck (W-T2 started 37 s after W-T1, INT-1 54 s after S2-T6); once a
   single agent was the whole team, every Lead minute was a wall-clock minute.
2. **Cross-stream work discovered mid-flight: ≈ 21 min of critical path (37%).** S2-T6 (SyncStore D1) and S2-T7
   (auth tables) existed only after the worker interim at 22:26; S2-T6 could have started at 22:22 (T4 done).
   `LOCAL_USER_ID`, invented in a brief, made every push `forbidden` until INT-2. The W-T4 500 passed a green
   team gate ("real-D1/workerd tests come with integration" was in the charter). Integration then cost INT-1 9.1 +
   INT-2 6.3 + INT-2b 5.6 min. The escalations were correct under the ownership rule; the design/charter should
   have listed them as db-stream tasks before fan-out.
3. **Multi-task continuation agents, hidden by bookkeeping.** W-T2+W-T3+R1 fixes on one opus agent (16.7 min, 9.3M
   tokens); M2 and M3 absorbed fix rounds (24.1 / 17.7-min spans). The Log recorded S2-T3 as "~24 min over box"
   when it ran 5m42s, so the step-1 target "no run > 20 min" was failed on a phantom while the real over-box runs
   sat inside the teams.

## Answers to the Lead's questions
1. Critical path = worker chain → INT-1 → INT-2b (41 min). Idle on it: 8.2 + 5.7 min Lead latency at the tail,
   3.4 min team-lead setup, 4.7 min waiting for the SyncStore port.
2. Interim reports: worth it only as escalation carriers (worker 22:26 → S2-T6/T7 seven minutes before its final;
   mobile 22:31 → INT-2 brief before its final). Progress percentages cost a Lead turn and a resume for nothing.
   Now event-driven, ≤ 5 lines (team-lead.md step 8).
3. Escalations: the Lead running S2-T6/T7 was right (teams cannot edit `packages/db`). The defect is upstream: the
   architect's team split must list every cross-stream need as a task in the owning stream (architect.md).
4. Yes, Node-only testing was the root cause. The rule set (runtime proof in charter, team-lead, reviewer, §11) is
   sufficient for entry/auth/import changes; the workerd project is not yet — it probes `/health` only. Coverage
   rule added to the cloudflare-workers skill: `/health` + `/api/auth/get-session` + one `Authentication` route.
5. Lead-run db stream: right call — foundation stream on the critical path, dependents dispatched within a minute,
   no sheet overhead, reports never collided with team reports. Keep it only with ≤ 2 other teams and ≤ ~6 tasks (P4).
6. EM Mode 1: keep, trigger by event (team report, integration task, incident, round 2, over-box, new runtime)
   instead of by task, and end every handback with old→new proposals (em-review skill). Its tokens are off the
   critical path; its real cost is Lead turns (6 reports, ~10 proposals), which competed with INT-2b's dispatch.
7. `team-build.js`: do not run it for step 4 ∥ 7. It barriers on all team reports (escalations wait: S2-T6/T7 would
   have waited ≈ 7 min), runs one integration engineer (INT-1 ∥ INT-2 serial: +6 min), always runs QA, and takes
   the integration brief before the teams run. Net ≈ +13 min on this step for progress tracking the Log already
   gives. Direct team-leads with architect-written sheets and pre-written briefs; revise the workflow only if it
   gains interim escalations and parallel integration tasks.

## Changes made by the EM (em-log "retro S2-company")
`.claude/agents/architect.md` cross-stream tasks + team sheet skeletons before fan-out · `.claude/agents/team-lead.md`
pre-written sheet, event-driven escalation interim · `.claude/skills/cloudflare-workers/SKILL.md` workerd coverage
rule · `.claude/skills/em-review/SKILL.md` trigger policy + proposals block · `.claude/skills/retro/SKILL.md` metrics
from transcripts · EM memory updated.

## Proposals for the Lead (exact text)
- **P1 lead-playbook · "Log metrics"**, after "Bookkeeping never sits on the critical path." add: "Neither does system
  maintenance: role-file edits, /doctor, CLAUDE.md trims and EM proposals wait until every runnable task is running
  (step 2: INT-2b waited 8.2 min behind the role audit and /doctor, then 5.7 min for acceptance — 25% of wall-clock).
  Log per critical-path edge the dispatch lag (hand-back → dependent dispatch) and the acceptance lag (hand-back →
  Log line); both ≤ 2 min."
- **P2 lead-playbook · same bullet**: "Duration comes from the task notification, never from memory (S2-T3 was logged
  as ~24 min; the transcript shows 5m42s)."
- **P3 lead-playbook · "Big diffs"**: replace "Company mode can run end-to-end as the `team-build` workflow … otherwise
  spawn `team-lead` agents directly." with "Do not run the `team-build` workflow: it barriers on every team report
  (escalations wait; S2-T6/T7 would have waited ≈ 7 min), runs one integration engineer (INT-1 ∥ INT-2 would be
  serial, +6 min) and always runs QA. Spawn `team-lead` agents directly, with architect-written team sheets and
  pre-written briefs, until the workflow supports interim escalations and parallel integration tasks."
- **P4 lead-playbook · "Company mode"**, after item 6: "You may run one stream yourself only when it is the
  foundation/critical-path stream with ≤ ~6 tasks and there are ≤ 2 other teams (step 2's db stream: dependents
  dispatched within a minute, no sheet overhead). A third team gets a team-lead; your turns go to dispatch latency."
- **P5 lead-playbook · "What you may write yourself"**, append: "Edit these with Edit/Write, never sed/heredoc: the
  auto-mode classifier denies shell edits to CLAUDE.md, .claude/settings.json, docs/plan.md and memory files (three
  denied calls, three round trips in step 2)."
- **P6 dev-system §11 "Mechanisms"**, workflow bullet, append: "`team-build` has never run and is not used (step-2
  retro): it barriers on all team reports and serialises integration; direct team-leads until it is revised."
- **P7 settings.json** (owner decision under Amendment 3): move `"Bash(git commit:*)"` from `ask` to `allow`; keep
  push/reset/checkout under ask, so the baseline commit before each fan-out costs no prompt.
- **P8 engineering-manager.md**: Mode 1 header "(default; model fable; ≤ 8 minutes)" → "(model fable; ≤ 8 min per
  task; dispatched after team reports, integration tasks, incidents, round-2 reviews, over-box runs and first tasks
  in a new package or runtime — not after every clean one-round task)"; Mode 2 "reconstruct the timeline from the
  task sheet Log" → "reconstruct the timeline from the agent transcripts (`<session>/tasks/*.output`: first/last
  timestamp, distinct assistant message ids = turns, `tool_use` blocks, usage deduped per message id) and the Log".

## Experiment for step 4 ∥ 7 — "zero-lag tail"
Measured from transcripts: wall-clock ≤ 60 min from first fan-out to the full-stack e2e pass · critical-path ratio
≥ 0.75 · dispatch lag and acceptance lag ≤ 2 min on every critical-path edge · no engineer run > 20 min (span, fix
rounds included) · review rounds ≤ 1 per task · every team report has a `Demo` row with a real runtime proof · zero
escalations naming work absent from every task list at fan-out.

## Keep
Three streams balanced to the same minute (22:33:30); dependent dispatch < 1 min during fan-out; INT-1 ∥ INT-2 in
parallel; reviews overlapped with the last task; the 2.5-min agent-browser spike that made INT-2b possible.

## Escalate to research
None. Watchlist (1) "runs over the box" survived two retros but on wrong data; re-measure next step first.
