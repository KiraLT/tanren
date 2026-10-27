# ADR-0026: Guided programs the user and Claude create, edit, swap and run — via MCP and in the app

Status: accepted (Lead decision under plan Amendment 3; owner words in plan Amendments 21 and 22, 2026-10-27 14:34 /
14:36). Design: `docs/design/programs-mcp.md`. Tasks: `docs/tasks/v6b-programs.md`.

## Context
Guided programs are static code (`packages/shared/src/programs/`: `Program`, `ProgramDay`, `ProgramItem = TimedItem |
RepsItem`, ADR-0020; one built-in, Core 30). Only progress is synced (`programEnrollment`, `programDayCompletion`,
v2-programs.md §2); `ProgramEnrollment.programId` is a `ProgramId` (= `Slug` brand, `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`,
≤ 64) and `status` is `active | completed | abandoned`. The MCP server has nine tools, none for programs. The mobile
`ProgramRepo` is built against a finder (`ProgramRepo.layerWith(findProgram)`); the Programs tab assumes one program
(`useProgramDay`: `NotEnrolled` defaults to `CORE30`) and one active enrollment. Nutrition (ADR-0025) is landing
migration 0008 and mobile store v5 at the same time. The owner asked for programs he and Claude can create and
modify (A21), then (A22) an in-app editor, several concurrently active programs with a `paused` status, an exercise
swap inside the player and a second default 12-week program.

## Decision
1. **A synced, user-owned `program` table** (entity `UserProgram`, migration 0009, mobile store v6). `days` is a
   JSON column of the existing `ProgramDay` array (same `ProgramItem` union and per-day checks), `schedule` a JSON
   `ProgramSchedule` (days per week or a weekday list; shown, not enforced — the player stays day N → N+1), `source`
   `mcp | manual`, `version` bumped by every write, `slug` unique per user among live rows. `durationDays` is derived.
   Built-ins stay in code and appear in the same read model (`ProgramSummary`) with `source: "builtin"`.
2. **One `ProgramId` namespace, enrollment keys unchanged.** A custom program's `programId` is its row `id` (a lowercase
   UUID satisfies the `Slug` pattern; 36 < 64). Built-ins keep slugs (`core-30`, `lean-build-12`). The mobile finder
   becomes "built-ins, then local `program` rows" (effectful).
3. **Statuses and concurrency.** `EnrollmentStatus` gains `paused`. Several programs may be active at once (the
   existing index already allows one live active enrollment per program). `paused` freezes `currentDay`, blocks
   completions (existing `EnrollmentNotActive`) and hides the program from Today; `completed` is written only by
   `ProgramRepo.complete` past the last day; `completed`/`abandoned` are terminal. Today lists every active program's
   due day; the Programs tab shows every active/paused enrollment with a chip.
4. **Swaps are per enrollment, keyed by the ORIGINAL catalog id**: `programEnrollment.swaps: Array<{ from, to }>`
   (JSON column, ≤ 30) rather than a `program_swap` table — one row update per swap, no new sync member or parent
   edge, works on built-ins without editing them, persists across days and syncs with the enrollment. Candidates:
   same `kind`, ≥ 1 shared primary muscle, available at the active location, ranked by muscle overlap then equipment
   difference (`swapCandidates`, pure, shared). "Revert to original" removes the entry. Accepted cost: two devices
   swapping offline at once resolve last-write-wins on the whole array.
5. **Nine MCP tools**: `list_programs`, `get_program`, `get_program_progress` (read); `write_program` (create or
   replace by slug, same id), `update_program`, `delete_program` (soft; refuses while enrolled unless `force`),
   `enroll_program`, `set_enrollment_status`, `swap_exercise` (write). Descriptions teach Claude to build a program
   from the catalog (ids via `search_exercises`, timed vs reps per ADR-0020, rest defaults, week structure,
   progression) and name the errors; soft problems come back as `warnings`, never as failures.
6. **Validation at the boundary**, in Schema: 1–60 days, 1–12 items per day (the existing `ProgramDay` cap the day
   screen is laid out for; the brief's 20 is deferred), timed 10–600 s, reps 1–100, rest 0–300 s, rounds 1–5. Catalog
   ids are checked with the shared, pure `findCatalogExercise` — no DB read.
7. **In-app authoring (Forge)**: Programs tab "+" → New (blank or duplicate any program, built-ins included, as a
   `manual` row) → program editor (title, summary, schedule, days with up/down reorder) → day editor (rounds, round
   rest, item cards with Timed/Reps segmented control, value and rest steppers, up/down/remove, exercise picker
   filtered by the active location). Every save writes the row and bumps `version`; no draft state. Delete only when
   no enrollment is active or paused. Reorder is up/down, not drag (RN web).
8. **Second built-in "12-Week Lean Build"** (`lean-build-12`, 84 days): push / pull / cardio / legs / upper / cardio /
   recovery each week, three 4-week blocks (reps 12 → 10 → 8, rest 60 → 75 → 90 s, cardio 15 → 20 → 25 min), generated
   from templates like Core 30; every id verified against the catalog; neutral name, no author or brand anywhere.
9. **Sync**: `program` is a normal push/pull table; every exhaustive consumer is listed with an owner in design §2.

## Consequences
- Claude designs, revises, enrols, pauses and swaps from the Claude app; the owner edits the same rows in the app;
  the player runs both built-in and custom programs unchanged apart from swaps and the explicit `enrollmentId`.
- Replacing a program the user is enrolled in may leave `currentDay > days.length`: `dayOf` is `None`, the tab shows
  `ProgramFinished`, and `write_program` says so in `warnings`.
- `tools/list` grows from 13 (after nutrition) to 22; N-S3's assertion changes (sheet, P-S2). Migration `meta` and the
  Worker repos are serialised behind the nutrition server team (sheet R1).
- Deferred: drag-and-drop reorder; per-item patching in `update_program` (days are replaced whole); schedule
  enforcement / calendar placement; > 12 items per day; sharing programs between users.

## Alternatives considered
- Programs as `plan`/`plannedSession` rows: wrong shape (holds, rounds, rest); the player consumes `ProgramDay`.
- A second id type for custom programs in the enrollment: touches every enrollment consumer for no gain.
- A `program_swap` table: a new sync member with a parent edge and five more consumers, for a ≤ 30-entry array.
- Swaps keyed by `(dayNumber, index)`: would not persist across days, which the owner asked for.
- One active enrollment per user (the first draft of this ADR, 14:40): overridden by Amendment 22 at 14:36.

## Overrides
- 2026-10-27 14:36 (reached the architect at 14:40, applied in the same run), owner, forwarded by the Lead:
  authoring is NOT deferred (in-app editor + duplicate a built-in), every enrollment has `status: active | paused |
  completed | abandoned` with several active programs and Today listing each due day, "Swap exercise" in the player
  (similar by muscle, `kind`, location equipment; stored per enrollment; revert), and a second default 12-week
  lean-build program (neutral name). Changed: decisions 3, 4, 7, 8; tools 7 → 9; design §4 editor/swap/Today rows,
  §7 program table; sheet tasks P-D1, P-M3, P-M4.
