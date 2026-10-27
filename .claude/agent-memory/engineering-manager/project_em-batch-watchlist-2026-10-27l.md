---
name: em-batch-watchlist-2026-10-27l
description: EM batch 17 watchlist items 97–100 — UI state rows with two producers, package managers in shared-node_modules copies, briefs that ask a cross-package question but scope it out, live-agents.txt nobody writes
metadata:
  type: project
---

Items 97–100 (batch 17, 2026-10-27 17:44):
97. **UI state rows keyed on a derived value.** health-module §6 keyed "No tracker connected" on `burned` None, which both a disconnected and a connected-before-first-pull user have; the "stale" row had no writer. Rule now in architect.md (condition in + condition out + writer per row). Watch: next UI spec with a state matrix — does every row carry a one-line condition?
98. **Package manager inside a copy sharing `node_modules`.** pnpm "installs" into the copy and rewrites the real tree's `.bin` shims. The Lead's brief prescribed it and its done-criterion (`git status`) could not see it. Rule in engineer.md; proposal: brief template line for scripts that touch the tree. Watch: any script/worktree brief without a node_modules proof.
99. **Cross-package question scoped out.** EAS-1 was told to *report* the NATIVE_RETURN_PREFIXES value with apps/worker out of scope → EAS-2 → EAS-3 serial (≈ 10 min). Watch: briefs whose Do list says "report the value to set" for a file outside Scope.
100. **Playbook P5 depends on `$S/live-agents.txt`**, which no rule writes (grep: only playbook:37). Proposed to the Lead: write it on every dispatch or drop it.

**Why:** these are the four leaks in a batch that otherwise ran 2–7 min per task with one round each.
**How to apply:** check 97 on every architect UI spec; 98 on every ops-script brief; 99 whenever a brief's Read-first poses a question about a package outside Scope.
