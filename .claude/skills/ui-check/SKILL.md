---
name: ui-check
description: Drive the Expo web app headless with agent-browser to verify a UI flow (open Today, log a set, go offline, reload, confirm persistence) and read accessibility snapshots instead of writing test files. Use for UI acceptance in briefs, QA passes, and before reporting a screen done. Requires `agent-browser` installed per user.
---

# /ui-check

Prerequisite (once per machine, by the owner):
`npm i -g agent-browser && agent-browser install` (downloads Chrome for Testing into `~/.agent-browser/`).
Verified 2026-10-20 with agent-browser 0.39.1 (docs/research/2026-10-20-agent-browser.md).

**Signed out, the web dev server shows the Landing over a hidden navigator**: whatever route you open,
every measurement and screenshot is the Landing until you sign in or start the server with
`EXPO_PUBLIC_DEV_USER_ID=<uuid>` (recipe below, "Measured baselines"). HOTFIX-1 (2026-10-27) measured the
Landing's backgrounds for a Today fix first. Name the data state in the report line.

Two checks the screenshot-after-paint recipe misses, both found by the owner on production (2026-10-27):
- Mid-navigation background: after `ab set media dark`, click a route and read the ancestor chain of
  the new screen (`ab eval '(() => { let e = document.querySelector("main") ?? document.body; const
  out = []; while (e) { out.push(getComputedStyle(e).backgroundColor); e = e.parentElement } return
  out })()'`) — no `rgb(255, 255, 255)` / `rgb(242, 242, 242)` (React Navigation's default light theme)
  in a dark capture; the app themes the navigators through `src/ui/navigationTheme.ts`.
- Second tab: `ab open` the same app URL in a second session (`--session <task>-2`); within 16 s it must
  show the "open in another tab" error, never a blank page (`document.body.innerText` non-empty,
  `ab errors` read). A blank page with an empty console was BS-1.

```
CI=1 pnpm -F @tanren/mobile web --port 8089 &        # wait for "Waiting on http://localhost:8089"; note the PID
ab() { agent-browser --session <your task id> "$@"; }   # ALWAYS your own session: the default session is shared by every
                                                        # live agent — IMG-3 screenshotted and closed UI-C's page through it
ab open http://localhost:8089/today && ab snapshot -i   # elements appear as role + accessibilityLabel + @ref
ab find role button click --name "Log set 1: 100 kilograms, 5 reps"
ab set offline on        # act offline; `ab set offline off` to return
ab reload && ab snapshot | grep -i logged
ab errors                # must be empty
ab screenshot today.png  # optional evidence
ab close; kill <PID>     # only the server you started
```

## Full stack: web app against the local worker (verified INT-2b, 2026-10-20)

`S` is the scratchpad; name every pid/log after your task id (another agent's `wrangler.pid` may already
be there). `pnpm db:reset` wipes the local D1 that every running `wrangler dev` shares: look for other
`*.pid` files first.

```
cd apps/worker; nohup pnpm exec wrangler dev --port 8787 --show-interactive-dev-session=false > $S/<task>-wrangler.log 2>&1 & echo $! > $S/<task>-wrangler.pid
cd ../mobile; CI=1 nohup node_modules/.bin/expo start --web --port 8081 > $S/<task>-expo.log 2>&1 & echo $! > $S/<task>-expo.pid
# never `pnpm web` here: `$!` would be the pnpm-native shim and killing it leaves expo on the port (UI-1b, EQ-1)
# wait for "Ready on" in the wrangler log and "Waiting on" in the expo log; curl -i localhost:8787/health → 200
ab() { agent-browser --session <task> "$@"; }
ab open http://localhost:8081/today
ab eval 'fetch("http://localhost:8787/api/auth/sign-in/magic-link",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({email:"dev@tanren.local",callbackURL:"http://localhost:8081/home"})}).then(r=>r.status)'
# the log line reads `magic link for dev@tanren.local (Sign in to Tanren): http…` (subject in parentheses since v5):
L=$(sed 's/\x1b\[[0-9;]*m//g' $S/<task>-wrangler.log | grep -o "http://localhost:8787/api/auth/magic-link/verify[^ ]*" | tail -1)
# seeded Health week: DayBars are Mon–Sun, so the default seed (end Tue 27 Oct) shows 2 burned bars + "upcoming";
# all 7 need `pnpm db:seed -- --end <a Sunday> --persist-to $D` plus a browser fake date on that Sunday (INT-N e2e, 2026-10-27)
ab open "$L"                                  # verify link → cookie set → redirected to callbackURL
ab eval 'fetch("http://localhost:8787/api/auth/get-session",{credentials:"include"}).then(r=>r.text())'   # user json, not null
ab find role button click --name "Log set 1: …"
ab network requests --filter push             # the push request is the evidence; `--filter sync` for both
ab eval 'fetch("http://localhost:8787/sync/pull",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({since:null,limit:500})}).then(r=>r.text())'   # the set row is in `changes`
ab close; for f in $S/<task>-wrangler.pid $S/<task>-expo.pid; do P=$(cat $f); [ "${P:-0}" -gt 1 ] && kill "$P"; done
# guard: a pid file holding `0` or nothing turns this into `kill 0`, which kills your own shell and every job in it (mobile-B capture engineer, 2026-10-26)
```

Facts: `localhost:8081` and `localhost:8787` are the same site, so the SameSite=Lax session cookie rides
`credentials: "include"` with no bearer path; CORS is checked with
`curl -i -X OPTIONS localhost:8787/sync/push -H 'Origin: http://localhost:8081' -H 'Access-Control-Request-Method: POST'`
(expect allow-origin echoed + allow-credentials true). The seed plan has rest days: to land Today on a
training day, close the session and relaunch with `TZ=Pacific/Kiritimati ab open …` (Chrome inherits `TZ`).

## Isolated stack (parallel proofs; verified by teams programs and design, 2026-10-21)

When another agent may hold 8787/8081 or `apps/mobile/dist`, run your own copy: pick two free ports
`W` (worker) and `A` (app), and never touch the shared ports. A port is free only when both
`ps -ef | grep "port $W" | grep -v grep` is empty and `curl -s localhost:$W/health` fails: orphaned
wranglers from finished agents do not show up in `lsof` (INT-X3 found two on 8795/8793 that way). Give
every wrangler its own `--inspector-port` (two on one host collide on the default 9229).
A stack is per task, never shared across tasks or rounds: the polish-r5 engineers reused a sibling's 8911/8912
servers, which vanished when that sibling finished (its shell exit took the children). Each task starts its own
pair from its own pid files, re-checks `curl -sf localhost:$W/health` and `localhost:$A` immediately before every
capture batch, and restarts from its pid files when either fails. A `--persist-to` copy carries only the
migrations present when it was copied: run `node_modules/.bin/wrangler d1 migrations apply tanren --local
--persist-to $S/<task>-state` before `wrangler dev` on it (r5 copies lacked 0005 → 500s on the worker).
Two export facts the mobile-A capture engineer re-discovered (2026-10-26): the API base is baked into the
bundle at export time (`CI=1 EXPO_PUBLIC_API_URL=http://localhost:$W pnpm -F @tanren/mobile export:web
--output-dir <dir>`; a dist exported for another port never reaches your worker), and `/programs/play` is a
lazy chunk (`_expo/static/js/web/play-*.js`): opened for the first time with `ab set offline on` it renders
blank with `AsyncRequireError`, so visit it once online before any offline step.

```
cd apps/worker; nohup node_modules/.bin/wrangler dev --port $W --inspector-port $((W+500)) --persist-to $S/<task>-state \
  --var MCP_RESOURCE_URL:http://localhost:$W/mcp \
  --var ALLOWED_ORIGINS:http://localhost:$A --var BETTER_AUTH_URL:http://localhost:$W \
  --show-interactive-dev-session=false > $S/<task>-wrangler.log 2>&1 & echo $! > $S/<task>-wrangler.pid
# fresh --persist-to has no D1 rows: apply migrations/seed against it before use (see packages/db/CLAUDE.md), or copy the state dir
# dev server:  cd ../mobile; CI=1 nohup node_modules/.bin/expo start --web --port $A ...   (as above; never `pnpm web`: the shim lands in `$!`)
# exported build: CI=1 pnpm -F @tanren/mobile export:web --output-dir $S/<task>-dist   (root alias: pnpm web:export)
#   cd apps/worker; node_modules/.bin/wrangler dev -c wrangler.web.jsonc --port $A --assets $S/<task>-dist   # config hardcodes ../mobile/dist; --assets overrides it
```

With `--var BETTER_AUTH_URL:http://localhost:$W` the magic link in the wrangler log already carries your
port (no host rewrite needed). Point the app at `http://localhost:$W` through its
API-base env (`grep -rn 8787 apps/mobile/src/services` for the variable name). `ALLOWED_ORIGINS` must list
`http://localhost:$A` or the sign-in POST fails `trustedOrigins`. A new route needs `CI=1 expo start` once
until `.expo/types/router.d.ts` lists it.

Shell facts (UI-2a, 2026-10-21): every Bash tool call is a fresh zsh, so re-define `ab()` in each call or write a
wrapper once (`printf '#!/bin/sh\nexec agent-browser --session <task> "$@"\n' > $S/<task>-ab.sh; chmod +x $S/<task>-ab.sh`)
and call `$S/<task>-ab.sh …`; never `A="agent-browser --session x"; $A …` — zsh does not word-split `$A`, the call
fails. Probe the port (`ps -ef | grep "port $A"`, `curl`) in one call and start the server in the next: inside one
call a BUSY result cannot stop the start.

macOS facts (2026-10-21): zsh has no `timeout` — wait with
`for i in $(seq 1 60); do curl -sf localhost:$W/health && break; sleep 1; done`; `wrangler dev` via `pnpm exec`
records the pnpm shim in `$!` and leaves a `workerd` child (EQ-1 killed twice; hence
`node_modules/.bin/wrangler` above), so if `kill $(cat …pid)` leaves the port busy, stop the listener with
`kill $(lsof -tiTCP:$W -sTCP:LISTEN)` (your own port only) and re-check `ps -ef | grep "port $W"`;
without `--var MCP_RESOURCE_URL:http://localhost:$W/mcp` dev-token MCP calls are 401 `Invalid audience`; `ab set media dark|light` and `ab set viewport
W H` apply live without reload; a dpr-2 full-page screenshot is clipped — use a tall viewport
(`set viewport 390 1600`) or `ab screenshot "<selector>" file.png` per element.

## Measured baselines (`docs/design/ui-measure.js`, `docs/design/ui-columns.js`; UI-D0/DX/DF2, 2026-10-26)

- Aside arithmetic: `Page` draws the aside's 1 px hairline as `borderLeft` inside the aside box, so
  the first aside card's left = hairline x + 1 + gutter (1280: 752 + 1 + 32 = 785), and every aside
  top equals the column top only because `Page` owns the aside frame (DESK-0, 2026-10-27).
- Capture recipe first, in one line of the report and in each JSON's name: data state (dev server =
  empty offline store; exported build + signed in to the seeded worker = the month of data), `ab set
  media light` (the default agent-browser scheme is dark; `cardStyle` draws a 1 px hairline in light
  only, so dark is 2 px wider / 1 px higher: UI-DX vs UI-D0 "drift"), viewport, `TZ`, fake date.
  Run `ab set media light|dark` explicitly before every measurement or screenshot and put the scheme in
  the file name (`UI-DX-settings-390-light.json`); an `--color-scheme` given at `open` sticks for the
  whole session, so the open flag is not evidence of a file's scheme — the `set media` call before it is.
  The viewport command is `ab set viewport <w> <h>` (not `--viewport` on later calls). A session
  started after `ab close` is back at the default viewport: re-run `set viewport` after every `open`
  (TODAY-EMPTY shot 1280 instead of 390 once, 2026-10-27). After a `screenshot` or `set media` the
  page can go `document.visibilityState === "hidden"`, which stalls CSS animations and resize events
  (react-native-web Modals never become active, so Escape and the focus trap never arm): before a
  capture that needs a live page run `close`, `open`, `set viewport`, `open` again and check
  `document.visibilityState` first (CONFIRM-1, 2026-10-27).
  Commit-stamp every set: the report line and the set's name carry `git rev-parse --short HEAD` plus
  `git status --short | wc -l` (dirty count). When two streams change layout at once (2026-10-26: the
  desktop pair moved the page width while FEED-5 measured 696), compare only runs on the same commit, or
  name the commits between them and route the diff to their author; it is drift, not a defect.
  One `Commit:` per capture run, taken when the CONTENT is fixed, not when the shot is taken: for an
  exported build run `git rev-parse --short HEAD` + `git status --short | wc -l` once at export time, write
  it to `$S/<task>-dist/COMMIT` and copy it into every file name — the dist is immutable, and the Lead's
  commits during the run (LOGO-2, PROG-3, LAND-1 all saw HEAD move mid-capture, 2026-10-26) change labels,
  not pixels, so ignore them and never report two shas for one set. For a dev-server run (hot reload) stamp
  at start and compare `git status --short | md5` before and after: a changed tree (another engineer's edit)
  is a re-shoot; a changed sha alone is not.
- Session check per batch (desktop pair r6, 2026-10-26: the capture lost its cookie and shot the sign-in
  form on every route, and the designer scored it): before each route batch
  `ab eval 'fetch("http://localhost:$W/api/auth/get-session",{credentials:"include"}).then(r=>r.text())'`
  must return a user; a PNG showing the sign-in form on a route other than `/sign-in` is a capture failure —
  re-sign-in and re-shoot, never hand it over. Capture scripts in `$S` start with `#!/bin/zsh` (the desktop
  harness broke under `sh`).
- Gallery check (GAL-2): a capture task that adds rows to the review gallery HTML runs
  `node docs/design/gallery.mjs [html] [screensDir]` and pastes its output (badge uniqueness, missing
  shots; exit 0 expected — the 60 v1 shots that live only in the published artifact are marked
  `store: true` in the manifest and are not "missing"; a shot referenced by the HTML and absent on disk
  exits 1 and is named). A plain run never writes; only `--write` regenerates the checked-in manifest
  `docs/design/screens/gallery.json`, and only the Lead passes it (at publish time). The Lead publishes
  from `node docs/design/gallery.mjs --publish` (map of shots on disk; duplicate badges are the only
  hard failure). A new section picks a badge prefix not already in `gallery.json`. The
  `<id>-rows.html` fragment's `src` paths match where the PNGs are written, sub-folder included:
  74 `programs-v6b/*.png` rows pointed at files living in `v6b/` and stayed unpublished until GAL-6
  (2026-10-27); the plain run's `missing files (0)` is the proof the task pastes.
- `ui-measure.js` `docH` (`documentElement.scrollHeight`) equals the viewport height on every route whose
  ScrollView scrolls (RNW pins the body to 100 %), so it proves nothing about page length (LAND-1,
  2026-10-26). Read the scrolling column's `scrollHeight` (`contentH`) instead; desktop r4 adds the probe.
- Dev-server data states (team feed / FEED-X, 2026-10-26): after ADR-0019 an empty store redirects to
  `/sign-in`, so a dev-server capture needs either `EXPO_PUBLIC_DEV_USER_ID=<uuid>` at start or a sign-in
  against a local worker (the exported-build recipe above). Done activities without a worker: Programs →
  "Start day N" with `EXPO_PUBLIC_PLAYER_SPEED=60` at `expo start`, one "Done with …" tap, then
  "Finish workout" completes the day in ≈ 5 s (PROG-4, 2026-10-27), or the seeded worker
  with your own `--persist-to` copy. `ab close` ends the browser profile and the local store with it: shoot
  everything you need before closing. Metro served stale bundles after edits while still logging "Web
  Bundled" six times on 2026-10-27 (NAV-2 twice, CONFIRM-2, PROG-1, PROG-2, NAV-1b): the rule is
  "finish ALL edits, then restart with `expo start --clear`, then take the FIRST capture" — a server
  started before your edits is stale even if it logs a rebuild; "restart" means the PROCESS (kill
  the pid, `expo start --clear` again) — a browser reload or Metro's `r` does not pick up `src/ui`
  primitive edits (WT-1, 2026-10-27); confirm the snapshot shows a
  string the edit introduced — a "Web Bundled" line does not prove a fresh bundle; a
  `(tabs)` route not listed in `APP_NAV` redirects to `/home` (NAV-3). A shot taken from a stale
  bundle is not a proof — retake it (NAV-3b's Done-row shot still read "1 sets" after the fix, 2026-10-27).
  Local-only run (PROG-3, NAV-3, 2026-10-27): `EXPO_PUBLIC_DEV_USER_ID=<uuid>
  EXPO_PUBLIC_API_URL=http://127.0.0.1:1 expo start --port <n> --clear` — a dead API URL keeps sync
  quiet; a signed-out EMPTY store shows the Landing on every route. `DEV_USER_ID` skips the demo seed
  and the signed-out seed hides behind the Landing, so a dev store WITH a plan (planned Up-next row,
  1280 aside with data) needs the seeded worker + sign-in (Full stack recipe above), not a dev flag;
  NAV-3 and NAV-3b both shipped the planned/aside shots uncaptured for this reason.
  Today with sets on a dev server (FIN-LAYOUT, 2026-10-26): `EXPO_PUBLIC_DEV_USER_ID` skips the seed, so
  Today reads "Nothing planned today"; start signed out instead, log sets with a DOM click (`ab eval
  'document.querySelector("[aria-label^=\"Log set\"]").click()'`; the landing covers Today until a set
  exists), then reload. Plan week with a logged line, no worker needed (PLAN-LOG, 2026-10-27): same
  signed-out dev server, DOM-click "Log set" three times on Today, then open `/plan` → the week shows
  "Logged 3 sets · 1,500 kg". The state a designer must score has to be reachable by recipe before the round
  starts, and the brief names the recipe: desktop r4 shipped Plan "Up next" UNREVIEWED (seeded week all
  done; needs a fake date, e.g. Thu 22 Oct, or a seed with an upcoming session) and Programs on day 1
  instead of day 3.
- New or moved element (TODAY-FIN → FIN-LAYOUT, 2026-10-26): the proof is bounding boxes, not a
  snapshot line. Paste the new element's box and its neighbours' (previous.bottom ≤ new.top,
  new.bottom ≤ next.top or the element is last) at 390, and at 1280 when the screen has a `Columns`
  layout; then open the PNG. "Finish workout" passed its snapshot + height check while drawn over Set 2.
  Rounds of one pair shoot against the pair's own `--persist-to` state dir seeded once (isolated stack
  above), never the shared `.wrangler/state` D1: other agents' proofs mutate it (mobile-A r1→r2 found every
  seeded session "done", so Today/Plan were not like-for-like across rounds).
  Compare only against a baseline whose name carries
  the same scheme and recipe. The `ui-measure.js` header carries the same rule.
