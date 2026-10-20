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

Rules: controls need `accessibilityLabel`s (that is what makes them targetable);
report the snapshot lines that prove the behaviour, not a narrative; never kill
servers you did not start; offline reloads against the dev server fail by
design (no service worker) — go back online before reloading.
