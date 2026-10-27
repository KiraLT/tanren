# Handoff — 2026-10-27 21:00

## Where we are
Production = 8d202af (DEPLOY-24 20:57, QA-23 PASS 20:59: routes, API, new bundle `entry-5ebe3a29…`, SW; a signed-out
visit sends only `get-session`; DEPLOY-23 2fa8713 at 20:39 before it). Owner asked to reopen the home-screen app twice. HEAD = 49fc849 (adds 2b88e7c refocus, 65784bb WT-2, 859262f PROG-F2, dcdb37d CLAUDE.md diet, 83d45bd EM-22, 8d202af NAV-F2,
49fc849 claude-md-check in the gate). Committed since the deploy:
bef2267 PROG-2 resume an unfinished program day · aac5628 PROG-2b tests · be62051 NAV-1b You "This week" card +
visible Start failure · 7c969ce PROG-4 dynamic schedule + NAV-3e Up-next "Continue day N" · 86209a6 process (EM-21,
index hook, gallery v14) · 5c3b2ed WT-1 weight entry (tap to type, step by equipment, per-exercise override) ·
2fa8713/1a99e43 `scripts/sign-push.sh` · 2b88e7c refocus re-read. **Commits are unsigned by owner decision
(20:27)**: `.git/config` `commit.gpgsign=false`; the owner pushes with `./scripts/sign-push.sh` (one 1Password
unlock signs every unpushed commit, then pushes). Live: WT-2 fix round (useStep stream survives a StoreError,
`WeightedEntry` key, player commit-then-step), PROG-F2 (DayCard desktop eyebrow), CLAUDE-DIET (mobile CLAUDE.md
lines + trim). Owner asks today = plan Amendments 24–34. Live ids, commit plan, EM-22 list: `$S/live-agents.txt`;
every event: `docs/tasks/step-2.md` Log.

## Verified
- Gate green at 241 files / 3156 tests with WT-1 + PROG-4 in the tree (engineers, 20:24–20:25); every commit
  passed `scripts/index-check.sh` (≈ 2 s, prints `ok tabs`) and the forbidden-strings line on added lines.
- `scripts/sign-push.sh` on a scratch clone (Lead, 20:39): 3 unsigned → `G G G` on the bare origin, dirty/staged/
  untracked state byte-identical, real repo untouched, second run "nothing to push".
- `.claude/hooks/deny-index-ops.sh` (PreToolUse Bash): denies `git add|mv|rm|commit|reset|checkout|rebase|…`
  when the hook input carries `agent_type` (subagents only); 9 cases tested; it already blocked a reviewer's
  scratch-repo git (by design — EM-22 may exempt scratchpad cwd).
- Gallery v19 (https://claude.ai/artifact/YD5RTPNpuPy9hmpQLhJADQ): NV1–31, PV1–11, WT1–3 + the 74 programs-v6b
  paths that had never been published.

## Not verified / known broken
- Expo Go crash (EG-1, `PushNotificationIOS`): needs the owner's red-screen shot or a tunnel session; PWA is the route.
- Home-screen app: tab labels clipped on the owner's phone (18:08 shot); asked to remove and re-add.
- `useProgramDetail` has no refocus re-read (detail left open across midnight keeps "Done today" until a write).
- Home 1280 aside top 16 px above the column + empty lower half; You 1280 ≈ 200 px empty below both columns.
- WT-1: phone keyboard overlap of the inline field not verifiable headless; web focus outline kept while editing.

## Next actions (in order)
1. DEPLOY-23 result → QA-22 (qa sonnet, box 6: routes 200, SW, console, Home → Train → program day, weight
   stepper tap-to-type) → tell the owner to reopen the app twice.
2. WT-2 + PROG-F2 reports → one combined review (sonnet, box 5) → commit → CLAUDE-DIET commit → DEPLOY-24.
3. EM batch 22 (list in `$S/live-agents.txt`) → apply → commit; retro at step end.
4. Parked: EG-1, STLS-F7, G-F1b, SEC-1c, LOCK_TIMEOUT UX, ThemeProvider `data-theme`, `get_overview`
   `summarize` via shared `unitOf`/`bestSet`, Apple Health / Live Activities (paid program only).

## Decisions for the owner
- ADR-0027 styling, ADR-0028 free workout, ADR-0029 navigation v2, ADR-0026 amendment (dynamic schedule) —
  accepted under Amendment 3; override by message.
- Weight entry (Amendment 34): inline typing, step by equipment, device-local override (no ADR; a roaming step
  would be one later). Two-device resume of program days: device-local chosen. Signing: unsigned commits +
  sign-on-push script (owner's ask 20:27).

## Gotchas learned this session
- Only the Lead commits; engineers never stage (hook-enforced now). Before every commit read
  `git diff --cached --name-status`; independent batches behind a blocker go as pathspec commits
  (`git commit -F msg -- <paths>`); a side-index snapshot is content, never a tree — load it with
  `ls-files -s | update-index --index-info` on the current HEAD and check the `--stat` file count (COMMIT-BASE).
- A VS Code reload kills every live agent: announce "Safe to reload now" only when no writer is mid-edit.
- Stale Metro bundles: finish all edits → `expo start --clear` → first capture; `set viewport` after every `open`.
- A review brief carries the engineer's Verification verbatim; file:line findings → same engineer, box ≤ 8.
- A forbidden-string check reads added lines only (`git diff --cached | grep '^+'`); plan.md's owner quote is the
  one allowed occurrence.
- zsh: `read -a` is bash; use `-A` or a `while read` loop (a commit loop failed on it, 20:22).
