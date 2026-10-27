---
name: em-batch-watchlist-2026-10-27b
description: EM batch 8 watchlist items 46–50 (spike secrets/servers, shared-union fills, pnpm FIRST_FAIL misread as memory, wave-commit import test, mid-box owner overrides) with the metrics to re-check next batch
metadata:
  type: project
---
Watchlist after EM batch 8 (2026-10-27, commits fe602ef..b00ce12):
46. Spikes: any secret byte in a transcript (grep `eyJ` / key prefixes in spike outputs) and any server alive after the report (ps on the spike's port). Rules now in spike.md.
47. Shared-union tasks: does a task that adds a literal leave another stream's exhaustive consumer red? Check root gate colour right after each `packages/shared` landing.
48. `SIGKILL` in engineer reports: it is pnpm `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` (sibling aborted after the first package's exit 1), seen 4 times (2026-10-21, 3× 2026-10-27). If a report still calls it memory, the engineer.md note did not land in that agent (role-file lag, see dispatch observations). No concurrency cap was applied — the Lead's "three concurrent gates" reading was wrong.
49. Wave commits: team-lead interims must say "no W<n>-only commit" when files import in-flight symbols; count HEADs that fail a clean-worktree build (target 0).
50. Lead rulings in security/trust areas: count fix rounds whose root cause is a Lead predicate (IDENT-1 = 1). P1 (rulings-as-questions paragraph) proposed to the lead-playbook; verify it was applied before counting again.

**Why:** these were batch 8's five non-clean items; each has a new rule whose effect is measurable in one batch.
**How to apply:** re-check 46–50 in batch 9, drop the clean ones, escalate repeats as proposals.
