# Handoff — 2026-10-27 21:29

## Where we are
Production = 4005455 (DEPLOY-25 21:27; QA-24 light running — bundle strings, signed-out network list, SW). Before
it: DEPLOY-24 8d202af 20:57 (QA-23 PASS), DEPLOY-23 2fa8713 20:39 (QA-22 PASS), DEPLOY-22 fd7902d 19:59. HEAD =
4005455. Since 20:14, 30 commits, none reworked: PROG-2 resume + PROG-2b tests · NAV-1b You card + Start failure
line · PROG-4 dynamic schedule + NAV-3e "Continue day N" · WT-1/WT-2 weight entry (tap to type, step by
equipment, per-exercise override, store v9) · NAV-F2 no API calls signed out · PROG-F2 · DESK-0/1/2 + fixes
(aside frame owned by `Page`, Home recent activity + week chart, You columns balanced) · tooling (`sign-push.sh`,
`claude-md-check.sh` in the gate, subagent index hook) · EM batches 20–23 · gallery v20 (NV, PV, WT, DF
sections). **Commits are unsigned by owner decision (20:27)**: `.git/config` `commit.gpgsign=false`; the owner
pushes with `./scripts/sign-push.sh` (one 1Password unlock signs every unpushed commit, then pushes). Live: EM-24
(fable). Owner asks today = plan Amendments 24–34, all built and deployed. Live ids, EM lists: `$S/live-agents.txt`;
every event: `docs/tasks/step-2.md` Log.

## Verified
- Gate green at 242 files / 3166 tests on HEAD (engineer 21:24); every commit passed `scripts/index-check.sh` (≈ 2 s,
  `ok tabs`), `scripts/claude-md-check.sh` (5 × ok) and the forbidden-strings line on added lines.
- Desktop fill measured at 1280 × 900 seeded: Home column bottom 1135 / aside 761 (was 531 / 411); You columns 655 /
  708 (was 587 / 596); every aside's first card level with its column (81 / 137 / 137 / 77 / 77); phone unchanged
  (390 Activity header back at 80 after the DESK-R fix).
- `scripts/sign-push.sh` on a scratch clone (Lead, 20:39): `N N N` → `G G G`, dirty/staged state byte-identical, real
  repo untouched. `.claude/hooks/deny-index-ops.sh`: 11 cases pass incl. heredoc/quoted text; 0 real denials since.
- Signed-out production visit sends exactly one request (`GET /api/auth/get-session`), QA-23.

## Not verified / known broken
- Expo Go crash (EG-1, `PushNotificationIOS`): needs the owner's red-screen shot or a tunnel session; PWA is the route.
- Home-screen app: tab labels clipped on the owner's phone (18:08 shot); asked to remove and re-add.
- `useProgramDetail` has no refocus re-read (detail left open across midnight keeps "Done today" until a write).
- You 1280 still has room below both columns (design §3: closing it needs an all-time-totals surface, deferred).
- WT-1: phone keyboard overlap of the inline field not verifiable headless; web focus outline kept while editing.
- Gallery script's plain run lists 74 `programs-v6b` paths as missing (PNGs live in `v6b/`; the artifact has them) →
  GAL-8 decision pending from EM-24.
- Gate log prints vitest's fork-pool `MaxListenersExceededWarning` (upstream, exit 0, known noise).

## Next actions (in order)
1. QA-24 → tell the owner to reopen the home-screen app twice (one ask for DEPLOY-25).
2. EM-24 report → apply proposals (playbook lines are the EM's; dev-system/root CLAUDE.md mine) → commit.
3. `/retro` for the 2026-10-27 evening (v6–v7 + navigation v2 + player v2 + weight entry + desktop fill): metrics from
   the transcripts, one speed experiment; then `/handoff`.
4. Candidates after that: GAL-8 (v6b img paths), `loadGarminConnected` direct test, `useStep` `catchTag`,
   `useProgramDetail` refocus, You all-time-totals card (design), EG-1 if the owner sends the shot.
5. Parked: STLS-F7, G-F1b, SEC-1c, LOCK_TIMEOUT UX, ThemeProvider `data-theme`, `get_overview` `summarize` via
   shared `unitOf`/`bestSet`, Apple Health / Live Activities (paid program only).

## Decisions for the owner
- ADR-0027 styling, ADR-0028 free workout, ADR-0029 navigation v2, ADR-0026 amendment (dynamic schedule) —
  accepted under Amendment 3; override by message.
- Weight entry (Amendment 34): inline typing, step by equipment, device-local override (no ADR; a roaming step
  would be one later). Two-device resume: device-local. Signing: unsigned commits + `sign-push.sh` (owner, 20:27).
- Desktop fill (`docs/design/desktop-fill.md`): Home recent activity + week chart, You columns; no new tabs/routes.

## Gotchas learned this session
- Only the Lead commits (hook-enforced for subagents, text-matched with heredoc bodies and quotes stripped). Stage
  by explicit path list, never by exclusion; read `git diff --cached --name-status`; the ABORT guard
  (`^apps/|^packages/|^scripts/` in a docs/process batch) is the last check. A side-index snapshot is content,
  never a tree (COMMIT-BASE). Independent batches behind a blocker go as pathspec commits.
- Deploy cadence: ≤ 1 "reopen the app" ask per hour; QA-light (bundle strings + api request list) for follow-ups.
- A brief that says "phone unchanged" needs a 390 capture of every touched route (DESK-R: an 8 px shift slipped).
- Nutrition captures need the seeded worker + magic-link sign-in; the demo seed has no food/health rows.
- Stale Metro: kill the pid and `expo start --clear` after ALL edits; a page reload does not pick up `src/ui` edits.
- A VS Code reload kills every live agent: announce "Safe to reload now" only when no writer is mid-edit.
- zsh: `read -a` is bash (`-A`); the 1Password SSH agent re-locks minutes after an unlock (moot now).
