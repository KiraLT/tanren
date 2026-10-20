---
name: retro-baseline
description: Owner primary process metric (wall-clock per step), step-1 baseline, repeat-waste watchlist with step-2 and step-3 (company-mode worker team) observations for the next retro
metadata:
  type: project
---

Owner (Lukas) said step 1 "progress was too slow"; wall-clock per step is the Lead's primary goal (2026-10-20).

**Why:** retros must compare against a baseline, and a waste that repeats in two consecutive retros triggers "Escalate to research".

**How to apply:** step 1 baseline (docs/retro/2026-10-20-step-1.md): ≈3h10m wall-clock, critical-path ratio ≈0.3, ≥2.6M tokens, 2 review rounds. Watchlist: (1) agent runs >20 min / no time box, (2) architect on critical path waiting on its own research, (3) stale pipeline docs (dev-system §3, build-step QA) vs lead-playbook short pipeline. Step 2 target: ≤95 min, ratio ≥0.6.

Step-2 observations to carry into the retro (2026-10-20):
- Watchlist (1) REPEATED: S2-T3 (opus) ran ~24 min on a 20-min box (brief file said 15); cause = toolchain VERIFY (workerd harness) bundled into the critical-path task. Fix applied: lead-playbook speed tactic 8 (spike proofs in parallel). Check in the retro whether any later task bundled a VERIFY again.
- Task-sheet Log lines now carry HH:MM, but the arithmetic is off (S2-T3 "22:12→22:18" labelled "~24 min"). Say so in the retro; propose the Lead write both the dispatch and the report timestamp from the clock, not from memory.
- Company mode (worker + mobile teams in parallel with the db stream) makes the full gate red for everyone; package-level fallback was documented 2026-10-20 (monorepo skill, engineer.md). Retro should check whether reports after S2-T3 used it.
- Lead dispatched S2-T3 with a 20-min box while docs/tasks/step-2-briefs.md still said 15: brief file and dispatch drift.

Step-3 observations (2026-10-20, first company-mode team = worker, ~50 min wall-clock):
- NEW watchlist (4): tests not in the target runtime. 45 Node tests green, `wrangler dev` 500 on every route (better-auth re-export under wrangler's esbuild bundle). Fix applied: runtime proof in charter template, team-lead.md, dev-system §11 rule 4, apps/worker/CLAUDE.md smoke recipe. Retro: check whether the mobile team had the same gap (Expo tests in Node vs Expo Go/web) and whether integration created the worker vitest-plugin project.
- Watchlist (1) REPEATED a third time: W-T2 +10 min, W-T3 +15 min over 15-min boxes (T3 bundled with R1 fixes on one continuation agent). Two consecutive retros → per dev-system §12 this now triggers a spike on external practice for time-box enforcement; propose it in the step-3 retro.
- Team-lead harness hand-backs (2) while children ran: new pattern specific to nested agents; fixed in team-lead.md; verify in retro that the mobile team-lead did not need nudges.

Step-6 mobile team (2026-10-20, company mode, ~55 min, team-lead/opus, 4 tasks, 1 review round + fix round, 51 tests):
- Watchlist (4) REPEATED (2nd time, after S3 worker): 51 Node tests green, no agent opened the app in a browser or Expo Go. Fixed structurally: charter Runtime proof clause for mobile/web (`ui-check`), `Demo` row in the team report, dev-system §11 rule 4; qa.md step 5 (Lead). Retro: check the first team report after this carries a real Demo row — if still missing, §12 escalation.
- Harness hand-back REPEATED (mobile team-lead needed a Lead nudge); sheet Log had no agent ids although step 5 asked. Fix: agent id is now a Log column written at dispatch (team-lead.md).
- Pattern: a rule added mid-step is invisible to agents already in flight (researcher spawned after the role was retired; agent ids not logged). Count a role-file failure only when the agent started after the edit.
- Cross-team contract gap (`LOCAL_USER_ID` → every push `forbidden` until INT-2) surfaced only at integration. Fix: charter "Assumes (cross-team)" list reconciled by the Lead before fan-out. Retro: did step-7 charters list assumptions?
- Package CLAUDE.md ownership moved to team-leads (write, Lead ratifies). Lead owes an ADR for the pnpm isolated linker + Expo SDK 58.
- `.biome/noMutation.grit` check 4 is syntactic; own methods named `push` trip it. Convention = rename. If it bites a third time, propose the Lead choose between a receiver allowlist or dropping check 4 for the `ReadonlyArray` type backstop.
