# Team charter: desktop round 4 (polish pairs, plan Amendment 7)
Status: pre-written 2026-10-26 23:00 · dispatch after PROG-3 lands (PlayerView.tsx) · Lead: step-2.md Log

Mission: finish the desktop polish stream the pair left at "another round" (designer r3:
Today 4, Programs 3, Plan 3, Player 3; r3c coded but unreviewed, WIP 8ab5772). One page frame
holds on 14/14 routes; what remains is fill and consistency: one stat-row style, the Plan
"Up next" card, the enrolled Player at 1280/900, the hairline on every Columns route, and the
mobile-B leftovers in `src/ui` (ListRow line props, ToggleChip compact). Pair loop: engineer
change → export + capture → designer (fable) review, ≤ 2 rounds, PASS = no screen < 4.

Owned paths (exclusive): `apps/mobile/src/ui/**`, `apps/mobile/src/components/ExercisePage.tsx`,
`apps/mobile/src/components/exerciseStats*.ts`, `apps/mobile/app/(tabs)/{plan,programs}.tsx`,
`apps/mobile/src/player/components/{PlayerView,ProgramHome}.tsx` (after PROG-3's commit),
`apps/mobile/src/player/playerRing*.ts`, `docs/design/ui-columns.js`, `docs/design/ui-measure.js`,
`docs/design/ui-desktop.md`, `docs/design/reviews/UI-Pdesktop-r4*.md`, this sheet.
Read-only: everything else. Adjacent (live): `src/components/landing/*` + `app/_layout.tsx`
(landing stream), `src/library/*`, `src/components/progress/*`, `src/components/settings/*`
(mobile-B, done; edit only for the titleLines adoption listed in task 3 and say so), strava
files, feed files.
Shared: `apps/mobile/CLAUDE.md` (Lead owns; you Edit the Layout/columns lines only, marked
`shared with Lead`).
Time box: 70 min (tasks 20 + 20 + 15 + designer 10 + one fix round 5). Hard stop: report what
passed and what did not; never let the box pass during a capture.
Ports: web 8897 / API 8898, own `--persist-to` copy, scratch dist; `ps -ef | grep "port 889"`
before picking; never :8787/:8790/:8081.
Contracts (frozen): `pageMaxWidth` 1360, page 1216 / inner 1152 at 1280, 6/6 below 1024, 1024
pins 544/392 · 388/548 · 468/468 (`columns.ts`, ui-desktop.md); Forge tokens only; no new fonts
or deps; `Text` variants as in tokens.ts; `ListRow` API additive only (`titleLines`,
`subtitleLines`, `tabularTitle`); nothing in `playerMachine.ts`, `cues.ts`.
Runtime proof: the `ui-check` skill on the exported build signed in to the seeded worker
(data state: seeded month, Programs enrolled on day 3 via the Programs screen before the
capture); captures `UI-Pdesktop-r4-<route>-{1280,900}-{light,dark}.png` into
`docs/design/screens/` with one `Commit:` per run (ui-check skill), plus a
`docs/design/screens/UI-Pdesktop-r4-rows.html` gallery fragment (gallery markup: ask the Lead
for the source path) so the publish is one call; probe tables from `ui-columns.js` (frame
32/1216 on every route, overflow 0) and `ui-measure.js` (`small: []`).
Assumes (cross-team): PROG-3 committed PlayerView's reps branch (Lead names the sha at
dispatch) — keep it byte-identical; landing stream owns `_layout.tsx`; feed at 900 reports
overflow 7 (feed team's; report, do not fix).
Docs: `apps/mobile/CLAUDE.md` Layout lines (team-lead, Edit, before the final report);
`docs/design/ui-desktop.md` numbers updated by the engineer whose task changes them.
Tasks (sequential by construction; children of a team-lead run one at a time):
- R4a · engineer/sonnet · 20 min · `src/ui`: `ListRow` `titleLines`/`subtitleLines`/`tabularTitle`
  (additive), `ToggleChip` `compact`; one stat-row rule: pick in-card tiles (StatRow) for Today,
  Plan, Programs, Activity and remove the bare and tile-less variants; Columns hairline verified on
  Settings/Location/Activity by capture; Plan "Up next" compact card (design ui-polish §Plan);
  Programs fill ≥ 90 % at 1280 (measure main column end / 800). Gate green on own files.
- R4b · engineer/sonnet · 20 min · Player enrolled state at 1280/900 (ring 280 + clock, per
  ui-polish Player row; enrol the seed first), Today "Sets / Back Squat" single label row, Plan
  rest rows ≥ 64, Library/Library-detail/Progress desktop fill (Library list 4–5 rows visible,
  detail 2 columns, Progress chart card fills main) using the new ListRow props (adoption in
  mobile-B files allowed, listed in the report as `shared with mobile-B (done)`).
- R4c · capture + designer review · fable designer 10 min · all routes at 1280 + 900, light and
  dark; scores per screen; PASS bar as above; fix list by SendMessage to the engineer, ≤ 1 fix
  round (5 min) then final capture.
Budget: 1 engineer at a time (harness), 1 designer, ≤ 2 review rounds. Reports ≤ 40 lines;
interim after R4a with the file list and markers (`shared with`, `imports untracked`).
Forbidden: dependency changes, root config, files outside owned paths, `git commit`, the
owner's ports, `rm -r*`, `git push|reset|checkout`, `wrangler deploy|login|secret|d1 execute`,
`eas *`.
Report: team report format from `.claude/agents/team-lead.md`, with the `Commit:` line of the
final capture and the gallery fragment path.
