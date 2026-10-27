# Handoff — 2026-10-27 20:17

## Where we are
Production = fd7902d (DEPLOY-22 19:59: navigation v2 Home · Train · Activity · You, one Start flow, `/today`
→ `/home`, unmatched routes → Home; DEPLOY-21 19:47 before it: Train hub, Activity rename, weights per set,
sets per exercise with the rewritten 12-week program, unit-aware PRs, weekly review `/review`). HEAD =
bef2267 (PROG-2 resume-a-day, 19 paths, PROG-R5 APPROVE) on c9ca55d (EM batch 20); both signed at 20:14–20:16 once
the owner unlocked 1Password (it re-locks after its auto-update; retry loop recipe below). Built, in review: NAV-1b You "This week" card + Start failure caption (NAV-1bR). Building:
PROG-4 dynamic schedule + Up-next "Continue day N" (opus 20), PROG-2b schema tests (sonnet 8), WT-1 tap-to-type
weight entry + step per exercise (opus 20, Amendment 34, `docs/design/weight-entry.md`). Owner asks today =
plan Amendments 24–34. Live ids, the commit plan and the EM-21 list: `$S/live-agents.txt`; every event:
`docs/tasks/step-2.md` Log.

## Verified
- QA-21 on production (20:00): every route 200, manifest `start_url /home`, SW active, COOP/COEP, `/health`
  ok, no console errors; the installed PWA's cached `/today` redirects through `+not-found.tsx`.
- Root gate green at 3123 tests with NAV-1b in the tree (engineer, 20:05); `scripts/index-check.sh` green on
  the PROG-2 snapshot in 2 s (now also prints `ok tabs`: APP_NAV names == `(tabs)/*.tsx`).
- Commit discipline (EM-19/20): engineers never stage; the Lead reads `git diff --cached --name-status` before
  every commit; shared files land one stream's hunks via `-U0` patch + `git apply --cached --unidiff-zero`.
- Repo-wide forbidden-strings grep (plan Amendment 22) is clean outside plan.md's owner quote.

## Not verified / known broken
- Expo Go: "tried to access a native module that doesn't exist" (`PushNotificationIOS`, EG-1, `$S/eg1/`);
  trigger unknown — needs the owner's red-screen screenshot or an `expo start --tunnel` session. PWA is the
  iPhone route meanwhile.
- Home-screen app: tab labels clipped on the owner's phone (shot 18:08); asked to remove and re-add the app
  (doubly useful now that `start_url` is `/home`).
- Up-next card shows "Start day N" for an in-progress program day (PROG-R5) → PROG-4 Part B (NAV-3e).
- Home 1280: aside top 16 px above the column, lower half empty (QA-21); You 1280 ≈ 200 px empty below both
  columns (NAV-1b). `docs/design/navigation-v2.md` §3 You line lags the build (card on the Setup column).
- Second tab on the same origin: blank ≈ 6–12 s, then "open in another tab" (LOCK_TIMEOUT UX).

## Next actions (in order)
1. NAV-1b fix round (stale failure caption on blur, reviewMath extraction; running) → commit NAV-1b's 10 paths (R line, index-check) → truth up navigation-v2.md §3.
2. PROG-2b, PROG-4 (+ NAV-3e), WT-1 reports → PROG-R6 (PROG-4 + PROG-2b) and WT-R (sonnet 8) → commits →
   DEPLOY-23 (`MIGRATE=1 ./scripts/deploy.sh`; store v8/v9 are device-local, no D1 migration) → verify
   headless → owner reopens the app twice.
3. EM batch 21 (list in `$S/live-agents.txt`) → apply → commit; `apps/mobile/CLAUDE.md` reported lines +
   second diet (16.5k → ≤ 12k) as one sonnet task once no live hunks; gallery update with nav-v2/PROG/WT shots.
4. Parked: EG-1, STLS-F7, G-F1b, SEC-1c, LOCK_TIMEOUT UX, ThemeProvider `data-theme`, `get_overview`
   `summarize` via shared `unitOf`/`bestSet`, Apple Health / Live Activities (paid program only).

## Decisions for the owner
- ADR-0027 styling stack, ADR-0028 free workout, ADR-0029 navigation v2 (owner confirmed Merge, Activity, no
  Start tab), ADR-0026 amendment dynamic schedule — accepted under Amendment 3; override by message.
- Weight entry (Amendment 34): inline typing, step by equipment, device-local override (no ADR; roaming step
  would be one later). Two-device resume of program days: device-local chosen.

## Gotchas learned this session
- `1Password: failed to fill whole buffer` = 1Password locked after an auto-update restart: ask the owner in
  bold, keep the index staged, retry in a background loop; never change signing or commit unsigned.
- An engineer's `git mv` got swept into another commit (a04b551); engineers never stage, the Lead checks the
  cached list, and `index-check` compares APP_NAV with the tab files.
- Approved-but-uncommitted files that a follow-on must edit: snapshot their content into a side index
  (`GIT_INDEX_FILE=$S/x.index git read-tree HEAD && git update-index --add -- <paths>`), index-check it; to
  commit, load only those entries into the main index on the current HEAD (`ls-files -s | update-index
  --index-info`), `write-tree` + `commit-tree -S -p HEAD`, and read the `--stat` file count before `update-ref`
  (COMMIT-BASE 20:15: a tree based on the older HEAD reverted the EM-20 batch for a minute).
- Stale Metro bundles hit five agents: restart `expo start --clear` after edits before the first ui-check.
- agent-browser: `set viewport` after every `open`; a local-only run = `EXPO_PUBLIC_DEV_USER_ID` + a dead
  `EXPO_PUBLIC_API_URL`; a signed-out empty store shows the Landing on every route.
- A review brief carries the engineer's Verification section verbatim; a paraphrase costs a round.
- A forbidden-string check reads added lines only (`git diff --cached | grep '^+'`).
- A VS Code reload kills every live agent: announce "Safe to reload now" only when no writer is mid-edit.
