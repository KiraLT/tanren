# Handoff — 2026-10-27 21:46

## Where we are
Production = 4005455 (DEPLOY-25 21:27, QA-24 PASS 21:31: routes, API, bundle `entry-41de6edc…` with the DESK-1
strings in the lazy `home-…` chunk, signed-out visit = one `get-session`, SW). Before it: DEPLOY-24 8d202af 20:57,
DEPLOY-23 2fa8713 20:39, DEPLOY-22 fd7902d 19:59. HEAD = the retro commit on top of 14b1802 (GAL-8). Since 20:14,
31 commits, none reworked: PROG-2 resume + PROG-2b · NAV-1b You card + Start failure line · PROG-4 dynamic schedule +
NAV-3e "Continue day N" · WT-1/WT-2 weight entry (tap to type, step by equipment, per-exercise override, store v9) ·
NAV-F2 no API calls signed out · PROG-F2 · DESK-0/1/2 + fixes (aside frame owned by `Page`, Home recent activity +
week chart, You columns balanced) · tooling (`sign-push.sh`, `claude-md-check.sh` in the gate, subagent index hook) ·
EM batches 20–24 + the evening retro · gallery v22 (NV, PV, WT, DF sections; 74 v6b shots at `shots/v6b/`).
**Commits are unsigned by owner decision (20:27)**: `.git/config` `commit.gpgsign=false`; the owner pushes with
`./scripts/sign-push.sh` (one 1Password unlock signs every unpushed commit, then pushes); the Lead never runs it.
No live agents. Owner asks today = plan Amendments 24–34, all built and deployed. Every event: `docs/tasks/step-2.md`
Log; retro: `docs/retro/2026-10-27-evening.md`.

## Verified
- Gate green at 242 files / 3166 tests on 4005455 (engineer 21:24); every commit passed `scripts/index-check.sh`,
  `scripts/claude-md-check.sh` (5 × ok) and the forbidden-strings line on added lines.
- Desktop fill measured at 1280 × 900 seeded: Home column bottom 1135 / aside 761 (was 531 / 411); You columns 655 /
  708 (was 587 / 596); every aside's first card level with its column; phone unchanged (390 Activity header at 80).
- `scripts/sign-push.sh` on a scratch clone (Lead, 20:39): `N N N` → `G G G`, dirty/staged state byte-identical.
  `.claude/hooks/deny-index-ops.sh`: 11 cases pass incl. heredoc/quoted text; 0 real denials in hours 2–3.
- Gallery script plain run on HEAD: missing 0, duplicates 0, exit 0 (GAL-8); Artifact v22 serves the 74 v6b shots.

## Not verified / known broken
- Expo Go crash (EG-1, `PushNotificationIOS`): needs the owner's red-screen shot or a tunnel session; PWA is the route.
- Home-screen app: tab labels clipped on the owner's phone (18:08 shot); asked to remove and re-add.
- `useProgramDetail` has no refocus re-read (detail left open across midnight keeps "Done today" until a write).
- You 1280 still has room below both columns (design §3: needs an all-time-totals surface, deferred).
- WT-1: phone keyboard overlap of the inline field not verifiable headless; web focus outline kept while editing.
- Gate log prints vitest's fork-pool `MaxListenersExceededWarning` (upstream, exit 0, known noise, SPK-ML).
- The gallery Artifact sits at its 511-file cap: every new section needs a same-publish removal until GAL-9.

## Next actions (in order)
1. **Speed experiment (retro 2026-10-27 evening, playbook tactic 11): commit at land points only** — a deploy base,
   a shared-file release a live task waits for, or the hour mark; Log/handoff/gallery edits ride with the next
   land-point commit; an APPROVE's shoulds ride with the next task on those files (or one sweep per hour); the
   reviewer dispatch precedes any commit. Metric: Lead commits/h ≤ 8 (was 18) AND report → dependent-dispatch p90
   ≤ 2 min (was 6), from the main-session `.jsonl` + task transcripts; guard: rounds > 1 and leak incidents
   unchanged (0 leaks this evening). If it holds one step, append the retro's P2 paragraph to `docs/dev-system.md`.
2. GAL-9 (sonnet, box 8): a second private "Tanren screens — archive" Artifact with the superseded sections
   (v1–v3 Forge rounds, the 60 store-only v1 shots copied server-side via `files: {artifact, path}`), then drop them
   from the live gallery; both URLs in this file and in memory `tanren-review-gallery`.
3. Candidates: `loadGarminConnected` direct test, `useStep` `catchTag`, `useProgramDetail` refocus, You all-time-totals
   card (design first), EG-1 if the owner sends the shot.
4. Parked: STLS-F7, G-F1b, SEC-1c, LOCK_TIMEOUT UX, ThemeProvider `data-theme`, `get_overview` `summarize` via
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
- A landed report's reviewer is the Lead's next tool call, before any commit, Log line or publish (retro evening).
- Log appends take `$(date +%H:%M)` in the same shell command; estimated stamps drifted up to 3 min this evening.
- Deploy cadence: ≤ 1 "reopen the app" ask per hour; QA-light (bundle strings + api request list) for follow-ups;
  production literals live in the route's lazy chunk, not the entry bundle.
- A brief that says "phone unchanged" needs a 390 capture of every touched route (DESK-R: an 8 px shift slipped).
- Nutrition captures need the seeded worker + magic-link sign-in; the demo seed has no food/health rows.
- Stale Metro: kill the pid and `expo start --clear` after ALL edits; a page reload does not pick up `src/ui` edits.
- A VS Code reload kills every live agent: announce "Safe to reload now" only when no writer is mid-edit.
- zsh: `read -a` is bash (`-A`); read a failing loop's error before blaming the known cause.
