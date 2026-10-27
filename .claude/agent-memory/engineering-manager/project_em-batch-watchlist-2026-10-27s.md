---
name: em-batch-watchlist-2026-10-27s
description: EM batch 23 items 133–138 — unguarded authenticated reads (whenSignedIn), CLAUDE.md token gate (check:claude-md), border-side pixel arithmetic, shared symbol belongs in the foundation task, exclusion-regex staging near-miss, deploy cadence (≤ 1 reopen ask/hour), pnpm MaxListeners noise
metadata:
  type: project
---

Batch 23 (2026-10-27 20:52–21:10; NAV-F2/F2R, CMD-CHECK, DESK-D, DESK-0, R-F, QA-22/23, DEPLOY-23/24, index hook hour 2).

133. **Unguarded authenticated reads**: QA-22 found a signed-out device calling authenticated endpoints; NAV-F2 wrapped sync rounds + `useGarminConnected` in `whenSignedIn` (`apps/mobile/src/services/CurrentUser.ts`). reviewer.md + react.md now name the wrapper. Watch: any new hook with an API read on a mounted screen — the reviewer should cite the line, not QA find it.
134. **CLAUDE.md token gate**: `pnpm check:claude-md` (2 s) is in `pnpm check`; `.allow` has 4 tokens with reasons. Watch: allowlist growth (> 8 = regex wrong) and whether engineers run it after editing a CLAUDE.md line (brief template checkbox added).
135. **Border-side arithmetic**: design said 784, measured 785 because the hairline is `borderLeft` inside the aside box. architect + ui-check rules. Watch: next desktop measurement vs design — target 0 "spec corrected after the fact" ratifications.
136. **Shared symbol in the foundation task**: DESK-2 waited on DESK-1 for the `summary` prop → one 12-min box serial on one engineer. architect rule: "after X" names file+symbol; the shared symbol lands in the foundation task so siblings run in parallel. Watch: next design with "after X" between two siblings — should be ≤ 1 per sheet.
137. **Exclusion-regex staging**: an exclusion filter let two code files into a process batch; the ABORT guard caught it. Playbook: explicit path list, guard last. Watch: ABORT guard firing again = the stager was wrong again.
138. **Deploy cadence**: two reopen asks in 18 min (DEPLOY-23/24). Playbook: ≤ 1 reopen ask/hour unless the owner waits for a specific fix; QA-light for follow-ups. Watch: reopen asks per hour in the Log.

Hook hour 2: 0 denials in 8 transcripts after 20:50 (only match = the EM brief's own text). Item 127 closed unless a denial returns.
Gate noise: `MaxListenersExceededWarning: 12 error listeners added to [Socket]` from the pnpm node pid, printed right after `biome ci` output (i.e. at `pnpm typecheck` → `pnpm -r typecheck`), in 4 gate runs 20:14–20:55, exit 0. Not vitest (socket listeners, not worker threads). Spike question handed to the Lead; not fixed.
Metrics: engineers 4–9 min on 8–15 boxes (boxes ≈ 1.7× actuals, harmless), fix rounds 2–3.5, reviews 1.3–2, QA 1.5, deploys ≈ 3, 23 commits/52 min, 0 rework. Fastest lever next hour: foundation task carries shared interfaces so sibling tasks run in parallel (item 136).
