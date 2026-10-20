# ADR-0007: Data model decisions (data-model.md §14, Q1–Q5)

Date: 2026-10-20 · Status: **accepted** (Lead decision under owner delegation, 2026-10-20; plan Amendment 3) · Author: architect

## Context

`docs/design/data-model.md` §14 left five questions for the owner. Steps 1–3 and 6 have since been
built on the design as written: shared schemas, D1 tables and seed, the sync endpoint, and the
mobile local store all encode the current answers. Each question is therefore "keep or change
what exists", and the owner has delegated the call to the Lead.

## Decision

1. **Enum lists (Q1).** Keep the §5 lists (`MuscleGroup`, `GoalKind`, `EquipmentKind`, and the
   rest) as they are. **Adding** a member is additive: extend the `Schema.Literals`, nothing else;
   the values live in JSON text columns (D1 and expo-sqlite), so no migration and no ADR.
   **Renaming or removing** a member needs an ADR plus a data migration (D1 via
   `drizzle-kit generate --custom`, ADR-0006 §2; a mobile store migration step for local rows).
2. **Pull cursor (Q2).** Yes. `since` is an opaque, server-issued `SyncCursor`, format
   `"<seq>:<rank>:<id>"` as implemented in `packages/db/src/sync/Cursor.ts`. Clients store and
   return it unchanged and never parse it; the format may change without a client release.
3. **Week start (Q3).** `PlanWeek.weekStart` stays any weekday; no Monday-only invariant in
   schema or server. The seed and the Plan screen **default** to Monday-start weeks, but UI code
   renders day columns from `weekStart` (+0…+6 days) and never assumes Monday.
4. **Bodyweight, holds, AMRAP (Q4).** Keep: bodyweight sets log `weightKg: 0`, timed holds log
   seconds in `reps`, `RepTarget` has no `Amrap` member. Revisit with an additive exercise `kind`
   when running support arrives (plan: "Running support comes later").
5. **Profile extras (Q5).** None. No bodyweight field, no units preference; kg only, per plan.

## Consequences

- No code changes; the shipped schemas, tables, seed and local store already match.
- Q3 adds a rule for the step 7 Plan screen: a week starting on Wednesday renders Wed…Tue; one
  test with a non-Monday `weekStart` guards it.
- Q4 overloads `reps` (count or seconds). History views show the raw number; the later exercise
  `kind` disambiguates, and migrating existing rows then is a no-op (values stay numbers).
- Q1 makes enum growth cheap; the drift test in `@tanren/db` (ADR-0006) still runs on every change.

## Alternatives considered

- Client timestamp as `since`: breaks under clock skew (data-model.md §10.1). Rejected.
- Monday-only `weekStart`: simpler UI, but removes the owner's freedom to start a cycle midweek
  and would need a schema check plus migration later. Rejected.
- Exercise `kind` and `Amrap` now: speculative until running support is designed. Deferred.
- Units preference: contradicts the plan (kg only). Rejected.

Not decided here: the shape of the exercise `kind` union and the running data model; both wait
for the running-support step, which the plan has not scheduled.
