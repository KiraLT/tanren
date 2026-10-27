# UI-HM-qa (HM-4)
Commit b74b161 + 140 dirty files. Data state: scratch D1 (`hm4-state`), seed `--end 2026-11-01`, dev@tanren.local signed in by magic link, dev server (expo start --web, 9222) + worker 9221. Fake date Sun 1 Nov (Date + 5 days init script) for stale/over/garminoff/noprofile rows; real date (27 Oct) for "fresh". Capture: `ab set media light|dark`, viewports 390x844 and 1280x900, no screenshots (measurements only; HM-3 gallery shots untouched).

## Matrix (card = `[aria-label^="Health today"]` on Today; `/health` hero has no such label, so only page-wide overflow was measured there)
| state | route | card shown? | 390 light/dark | 1280 light/dark | overflow (scrollWidth==clientWidth, 0 overflowing elements, no doc overflow) | errors |
| --- | --- | --- | --- | --- | --- | --- |
| all present, stale burnedAsOf (fake date; "as of 27 Oct 16:45") | today | yes | PASS 358x236 | PASS 431x236 | PASS | [] |
| fresh Garmin, nothing logged (real date; "as of 08:00") | today | yes | PASS 358x236 | PASS 536x236 | PASS | [] |
| over budget (kcalTarget 800: "Over today / -169", insight "169 kcal over target today") | today | yes | PASS 358x236 (light only) | PASS 431x236 (light only) | PASS | [] |
| Garmin off (daily_health deleted: Burned "—", "No tracker connected") | today | yes | PASS 358x236 | PASS 431x236 | PASS | [] |
| no profile, Garmin off, entries>0 ("Burned today — / Set a goal for a budget / Protein 78 g") | today | yes | PASS 358x214 (light only) | PASS 431x214 (light only) | PASS | [] |
| no profile, Garmin off, nothing logged | today | hidden (PASS per §6) | PASS | PASS | n/a | [] |
| same states | /health | hero text identical to Today; page overflow 0 in every row; `/health` no-profile+no-Garmin shows no hero | PASS | PASS | PASS | [] |
Not run: "no profile, Garmin ON" (needs a daily_health row after the profile is off; covered only by HM-3 `UI-HM-today-noprofile-*` shots), over-budget dark, no-profile dark. Hero card heights not isolated.
Deviations from §8: Today card width at 1280 is 431 (fake-date training day) / 536 (real date), spec says 496; no-profile card is 214 high (spec table gives 234 for the full card, no figure for this state). Today route has 6 h1 (workout title + each exercise page), `/health` has 1; the "h1 === 1" criterion holds only on `/health`.

## Discrepancy "Protein 75 g short" vs "78 / 155 g"
Cause: not a data bug. `buildDayTotals` keeps `proteinLeftG = roundTenth(155 − eaten.proteinG)` = 77.4 (eaten 77.6); the card shows `eaten.proteinG` rounded to an integer (78) and the target, while `insights` deliberately prints `Math.round(proteinLeft / 5) * 5` = 75 (nutrition.md §5 "rounded to 5"; existing test nutrition.test.ts:264). Same entry set, both read `today`. The visible gap 155 − 78 = 77 vs "75" is the 5 g rounding plus the card's integer rounding.
Test: `packages/shared/src/nutrition.edge.test.ts` (3 tests, all PASS): pins the 77.6 case, and for eaten 0..124.6 the insight grams == round5(proteinLeftG), a multiple of 5, within 2.5 g; boundary 30.0 left shows, 29.9 does not. Fix choice for the Lead: either reword to "about 75 g" / print the exact `Math.round(proteinLeftG)` ("77 g short"), or leave it as designed.

## Greps
`grep -rn "legacy\|old\|remove later" today health`: no legacy hits; incidental matches only ("the old session" comment FinishWorkout.tsx:27, "older burnedAsOf" test, "placeholder" x2, "holds the first item" comment, "bounds" test).
Callers of `asOfText|useDailyHealth|DailyHealthRepo`: health/nutritionText.ts, health/nutritionText.test.ts, hooks/useDailyHealth.ts, services/DailyHealthRepo.ts, services/DailyHealthRepo.test.ts, services/runtime.ts (none under today/ or app/: `asOfText` has no non-test caller outside nutritionText.ts itself; check it is still exported-and-used in the fix round).
Gallery: `gallery.mjs UI-HM-today-rows.html` exit 0; `UI-HM-health-rows.html` exit 0 (0 missing files, 0 duplicate badges).
Servers killed (9221, 9222, 9721); `ps -ef | grep "port 922[12]"` empty.
Dead-export check: `asOfText` (nutritionText.ts:10) has NO non-test caller: delete it with its test in the fix round.
