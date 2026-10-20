# agent-browser for agent-driven UI checks (2026-10-20)

**Question.** Can vercel-labs/agent-browser let a QA/engineer agent drive the Expo web app
locally (Today → "Log set" → reload → set still there, offline) cheaply and reliably, and
should it be how agents verify UI?

**Setup** (workbench in scratchpad, not the repo; agent-browser 0.39.1)
```
npm i agent-browser            # 1.4 s, 114 MB node_modules (prebuilt Rust binaries, all platforms)
npx agent-browser install      # Chrome for Testing 155: 184 MB zip, 362 MB on disk, ~8 s
                               # -> ~/.agent-browser/browsers/ (per user, shared across projects)
CI=1 pnpm -F @tanren/mobile web --port 8089
```
npm's install-script gate blocked the package's postinstall; the CLI ran anyway.

**Observation** (`ab` = `agent-browser --session tanren`)
```
ab open http://localhost:8089/today      # 3.7 s cold (starts daemon + Chrome)
ab snapshot -i                           # 0.06 s
  - heading "Back Squat" [level=1, ref=e7]
  - button "Log set 1: 100 kilograms, 5 reps" [ref=e8]
ab click @e8 ; ab reload ; ab snapshot
  - generic "Set 1, planned 100 kg × 5, logged 100 kg × 5"     # persisted across reload
ab find role button click --name "Log set 2: 100 kilograms, 5 reps"   # semantic locator works
ab set offline on ; ab eval 'navigator.onLine'   -> false
ab find role button click --name "Log set 3: ..." ; ab reload -> chrome-error://chromewebdata/
ab set offline off ; ab open .../today ; ab snapshot
  - generic "Set 3, planned 100 kg × 5, logged 100 kg × 5"     # set logged offline survived
ab errors   -> (empty)    ab console -> only React DevTools info
```
- The app's `accessibilityLabel`s show up as accessible names. That keeps refs and
  `find role ... --name` stable and readable.
- An offline *reload* cannot work: the dev server serves the bundle and the app has no
  service worker. The right offline check is offline on → log → offline off → reload → assert.
- Note: `offline` is a `set` subcommand (`ab set offline on`), not a top-level command.

**Answer.** Yes. The whole flow (open, snapshot, log, reload, offline log, verify) ran
headless with no flakiness in about 1 minute of agent time. Each snapshot is a compact
text accessibility tree, so it costs few tokens. There are no API keys or fees. The tool
is local (Rust CLI + daemon over CDP). Confidence: **observed** for the flow, the timings
and the footprint. The "reliable over many runs" claim is **inferred** from one session.

**What it means for Tanren.**
- Adopt it as `.claude/skills/ui-check` for qa and mobile engineers. Agents can use it
  for exploratory checks and step acceptance without writing test files. That fits the
  Expo Go/web split and keeps Playwright out of the repo for now. If we later need
  regression UI tests in `pnpm check`, Playwright is still the right tool. agent-browser
  doesn't replace committed tests.
- Install it globally or per user (`npm i -g agent-browser && agent-browser install`).
  Don't make it a repo dependency: the gate doesn't need it, and Chrome lives in `~`.
- The package ships its own `skills/agent-browser` (SKILL.md). The ui-check skill can
  point to it instead of copying it.
- Accessibility labels on controls are what make this work. Keep that rule in
  `expo-mobile`.

**Recipe**
```
CI=1 pnpm -F @tanren/mobile web --port 8089 &      # wait for "Waiting on http://localhost:8089"
agent-browser --session qa open http://localhost:8089/today && agent-browser --session qa snapshot -i
agent-browser --session qa find role button click --name "Log set 1: 100 kilograms, 5 reps"
agent-browser --session qa set offline on   # log more sets here, then: set offline off
agent-browser --session qa reload && agent-browser --session qa snapshot | grep logged; agent-browser --session qa errors; agent-browser --session qa close
```