- The seed week is 19–25 Oct: Today/Plan Ready need `TZ=Pacific/Kiritimati` plus an init script that
  shifts `Date` (`ab open --init-script $S/<task>-fakedate.js`, pattern in UI-D0's Log line; keep the
  script in `docs/design/`, not the purgeable scratchpad). Programs Ready = enrol offline, never push.
- `ab eval` returns the probe's JSON as a quoted string: `JSON.parse` it (twice if the probe stringifies).
- Force a local-store write failure on web without touching code (NAV-1b, 2026-10-27): the sqlite
  worker takes SQL over `postMessage`, so `ab eval '(() => { const p = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (m, ...r) { if (/INSERT/.test(JSON.stringify(m))) throw new
  Error("forced"); return p.call(this, m, ...r) } })()'` makes every insert fail; then drive the UI and
  capture the failure caption. Reload (`ab reload`) undoes it.
- The root Stack keeps the previous screen mounted at 0×0 under a pushed route (Settings under the
  Location editor): probes take the first *visible* match (`getBoundingClientRect().width > 0`), and
  measure in-column overflow via `scrollWidth > clientWidth` on the column (RNW ScrollView sets
  `overflowX: hidden`, so a squeezed row is invisible in a screenshot).
- Baselines and screenshots the Lead or owner may ask for again go to the git-ignored
  `docs/design/screens/` (or an Artifact), never only to `$S` (macOS purges it after 3 days).

Rules: controls need `accessibilityLabel`s (that is what makes them targetable);
report the snapshot lines that prove the behaviour, not a narrative; plain RN-web `Text`
(muted notices, "Needs: …" lines, even with an `accessibilityLabel`) is missing from `ab snapshot`,
so read copy with `ab eval 'document.body.innerText'` (EQ-2b); never kill
servers you did not start; offline reloads against the dev server fail by
design (no service worker) — go back online before reloading.
