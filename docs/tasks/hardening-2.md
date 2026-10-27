# Hardening 2 — parked backlog + program editor steppers
Source: owner 2026-10-27 21:50 "Finish Hardening backlog and Program editor steppers" · Status: building · Started: 2026-10-27 22:25

Items (from `docs/handoff.md` "Parked" and `docs/design/weight-entry.md` §deferred): STLS-F7 generation check
on app writes · SEC-1c native Strava connect interstitial · G-F1b Garmin timezone nits · `get_overview`
`summarize` via shared `bestSet` · LOCK_TIMEOUT UX (second tab blank 6–12 s) · ThemeProvider `data-theme` on
in-app switch · WT-3 `CompactStepper` tap-to-type. Apple Health / Live Activities stay parked (paid Apple program).

Speed experiment in force (retro 2026-10-27 evening, playbook tactic 11): reviewer dispatch is the Lead's next tool
call after a report; one land-point commit for the batch (deploy base); shoulds ride with the fix round only when
blocking.

## Tasks
| id | title | role / model | box | files (exclusive) | status |
| --- | --- | --- | --- | --- | --- |
| H2-A | STLS-F7 gen check on app writes + SEC-1c native connect interstitial | engineer / opus | 20 | `apps/worker/src/api/Authentication.ts`(+test), `apps/worker/src/integrations/callbackRoutes.ts`(+test), `connect.ts`, `docs/design/integrations.md`, ADR-0022 sentence | running |
| H2-B | G-F1b timezone helper shared + `get_overview` best set via shared `bestSet` | engineer / sonnet | 12 | `apps/worker/src/integrations/GarminPull.ts`(+test), `apps/worker/src/mcp/nutritionTools.ts`, `apps/worker/src/mcp/tools.ts`(+test), new `apps/worker/src/time/profileZone.ts` | running |
| H2-C | LOCK_TIMEOUT UX (immediate "open in another tab" notice) + `data-theme` on in-app switch | engineer / opus | 15 | `apps/mobile/src/services/runtime.ts`(+test), `apps/mobile/src/hooks/useAuthGate.ts`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/ui/themePreferenceStore.web.ts`, `ThemeProvider.tsx` | running |
| H2-D | WT-3 `CompactStepper` tap-to-type (shared inline-edit module with `Stepper`) | engineer / opus | 15 | `apps/mobile/src/components/programs/{ProgramFields,ItemCard,DayForm}.tsx`, `programEdit.ts`, `apps/mobile/src/ui/Stepper.tsx`, new `apps/mobile/src/ui/inlineEdit.ts`(+test), `docs/design/weight-entry.md`, `docs/design/programs-player-v2.md` §2.9 heading | running |
| H2-R | reviews: one reviewer per report as it lands (opus for A and C, sonnet for B and D) | reviewer | 6 | read-only | todo |
| H2-Q | QA-light on production after the land-point deploy | qa / sonnet | 5 | tests only | todo |

## Done-criteria (summary; full briefs in the dispatch prompts, Log below)
- H2-A: a bumped app generation (sign out everywhere) makes the next authenticated app WRITE 401 within one request;
  native Strava callback shows the account email + Continue before the code exchange; web flow unchanged.
- H2-B: one `timezoneOf(userId)` used by GarminPull and nutrition tools; GarminPull tests assert the stored dates for
  22:30Z / 00:30Z / no profile / deleted profile; `get_overview` best set = shared `bestSet` (0-kg sets never win).
- H2-C: a second tanren.me tab shows "Tanren is open in another tab…" within 1 s (was 6–12 s) and still opens if the
  first tab closes within the wait; switching the theme in Settings sets `html[data-theme]` live on web.
- H2-D: tapping a CompactStepper value opens numeric entry (web number input / phone number pad), Enter/blur/Done
  commit, Escape cancels, ± commit first; range-clamped; `Stepper` and `CompactStepper` share one edit module.

## Log
- 2026-10-27 22:25 · Owner 21:50 "Finish Hardening backlog and Program editor steppers" → sheet created; H2-A (opus 20) ∥ H2-B (sonnet 12) ∥ H2-C (opus 15) ∥ H2-D (opus 15) dispatched in one message; disjoint files per the table. Experiment in force: reviewer first, one land-point commit.
- 2026-10-27 22:29 · H2-B report (sonnet, 3 min): profileZone.ts helper (pure zoneOfProfile/liveProfile; callers keep one D1 read), GarminPull 4 zone tests assert stored dates (deleted-profile new), get_overview best = shared bestSet, byWeightThenReps deleted, worker check green 898 tests. CONFLICT ratified: all-bodyweight best ranks by reps (shared rule), description says so. → H2-R-B (sonnet, box 6) dispatched as the next call.
- 2026-10-27 22:30 · H2-R-B (sonnet, 0.6 min) APPROVE: should = third timezone-rule copy in programTools.ts:569 (non-blocking) → folded into H2-B by resume (box 3, no extra commit); nit 0-rep loaded set theoretical. Ran the 3 test files: 67 passed.
- 2026-10-27 22:31 · H2-B fold-in done (1 min): programTools.ts enroll_program uses zoneOfProfile; worker check green 908 tests. H2-B ACCEPTED (9 paths listed); held for the land-point commit with A/C/D.
- 2026-10-27 22:32 · H2-C report (opus, 5m45s of 15): probe-then-wait lock, Waiting gate state, EmptyState notice at 0.4–0.8 s, self-open 234 ms after the holder closes, timeout path unchanged; data-theme set/removed on save; gate 245 files / 3202 tests green. Ratified: separate try/catch (storage vs attribute). → H2-R-C (opus, box 6) dispatched as the next call. Follow-up from the engineer: ui-check "Second tab" recipe uses a second --session (separate browser, no shared Web Locks) → fix the skill line (Lead).
- 2026-10-27 22:32 · ui-check "Second tab" recipe fixed by the Lead (same session `ab tab new`, close the holder in one Bash call, 1-s notice + self-open + timeout text).
- 2026-10-27 22:33 · H2-A report (opus, 7 of 20 min): gen check on Bearer writes (web session has no gen → row check stays), native Strava confirm page + POST (Cancel, frame-ancestors none, email escaped/never logged), email read in packages/db UserTokens (brief Decision over Out: ratified), second Bearer HMAC in Authentication.layer (provisionally ratified; Sessions.current identity refactor = follow-up candidate), gate 3202 green, wrangler smoke 401/400. → H2-R-A (opus, box 7, auth pass) dispatched as the next call.
- 2026-10-27 22:34 · H2-D report (opus, 7 of 15 min): inlineEdit.ts (pure latch + useInlineEdit) shared by Stepper and CompactStepper; CompactStepper value/onCommit, number-pad in place (no layout shift measured); enter* setters clamp→snap (tie up), typedNumber reused; 42 tests; gate 3202 green; 390 light+dark captures H2D-*. Docs marked built (weight-entry :36/:97, programs-player-v2 §2.9). → H2-R-D (opus, box 6) dispatched as the next call. Live: H2-R-A, H2-R-C, H2-R-D.
- 2026-10-27 22:35 · H2-R-C (opus, 1.7 min) APPROVE: should 1 bfcache return shows "close the other tab" with nothing to close (probe cannot evict; Waiting through the ≤ 5 s access-handle retry); should 2 no 390/light notice capture; nit databaseLockBusy one-shot semantics. Lead: fold all three into H2-C by resume (box 5; copy made true in both cases, bfcache repro, captures, doc line) — owner-visible copy on the integrations return path, worth the round before the deploy base.
- 2026-10-27 22:36 · H2-R-D (opus, 2 min) APPROVE: shoulds = field surface-on-surface (invisible without the browser focus ring) and no native Done for number-pad (docs :36 overclaim); nits Option.map side effect, adjustable role without actions (pre-existing). Lead: fold 1–3 into H2-D by resume (box 6) — phone-visible; the a11y actions gap stays a follow-up for Stepper + CompactStepper together.
- 2026-10-27 22:37 · H2-R-A (opus, 2.7 min, ran workerd project 27 tests) APPROVE: should = HEAD bypass of the native confirm gate (router serves HEAD via GET; `method !== "POST"` fix + test) → folded into H2-A by resume (box 4) with the two copy lines (ADR-0022:88, auth-v2:131); second Bearer HMAC judged correct and safe, Sessions.current identity refactor = separate brief. H2-C fold-in done (1 min): copy "Waiting for another Tanren tab", bfcache repro showed no notice (app Ready at 527 ms), captures H2C-waiting-390-dark + 1280-light, databaseLockBusy doc line; mobile check 1488 green → H2-C ACCEPTED. Live: H2-A fold-in, H2-D fold-in.
- 2026-10-27 22:38 · H2-A fold-in done (1 min): confirm gate `method !== "POST"` + HEAD test (fails on the old gate, passes now), ADR-0022/auth-v2 copy lines; worker check 909 green → H2-A ACCEPTED (12 paths). Live: H2-D fold-in only.
