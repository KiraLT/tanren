# Handoff — 2026-10-27 19:20

## Where we are
Production = 9da64b8 (DEPLOY-20 18:51 real clock: confirm dialogs, free workout, Today copy with a program
due, insight wrap, program row press; DEPLOY-19 18:04 before it). HEAD = 2125273 (CONFIRM-F label fix, after the deploy). Live: PROG-3 weights (opus), NAV-2 Train hub (opus). Committed since DEPLOY-19: confirm dialogs on 8 dangerous actions (cc3f0d1), Today empty
copy when a program is due (2c014ea), insight wraps to two lines (027295a), CLAUDE.md diets (e24fc6a,
1465092), retro v6 + playbook P1–P7 (562683f, d223867), designs with briefs: free workout (ADR-0028),
navigation v2 (ADR-0029; owner confirmed Merge 19:07: Home · Train · Activity · You, no Start tab button,
weekly review in this round), program player v2 (weights per set, resume, row press; §d dynamic schedule and
§e sets per exercise being added), ADR-0027 no Tailwind/shadcn. Owner asks today = plan Amendments 24–33.
Live agents and resume ids: `$S/live-agents.txt` (session scratchpad); every event: `docs/tasks/step-2.md` Log.

## Verified
- DEPLOY-19 on production headless (18:10): `viewport-fit=cover`, `font-synthesis: none`, `crossOriginIsolated`
  true, page errors empty, `/health` ok. Service worker (17:31): controller after one reload, 77 precached
  URLs, offline reload renders the shell.
- Root gate green at 2986 tests with FREE-1 + the header fix in the tree (engineer, 18:42); the confirm set
  passed `scripts/index-check.sh` before cc3f0d1.
- EAS Update published 17:35 (branch production, runtime exposdk:58.0.0, group bbfd5575); App Store Expo Go
  58.0.5 runs SDK 58 (itunes lookup) — but the update crashes in Expo Go (below).
- `scripts/index-check.sh` typechecks the staged content in ≈ 1.6 s; `scripts/deploy.sh` is the deploy
  recipe (`DEPLOY_DIR` defaults to the git-ignored `.deploy/`).

## Not verified / known broken
- Expo Go: "tried to access a native module that doesn't exist" = RN `PushNotificationIOS` emitter; the
  module is absent from the Expo Go 58.0.5/58.0.7 binaries (EG-1, `$S/eg1/`, spike memory); the trigger is
  unknown — needs the owner's red-screen screenshot (asked 3×) or an `expo start --tunnel` session he scans.
  The home-screen PWA is the iPhone route meanwhile.
- Home-screen app (owner shot 18:08): tab labels still clipped and a "Today" title halo although the
  deployed HTML has the fix → owner asked to remove and re-add the app; if still clipped: a diagnostics
  readout (env() values, standalone flag, tab-bar box) and the Dynamic Type overflow of the 51 px tab items.
- Second tab on the same origin: blank ≈ 6–12 s, then "Tanren is open in another tab" (LOCK_TIMEOUT UX).
- `docs/design/screens/free/UI-FREE-4.png` shows the pre-fix "Target 0 kg × 0" header.
- `docs/design/navigation-v2.md` still says "Feed"; ADR-0029 (Activity) wins.

## Next actions (in order)
1. PROG-3 report → PROG-R-style review → commit → PROG-5 sets per exercise; NAV-2 report → review → commit
   → NAV-1 You + Activity rename. Deploy after each reviewed set (`scripts/deploy.sh`, verify headless).
2. Running now in parallel: NAV-2 Train hub (opus, `docs/tasks/navigation-briefs.md`;
   the Activity rename happens once, in NAV-1 or NAV-2) and PROG-3 weights + stats (opus 20,
   `docs/tasks/programs-player-briefs.md`). Then PROG-2 resume → PROG-4 dynamic schedule → PROG-5 sets per
   exercise + 12-week content; NAV-1 You → NAV-3 Home → NAV-4 weekly review → NAV-R / NAV-Q. R line
   before every commit; DEPLOY after each reviewed set.
3. EM batch 18 report (running) → apply its proposals, commit.
4. Gallery: add the UI-FREE, CONFIRM-1 and nav-v2 shots (fix GAL-5 first: `gallery.mjs` resolves one
   screens dir). Nav contact sheet: https://claude.ai/artifact/9JSJnWx6RRLyX56iH4ftwc.
5. Follow-ups on the sheet: STLS-F7, G-F1b, SEC-1c, LOCK_TIMEOUT UX, ThemeProvider `data-theme` on the
   in-app switch, mobile CLAUDE.md second trim (16.2k → ≤ 12k chars), Biome rule for raw hex outside
   `src/ui` (EM-18 decides), `get_exercise_history` 0-kg PR check (PROG-3 reports).

## Decisions for the owner
- ADR-0027 styling stack, ADR-0028 free workout, ADR-0029 navigation v2 — accepted under Amendment 3
  (0029 confirmed by the owner); override by message.
- Open: the Expo Go path (needs the screenshot); two-device resume of program days (device-local chosen).

## Gotchas learned this session
- `/doctor` cannot be delegated (user-invocation only); the Lead runs its checks itself.
- Never run pnpm inside a copy that links the real `node_modules`: it rewrites the real `.bin` shims.
- agent-browser: re-run `set viewport` after every `open`; after a screenshot the page can be `hidden`
  (RNW Modals never arm Escape/focus) → `close`, `open`, `set viewport`, `open` before a capture.
- A review brief carries the engineer's Verification section verbatim (FREE-R had no screenshots).
- A forbidden-string check over `git diff --cached` must read added lines only (a removed spec line tripped it).
- iOS may capture a home-screen web app's viewport settings at install — re-add after a `viewport-fit`
  change (unconfirmed).
- A VS Code reload kills every live agent: announce "Safe to reload now" only when no writer is mid-edit.
