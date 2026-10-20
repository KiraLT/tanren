# Step 1 — ready-to-dispatch briefs (written 2026-10-19 by the Lead)

Paste each brief into an Agent call (`subagent_type` + `model` as given). All
briefs assume: CLAUDE.md is auto-loaded; the engineer reads
`packages/shared/CLAUDE.md`, `.claude/skills/effect-conventions/SKILL.md`,
`.claude/rules/effect.md`, `.claude/rules/tests.md`, and the named sections of
`docs/design/data-model.md` (normative, implement verbatim). Every brief ends
with: `pnpm check` green from the repo root with output pasted; files ⊆ scope;
nothing committed; engineer report format.

## S1-T4 — user + exercise + errors  (engineer / opus; depends on S1-T3 green)
Goal: `src/user.ts` (User, Profile + Insert/Patch), `src/exercise.ts`
(Exercise + Insert/Patch, MuscleGroup), `src/errors.ts` (NotFound, Forbidden,
ValidationError with `issues` + `fromIssue`/`fromSchemaError`, SyncConflict;
all `Schema.TaggedError` with `httpApiStatus`), per data-model §5 (GoalKind,
EquipmentKind, MuscleGroup), §6 Goal/Equipment, §7.1–7.3, §8, §9. Import ids
and common from S1-T3 (names listed in its report / barrel).
Scope: src/user.ts, user.test.ts, exercise.ts, exercise.test.ts, errors.ts,
errors.test.ts (replace the `export {}` stubs). Nothing else.
Done when: `Goal`/`Equipment` with kind `other` and no note fails with path
`["note"]`; alias duplicates fail case-insensitively and an alias equal to the
name fails; `UniqueArray(MuscleGroup)` rejects duplicates; `encodeSync` of each
error yields `_tag` + fields; `ValidationError.fromSchemaError` maps a nested
failure path; Profile/Exercise round-trip (`Equal.equals`), null ↔ None on
every Option field; Patch has the three states (absent / value / null→None).

## S1-T5 — plan + session  (engineer / opus; depends on S1-T3 green; parallel with T4)
Goal: `src/plan.ts` (Plan, PlanWeek, PlannedSession, PlannedSet + Insert/Patch,
PlanStatus, RepTarget Exact|Range) and `src/session.ts` (Session, WorkoutSet +
Insert/Patch) per data-model §5 (PlanStatus), §6 RepTarget, §7.4–7.9, §8.
Scope: src/plan.ts, plan.test.ts, session.ts, session.test.ts.
Done when: `Range` with `min ≥ max` fails with path `["max"]`; `Session` with
`finishedAt < startedAt` fails on decode, on `new`, and on `SessionInsert`;
`new WorkoutSet(bad)` throws an `Error` whose `cause` satisfies
`SchemaIssue.isIssue`; `WorkoutSet.makeEffect` fails typed; Patch omits
`sessionId`/`plannedSessionId`/`planWeekId`/`planId`; exhaustive `Match.tag`
over `RepTarget` compiles.

## S1-T6 — review of the foundation  (reviewer / opus; depends on S1-T3; parallel with T4/T5)
Review the S1-T3 diff (packages/shared/src/ids.ts, common.ts, index.ts, tests)
against its brief (task sheet) and the hard rules. Pattern findings that T4/T5
must follow (e.g. how `rowFields` is spread, brand construction, test style)
are forwarded by the Lead to the T4/T5 engineers via SendMessage immediately.

## S1-T7 — sync envelope  (engineer / opus → fable if the 8-member union typing resists; depends on T4 + T5)
Goal: `src/sync.ts` per data-model §10 exactly: `SyncTable`, `SyncChange`
union discriminated on `table`, `SYNC_TABLE_ORDER`, `MAX_PUSH_CHANGES`,
PushRequest/PushResponse, PullRequest (opaque `SyncCursor`)/PullResponse.
Scope: src/sync.ts, sync.test.ts.
Done when: the §10.4 push example decodes with `decodeUnknownSync(PushRequest)`
and re-encodes to equal JSON; the pull example decodes; 501 changes fail;
`since: null` → `None`; a function using `Match.discriminatorsExhaustive("table")`
over all eight members compiles; type-level test that `SYNC_TABLE_ORDER`
covers every `SyncTable` literal.

## S1-T8 — review of T4/T5/T7  (Lead runs the `review-fanout` workflow)
`Workflow({ name: "review-fanout", args: { scope: "packages/shared (all uncommitted changes)", brief: "<paste T4+T5+T7 done-criteria>", verifyVotes: 3 } })`.
Blocking findings → the engineer who wrote the file (SendMessage) → re-review.
If the workflow name is not found, run it via `scriptPath: .claude/workflows/review-fanout.js`
(run `/reload-skills` first in a fresh session).

## S1-T10 — skill truth-up  (engineer / sonnet; depends on T7; parallel with T8)
Align `.claude/skills/effect-conventions/SKILL.md` §2–§3 snippets with the
shipped code (data-model §15: branded units, Insert without id, §10 envelope,
`ValidationError.issues`/`fromIssue`, `table` discriminator example); add
`.claude/skills/effect-conventions/references/shared-examples.md` copied from
real files. Nothing under packages/ changes.

## S1-QA  (qa / sonnet; after T8 findings resolved)
Brief: data-model §13 criteria table with evidence; invalid data through
`decodeUnknownEffect` never throws; boundary values; Option present/absent;
`pnpm check` output. Writes `*.test.ts` only.

## S1-RETRO  (process-observer / opus; after QA)
Use `/retro 1`: dispatch summary = the Log in docs/tasks/step-1.md +
docs/retro/incidents.md. Apply accepted edits; record the next experiment in
docs/handoff.md.

## Step 1 close-out (Lead)
Update packages/shared/CLAUDE.md "Status"; mark tasks done; `/handoff`; report
to the owner: verified / not verified / decisions (ADR-0002/0003/0004,
data-model §14 Q1–Q5).
