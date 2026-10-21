---
name: ui-check
description: Drive the Expo web app headless with agent-browser to verify a UI flow (open Today, log a set, go offline, reload, confirm persistence) and read accessibility snapshots instead of writing test files. Use for UI acceptance in briefs, QA passes, and before reporting a screen done. Requires `agent-browser` installed per user.
---

# /ui-check

Prerequisite (once per machine, by the owner):
`npm i -g agent-browser && agent-browser install` (downloads Chrome for Testing into `~/.agent-browser/`).
Verified 2026-10-20 with agent-browser 0.39.1 (docs/research/2026-10-20-agent-browser.md).

```
CI=1 pnpm -F @tanren/mobile web --port 8089 &        # wait for "Waiting on http://localhost:8089"; note the PID
ab() { agent-browser --session qa "$@"; }
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
cd ../mobile; CI=1 nohup pnpm web --port 8081 > $S/<task>-expo.log 2>&1 & echo $! > $S/<task>-expo.pid
# wait for "Ready on" in the wrangler log and "Waiting on" in the expo log; curl -i localhost:8787/health → 200
ab() { agent-browser --session <task> "$@"; }
ab open http://localhost:8081/today
ab eval 'fetch("http://localhost:8787/api/auth/sign-in/magic-link",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({email:"dev@tanren.local",callbackURL:"http://localhost:8081/today"})}).then(r=>r.status)'
L=$(grep -o "magic link for dev@tanren.local: http[^ ]*" $S/<task>-wrangler.log | tail -1 | sed 's/\x1b\[[0-9;]*m//g; s/.*: //')
ab open "$L"                                  # verify link → cookie set → redirected to callbackURL
ab eval 'fetch("http://localhost:8787/api/auth/get-session",{credentials:"include"}).then(r=>r.text())'   # user json, not null
ab find role button click --name "Log set 1: …"
ab network requests --filter push             # the push request is the evidence; `--filter sync` for both
ab eval 'fetch("http://localhost:8787/sync/pull",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({since:null,limit:500})}).then(r=>r.text())'   # the set row is in `changes`
ab close; kill $(cat $S/<task>-wrangler.pid) $(cat $S/<task>-expo.pid)
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

```
cd apps/worker; nohup node_modules/.bin/wrangler dev --port $W --inspector-port $((W+500)) --persist-to $S/<task>-state \
  --var MCP_RESOURCE_URL:http://localhost:$W/mcp \
  --var ALLOWED_ORIGINS:http://localhost:$A --var BETTER_AUTH_URL:http://localhost:$W \
  --show-interactive-dev-session=false > $S/<task>-wrangler.log 2>&1 & echo $! > $S/<task>-wrangler.pid
# fresh --persist-to has no D1 rows: apply migrations/seed against it before use (see packages/db/CLAUDE.md), or copy the state dir
# dev server:  cd ../mobile; CI=1 nohup pnpm web --port $A ...   (as above)
# exported build: CI=1 pnpm -F @tanren/mobile export:web --output-dir $S/<task>-dist   (root alias: pnpm web:export)
#   cd apps/worker; node_modules/.bin/wrangler dev -c wrangler.web.jsonc --port $A --assets $S/<task>-dist   # config hardcodes ../mobile/dist; --assets overrides it
```

With `--var BETTER_AUTH_URL:http://localhost:$W` the magic link in the wrangler log already carries your
port (no host rewrite needed). Point the app at `http://localhost:$W` through its
API-base env (`grep -rn 8787 apps/mobile/src/services` for the variable name). `ALLOWED_ORIGINS` must list
`http://localhost:$A` or the sign-in POST fails `trustedOrigins`. A new route needs `CI=1 expo start` once
until `.expo/types/router.d.ts` lists it.

macOS facts (2026-10-21): zsh has no `timeout` — wait with
`for i in $(seq 1 60); do curl -sf localhost:$W/health && break; sleep 1; done`; `wrangler dev` via `pnpm exec`
records the pnpm shim in `$!` and leaves a `workerd` child (EQ-1 killed twice; hence
`node_modules/.bin/wrangler` above), so if `kill $(cat …pid)` leaves the port busy, stop the listener with
`kill $(lsof -tiTCP:$W -sTCP:LISTEN)` (your own port only) and re-check `ps -ef | grep "port $W"`;
without `--var MCP_RESOURCE_URL:http://localhost:$W/mcp` dev-token MCP calls are 401 `Invalid audience`; `ab set media dark|light` and `ab set viewport
W H` apply live without reload; a dpr-2 full-page screenshot is clipped — use a tall viewport
(`set viewport 390 1600`) or `ab screenshot "<selector>" file.png` per element.

Rules: controls need `accessibilityLabel`s (that is what makes them targetable);
report the snapshot lines that prove the behaviour, not a narrative; plain RN-web `Text`
(muted notices, "Needs: …" lines, even with an `accessibilityLabel`) is missing from `ab snapshot`,
so read copy with `ab eval 'document.body.innerText'` (EQ-2b); never kill
servers you did not start; offline reloads against the dev server fail by
design (no service worker) — go back online before reloading.
