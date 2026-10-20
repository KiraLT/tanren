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

Rules: controls need `accessibilityLabel`s (that is what makes them targetable);
report the snapshot lines that prove the behaviour, not a narrative; never kill
servers you did not start; offline reloads against the dev server fail by
design (no service worker) — go back online before reloading.
