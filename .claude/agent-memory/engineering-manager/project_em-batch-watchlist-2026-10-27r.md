---
name: em-batch-watchlist-2026-10-27r
description: EM batch 22 items 127–132 — index hook text-match false positives (heredocs quoting git), no scratch-path exemption (symlinked .git), fix-round box 6 decided, StoreEvents stream death, gallery rows src folder, unexported design symbols
metadata:
  type: project
---

Batch 22 (2026-10-27 20:25–20:45; PROG-4 + fix, WT-1/WT-2, SIGN-1/1b, GAL-6, PROG-R6/WT-R/SIGN-R, index hook hour 1).

127. **Index hook matches command TEXT**: `deny-index-ops.sh` greps the whole Bash command, so a python/heredoc that merely QUOTES `git commit` (the EM editing the playbook) is denied, as are scratch-clone git tests (SIGN-R, SIGN-1b). Cost ≈ 1 min each. Rule now: doc text mentioning git ops goes through Edit/Write; git-script tests are the Lead's. Watch: hook denials in agent transcripts (`grep -l "Only the Lead touches" tasks/*.output`) — target 0 per hour; if > 2, propose tightening the regex to ignore quoted strings.
128. **No scratch-path exemption**: argued against — a path regex (`git -C /private/tmp/claude-501/…`) is defeated by `cd` chains, a second `-C`, and a symlinked `.git` under $S pointing at the real repo; proving the target is a separate repo needs `git rev-parse --git-common-dir` resolution inside the hook (more code than two 1-min Lead tests). Revisit only if git-script tasks become weekly.
129. **Fix-round box 6 DECIDED** (five actuals 2–3.5 min; item 125 closed). Watch: any fix round from file:line findings that overruns 6 → check whether the findings were really file:line.
130. **StoreEvents stream death** (WT-R should 1): per-event fallible effects without a catch end the stream. 9 `runForEach` sites: 7 `Effect.sync(setVersion)` (safe), useImportedActivity (Effect.match, safe), useStep (fixed WT-2). react.md bullet added. Watch: next hook that reads a repo per event — reviewer should cite the bullet, not rediscover it.
131. **Gallery rows `src` ≠ write folder** (GAL-6: 74 `programs-v6b/` rows, files in `v6b/`): ui-check + team-lead now require the plain-run `missing files (0)` as the pasted proof. Watch: next publish's missing count.
132. **Design names an unexported symbol** (WT-1 `roundId` in `cues.ts`): architect rule "Named symbols are exported". Watch: engineer reports with "could not use <symbol>, used <other>".

Also: PROG-R6's consumer grep (`useDueToday` outside the file list) is now a named reviewer checklist line; signing section rewritten to the unsigned-local / owner-runs-sign-push policy with the pathspec-queue + side-index-content lessons kept as general blocker rules.
