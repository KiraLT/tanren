---
name: em-batch-watchlist-2026-10-27o
description: EM batch 19 items 109–114 — staged sweeps (git mv in a shared index), untracked heredoc appends despite the rule, future-task code comments, nested buttons in ListRow.trailing, Metro stale bundles, reviewer boxes 4× too long
metadata:
  type: project
---

Items 109–114 (2026-10-27 evening, NAV-2 / PROG-3 / NAV-4 / NAV-R / PROG-R).

109. **Staged sweeps**: any engineer `git mv`/`git add` lands in the next bare `git commit` of the Lead. Rule now in engineer.md rule 8 + playbook commit block (`git diff --cached --name-status` exact, `git commit -- <paths>`). Watch: `scripts/index-check.sh` is blind to `.expo/types`; propose a `(tabs)/*.tsx ↔ APP_NAV` consistency grep in the index check if a second sweep happens.
110. **Rule 6 exception stretched**: FREE-1 appended to an untracked hook with `cat >>`; PROG-3 appended three test files (allowed). The rule existed and was ignored → guard clause (`git ls-files --error-unmatch` in the same call). If it recurs, propose a PreToolUse hook on `cat >>.*\.(ts|tsx)` (Lead's settings).
111. **Future-task dependency as code comment** (NAV-4 `{/* NAV-4: until NAV-1 … */}`) — Amendment 23 marker. Rule in engineer.md Report + reviewer leftovers. Watch the NAV-1 diff: the marker must go with the row move.
112. **Nested pressables**: `ListRow.trailing` sits inside the row's Pressable (ListRow.tsx:186/201). react.md rule added. Watch other primitives with a `trailing`/`accessory` slot.
113. **Metro stale bundles** ×4 in one evening despite "Web Bundled" — ui-check line added. If re-capture rounds continue, propose `--clear` as the default in every ui-check recipe start line.
114. **Reviewer boxes**: opus single-stream reviews take 2–2.5 min (16–20 tool uses, ~90–116k ctx) — boxes of 10–12 were 4–5× real. Playbook says 6–8 now. Measure next batch.

**Why:** all six are system leaks the gate cannot catch; each cost a review finding or a re-run tonight.
**How to apply:** in the next Mode 1, grep transcripts for `git mv|git add` and `cat >>` in Bash tool_use, grep diffs for task-id comments (`grep -rn "[A-Z]\+-[0-9]\+:" apps/*/src apps/*/app --include=*.tsx`), and compare reviewer transcript spans to boxes.
