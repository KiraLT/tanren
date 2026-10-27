# UI-NUTRI-e2e — nutrition integration proof (INT-N, 2026-10-27)

Commit b74b161 + 96 dirty (`git status --short | md5` dabac7e5…). Dev server `expo start --web --port 9192`
(`EXPO_PUBLIC_API_URL=http://localhost:9191`) against `wrangler dev --port 9191 --persist-to <scratch>`; signed in as the
seed user `dev@tanren.local` by magic link (link from the wrangler log). agent-browser session `intn`. Shots in
`docs/design/screens/`, rows `UI-NUTRI-rows.html#nutri-e2e`.

Data states:
- A: scratch D1 `$S/INT-N-d1-1fat`, migrations 0000–0010, `pnpm db:seed -- --persist-to <dir>` (end 2026-10-27):
  `dailyHealth 7, foodEntry 10`. Real date Tue 27 Oct.
- B: scratch D1 `$S/INT-N-d1wk-*`, same migrations, seed `--end 2026-11-01` (Sunday) → 7 `daily_health` rows 26 Oct – 1 Nov.
  Browser date shifted to Sun 1 Nov by an init script (`Date` + 5 days, pattern of UI-D0's fakedate):
  `(()=>{const R=Date,off=5*86400000;const N=function(...a){return a.length?new R(...a):new R(R.now()+off)};N.prototype=R.prototype;N.now=()=>R.now()+off;N.parse=R.parse;N.UTC=R.UTC;globalThis.Date=N})();`

| # | Check | Result | Measured |
|---|---|---|---|
| a0 | `/health` Ready on state A (real date) | PASS (finding) | hero 969 eaten / 2,602 burned / 2,101 left / 78 g; bars: `Monday: eaten 1,809 kcal, burned 2,488 kcal`, `Today, Tuesday: eaten 969 kcal, burned 2,602 kcal`, Wed–Sun `upcoming`; 0 "no data". DayBars is the calendar week, so 7 seeded rows give 2 burned bars on a Tuesday. |
| a | `/health` Ready on state B: burned series has 7 numeric values, no "no data" | PASS | `Monday … burned 2,500`, `Tuesday … 2,639`, `Wednesday … 2,321`, `Thursday … 2,650`, `Friday: eaten 1,809, burned 2,655`, `Saturday: eaten 1,809, burned 2,601`, `Today, Sunday: eaten 969 kcal, burned 2,602 kcal`; `grep -c "no data"` = 0; all 7 bars visible at 390 (top 221, bottom 361). Shots N2b 390/1280 light/dark. |
| b | Food log delete → Undo → entry back (state A, 390) | PASS | before: 2 delete buttons (`Delete Chicken breast +1`, `Delete Oats with milk`); after delete: 1 + `StaticText "Entry deleted"` + `button "Undo"`; Undo pressed 2 s after delete; after: 2 (`Delete Chicken breast +1` back), "Entry deleted" gone. Hero totals drop while pending (protein short 75 → 135 g). Shots N4 390 light/dark. |
| b+ | Undo survives a reload (state B, optional) | PASS | delete → Undo → `ab reload` → 2 delete buttons; `ab errors` empty. |
| c | Settings → Nutrition eat-back row announces as a switch with its state | PASS | Garmin connected first (console mode, Settings → Integrations → Garmin, any 16+ chars; the row renders only with Garmin connected): `switch "Eat back active calories" [checked=false]`, after one press `[checked=true]`; the inner web Switch is not in the a11y tree (one switch line). |

Self-check: all six PNGs opened; bars and the Undo banner visible in both schemes, no control lost in one scheme.
Not driven: §8's MCP `log_food` / whey / strip numbers (covered by the MCP harness, not this brief).
