# Handoff — 2026-10-27 22:47

## Where we are
Production = 3176a11 (DEPLOY-26 22:42, H2-Q PASS 22:44: routes/health 200, new strings in the `_layout-…` and
`__common-…` chunks, push 401/401, Strava callback POST/HEAD with a bad state 400, signed-out visit = one
`get-session`, MCP 401). Before it: 4005455 (21:27), 8d202af, 2fa8713, fd7902d. HEAD = the Hardening-2 docs commit
on top of 3176a11. **Hardening 2 (owner 21:50 "Finish Hardening backlog and Program editor steppers") is DONE**
(`docs/tasks/hardening-2.md`): STLS-F7 generation check on app-token writes · SEC-1c native Strava confirm page
(email, Continue/Cancel, POST-only exchange, HEAD-safe) · G-F1b one profile-timezone rule (`time/profileZone.ts`)
for Garmin pull, nutrition and program tools · `get_overview` best set via shared `bestSet` · second-tab notice
within 1 s with self-recovery (`Waiting for another Tanren tab`) · `html[data-theme]` set on in-app switch ·
program editor steppers tap-to-type with one shared `ui/inlineEdit.ts` (accent ring, native Done). Four tasks, four
one-round APPROVEs, four 1-min fold-ins, ONE land-point commit. Still parked: Apple Health / Live Activities (paid
Apple program). **Commits are unsigned by owner decision (20:27)**: the owner pushes with `./scripts/sign-push.sh`;
the Lead never runs it. No live agents. Every event: `docs/tasks/hardening-2.md` and `step-2.md` Logs.

## Verified
- Gate green inside `scripts/deploy.sh` for 3176a11 (deploy26.log); engineers' package checks: worker 909 tests,
  mobile 1488, root 3202 before the fold-ins; `scripts/index-check.sh` green at the commit.
- Second tab: notice at 409–811 ms, self-open 234 ms after the holder closes, timeout copy unchanged (H2-C ui-check,
  same-session tabs). bfcache return (external page and back): no notice, Ready at 527 ms.
- Editor field: open field 77,428,145,464 inside the 44-px row, ± boxes unchanged, accent ring `rgb(194,65,12)`.
- STLS-F7: gen-behind token → 401 on writes, equal → 200, stale-gen GET → 200 (tests); SEC-1c: 8 tests incl. HEAD.
- Experiment data point 1 (EM-25): Lead latency median 0.85 / p90 1.5 min (was 2 / 6), 4 commits/h (was 18),
  0 engineers parked on the Lead, no box overrun.

## Not verified / known broken
- Native (Expo Go) branches of H2-D (check-icon Done) and H2-A confirm page render: not driven; web proofs only.
- Expo Go crash (EG-1, `PushNotificationIOS`): needs the owner's red-screen shot or a tunnel session; PWA is the route.
- Home-screen app: tab labels clipped on the owner's phone (18:08 shot); asked to remove and re-add.
- `useProgramDetail` has no refocus re-read (detail left open across midnight keeps "Done today" until a write).
- You 1280 still has room below both columns (design §3: needs an all-time-totals surface, deferred).
- Gate log prints vitest's fork-pool `MaxListenersExceededWarning` (upstream, exit 0, known noise, SPK-ML).
- The gallery Artifact sits at its 511-file cap; five new captures wait for GAL-9: `H2C-waiting-390-dark`,
  `H2C-waiting-1280-light`, `H2D-editor-input-open-390-light/-dark`, `H2D-editor-after-commit-390-light`.

## Next actions (in order)
1. **Speed experiment continues (playbook tactic 11): commit at land points only**, reviewer dispatch first. After
   one more batch with latency p90 ≤ 2 min and commits/h ≤ 8, append the retro's P2 paragraph to `docs/dev-system.md`
   with both batches' numbers (EM-25 proposal, accepted and held).
2. GAL-9 (sonnet, box 8): archive Artifact for superseded sections (copy the 60 store-only v1 shots server-side via
   `files: {artifact, path}`), drop them from the live gallery, then publish section `hardening-2` H1–H5 from the
   five captures above; both URLs here and in memory `tanren-review-gallery`.
3. Follow-ups from H2 reviews (one brief each, opus): `Sessions.current` returns `{ userId, appGen }` so
   `Authentication.layer` verifies the JWT once (5 callers, 8 fakes); `accessibilityActions` + `onAccessibilityAction`
   for `Stepper` and `CompactStepper` (`adjustable` role without actions).
4. Candidates: `loadGarminConnected` direct test, `useStep` `catchTag`, `useProgramDetail` refocus, You
   all-time-totals card (design first), EG-1 if the owner sends the shot.
5. Bigger directions, owner's call: running support (Garmin runs already flow into the feed); Apple Health / Dynamic
   Island / Lock Screen need the paid Apple Developer Program.

## Decisions for the owner
- ADR-0022 amended (STLS-F7: writes refused at the next generation bump; reads stateless to expiry; web session has
  no gen → row check) — accepted under Amendment 3; override by message.
- `get_overview` best set follows the shared rule: a bodyweight set ranks by reps and never beats a loaded one.
- Second-tab copy: "Waiting for another Tanren tab / If Tanren is open in another tab, close it to continue here."
- Weight entry (Amendment 34) now covers the editor too; device-local step override; signing = unsigned commits +
  `sign-push.sh` (owner, 20:27).

## Gotchas learned this session
- Only the Lead commits (hook-enforced for subagents). Stage by explicit path list; read `git diff --cached
  --name-status`; ABORT guard (`^apps/|^packages/|^scripts/`) on docs/process batches; a side-index snapshot is
  content, never a tree (COMMIT-BASE).
- A landed report's reviewer is the Lead's next tool call; non-blocking shoulds that are owner-visible fold into
  the same finished engineer by resume (1 min each); pure nits ride with the next task on those files.
- Brief writing: re-read `Out:` against every Decision; a function's behaviour is a fact only with its body or
  test line pasted; a no-legacy grep spans `apps packages`, never just the touched files (EM-25).
- Effect `HttpRouter` serves HEAD through the GET route with `request.method` still "HEAD": method gates are
  `!== "POST"`. An input state proven on web is not a phone proof (iPhone has no focus ring; `number-pad` no Done).
- ui-check second tab = `ab tab new` in the SAME session (a second `--session` is a separate browser); close the
  holder in the same Bash call; the notice copy lives in `app/_layout.tsx`, re-grep before quoting it.
- Log appends take `$(date +%H:%M)` in the same shell command. Deploy cadence: ≤ 1 "reopen the app" ask per hour;
  production literals live in the route's lazy chunk, grep every chunk.
- Stale Metro: kill the pid and `expo start --clear` after ALL edits. A VS Code reload kills every live agent.
