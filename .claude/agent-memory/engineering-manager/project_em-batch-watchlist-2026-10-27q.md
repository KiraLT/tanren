---
name: em-batch-watchlist-2026-10-27q
description: EM batch 21 items 121–126 — side-index snapshot committed as a tree (COMMIT-BASE), mounted-tab stale state, copied shared math behind an Out list, Metro --clear timing, sonnet fix rounds, hooks see agent_type
metadata:
  type: project
---

Batch 21 (2026-10-27 20:06–20:25; PROG-2/R5, PROG-2b, NAV-1b + fix, NAV-1bR, WT-D, COMMIT-BASE).

121. **A `GIT_INDEX_FILE` snapshot is content, never a tree**: `commit-tree -p <newer HEAD>` on the snapshot's `write-tree` reverted EM-20's 11 paths (631ca50, caught by the `--stat` count 30 ≠ 19, replaced in 1 min). Playbook now: pathspec-commit queue behind a blocked signature, `ls-files -s | update-index --index-info` to re-apply, stat count == path list before `update-ref`. Watch: any commit whose `--stat` file count differs from the Log's path count.
122. **Tab screens never unmount** (`(tabs)/_layout.tsx` has no `unmountOnBlur`): screen-local failure/notice state survives round trips. Pattern `useFocusEffect` cleanup + target reset + `live` ref existed (FinishWorkout) but no rule named it → react.md + reviewer checklist. Watch: next tab-screen hook with `useState` failure text.
123. **Out lists produce copies**: NAV-1b copied four `reviewMath` rules because `review/*` was Out. engineer rule 2 + brief template Out line now say "extract there, one hunk, `shared with`, never copy". Watch: reviewer `should: extract to` findings — target 0 after this.
124. **Metro stale bundles, 6th and 7th time** (PROG-2, NAV-1b): agents restarted `--clear` and then edited again. Rule reworded to "after the LAST edit, before the FIRST capture". If it recurs, propose a hook or a ui-check script that compares the served bundle hash against a string from the diff.
125. **Fix rounds from file:line findings are sonnet-shaped** (PROG-2b 3.5 min on 4 findings; NAV-1b fix 3.2 on a 6 box). Playbook Fix loops now says so. Watch actuals: if an opus fix round stays < 4 min twice more, lower the default box to 6.
126. **Hooks can see the role**: Claude Code hook input carries `agent_id` + `agent_type` when fired inside a subagent (docs read 2026-10-27), so a settings.json PreToolUse `Bash` hook can deny `git add|mv|rm|commit|reset|checkout` whenever `agent_type` is set (Lead main session has none). Proposed to the Lead; registering hooks in settings was DENIED to the Lead once by the auto-mode classifier (2026-10-26) → owner may need to add the entry.

Also: NAV-F1's `mkdir` denial was the built-in $VAR-path safety check, not the ask list — `Bash(mkdir:*)` is already allowed; no settings change (item 118 stands).
