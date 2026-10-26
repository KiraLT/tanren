# Team sheet: pair `desktop` (UI-P, v3-design)

Started 21:20 (wall clock) · hard timeout 22:50 · spec `docs/design/ui-polish.md` · charter from the Lead (sonnet team-lead).
Owned: `apps/mobile/src/ui/**`, `apps/mobile/src/components/ExercisePager.tsx`, `docs/design/ui-columns.js`, `docs/design/ui-measure.js` (header line), `docs/design/ui-desktop.md` §1.2/§2 numbers only.
Ports for this pair: worker 8861 / app 8862 (+ inspector 9361); check free with `ps -ef | grep "port 886"` and `curl -s localhost:<p>/health` first.

## Assumes (cross-team)
- Mobile pairs (`mobile-A`, `mobile-B`) own the screen files until the Lead says a file is free; `desktop` touches only `src/ui` in round 1.
- Another team-lead runs `mobile-A` in parallel; the owner's :8787/:8081 are not ours; `pnpm db:reset` wipes the shared local D1 (use own `--persist-to`).
- 390/768 stay pixel-identical for everything in `src/ui` (baselines `$S/UI-D0-<screen>-390.json`, light).

## Tasks
| id | task | role/model | depends | box | status |
|---|---|---|---|---|---|
| R1-code | foundation round: D1 columns/tokens, D2 sticky aside, D3 numeralLg/clock/xxl stepper, D5 rhythm tokens + divider inset + ListRow leading null/thumb, D6 Text tabular, Chip hitSlop, StatRow, tests + doc numbers | engineer/sonnet | - | 20 | todo |
| R1-harness | capture harness script (scratchpad) + HEAD baseline shot, reused by rounds 1-3 | engineer/sonnet | - | 15 | todo |
| R1-shots | round 1 screenshots + ui-columns numbers (same engineer as R1-code or harness engineer after code lands) | engineer/sonnet | R1-code, R1-harness | 10 | todo |
| REV-R1 | designer review round 1 (fable, architect role) | architect/fable | R1-shots | 10 | todo |
| R2 / REV-R2, R3 / REV-R3 | desktop-only branches of free screen files | engineer/sonnet + architect/fable | Lead hand-over | 20+10 | todo |

## Log
(HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome)

## Decisions
## Escalations
## Integration checklist

## Round 4 worklist (Lead, from the final report 22:57; charter after PROG-3 lands)
1. Re-capture r7 (fix capture re-sign-in before settings), verify hairline on settings/location/activity; designer review r4.
2. Plan: 'Up next' compact card; Player enrolled render at 1280/900 (enrol the seed first); Programs ≈ 84 % fill check; one stat-row style rule (bare / in-card / tiles → one).
3. After mobile-B: Library 4–5, Library detail 2, Progress 3, Location Columns; ListRow titleLines/subtitleLines + tabular title; ToggleChip compact/margin.
4. Harness: scratchpad UI-Pdesk-capture.sh needs zsh and a grep tolerant of the EmailSender log format; ports 8861/8862 collide — use WP=/AP=.
5. Designer r3 open items: three stat styles, Plan rest rows 63, Today 'Sets / Back Squat' two label rows (mobile-A files, now free).
Commits: r1 foundation + r2 in earlier commits; r3/r3c WIP 8ab5772 (unreviewed r3c).
