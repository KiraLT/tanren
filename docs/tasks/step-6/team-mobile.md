# Step 6 — team mobile

Charter: Lead's charter (mobile). Owned: `apps/mobile/**` + catalog entries for mobile deps in
`pnpm-workspace.yaml`. Budget: 2 engineers in parallel, 2 review rounds. Started 22:09.

Skills for every engineer: `expo-mobile` (stub), `effect-conventions`, `monorepo`,
`superpowers:test-driven-development`, `superpowers:verification-before-completion`.
UI engineer (M4) also loads `frontend-design:frontend-design` before writing UI.

## Tasks

| id | title | model | depends | group | status |
| --- | --- | --- | --- | --- | --- |
| R1 | research: Expo in pnpm workspace, Router tabs + swipe, expo-sqlite (native + web), Expo Go | researcher/sonnet | — | A | done |
| M1 | scaffold + ALL deps + config + route placeholders | engineer/sonnet | — | A | done |
| M2 | store: SqlDriver, DDL/migrations, LocalStore, seed, runtime, useToday/useLogSet | engineer/opus | (M1 install for typecheck) | A | in-review |
| M3 | sync: SyncTransport (HTTP + mock server), SyncEngine, apiBaseUrl, useSync | engineer/opus | M1, M2 SqlDriver | B (after M1) | in-review |
| M4 | UI: Today screen, steppers, rest timer, Plan stub | engineer/sonnet | M1, M2 hooks | B (after M2) | done |
| RV | review (runs gate) | reviewer/opus | M1–M4 | C | done (round 1: CHANGES, 0 blocking) |
| QA | done-criteria | qa/sonnet | RV | C | todo |

## File ownership (disjoint)

- M1: `apps/mobile/{package.json,app.json,tsconfig.json,metro.config.*,babel.config.*,vitest.config.ts,expo-env.d.ts}`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, placeholder `app/(tabs)/{today,plan}.tsx`, catalog in `pnpm-workspace.yaml`, lockfile. Only M1 runs `pnpm install`.
- M2: `apps/mobile/src/store/**`, `src/services/{SqlDriver,LocalStore,runtime,TodayRepo}*.ts`, `src/hooks/{useToday,useLogSet}.ts`.
- M3: `src/services/{SyncTransport,SyncEngine,apiBaseUrl,MockSyncServer}*.ts`, `src/store/syncQueries.ts`, `src/hooks/useSync.ts`; may add one line to `app/_layout.tsx` to mount `useSync`.
- M4: `app/(tabs)/{today,plan}.tsx`, `src/components/**`, `src/hooks/useRestTimer.ts` (plain React, no Effect).

## Frozen team contracts

Local store (decided here): one SQLite table per synced entity, names from `ROW_TABLE`
(`@tanren/shared/row.ts`), **camelCase quoted column names** so a selected record decodes with
the shared `*Row` codecs unchanged; extra columns `"_dirty" INTEGER NOT NULL DEFAULT 0`,
`"_rejected" TEXT NULL` (reason). `sync_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)` holds
the pull cursor. No FK constraints. Migrations: ordered SQL list + `PRAGMA user_version`.
Local user: a constant `LOCAL_USER_ID` (UserId) until auth lands (step 3 integration).

```ts
// src/services/SqlDriver.ts (M2 writes first; M3 consumes)
export type SqlValue = string | number | null
export type SqlRecord = Readonly<Record<string, SqlValue>>
export interface SqlStatement { readonly sql: string; readonly params: ReadonlyArray<SqlValue> }
export interface SqlDriverShape {
  readonly all: (s: SqlStatement) => Effect.Effect<ReadonlyArray<SqlRecord>, StoreError>
  readonly batch: (ss: ReadonlyArray<SqlStatement>) => Effect.Effect<void, StoreError> // atomic
}
// class SqlDriver extends Context.Service<…>; layer = expo-sqlite; tests use node:sqlite (Node 24)
// StoreError: Data.TaggedError("StoreError")<{ cause: unknown }> (internal)

// src/hooks (React-facing; components see only these)
export type TodayState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Empty" }                       // no planned session today
  | { readonly _tag: "Failed"; readonly message: string }
  | { readonly _tag: "Ready"; readonly plannedSession: PlannedSession
      readonly exercises: ReadonlyArray<TodayExercise> }
export interface TodayExercise {
  readonly exercise: Exercise
  readonly plannedSets: ReadonlyArray<PlannedSet>
  readonly loggedSets: ReadonlyArray<WorkoutSet>     // today's session, this exercise
  readonly prefill: { readonly weightKg: number; readonly reps: number } // next planned set, else last logged
  readonly restSeconds: number                        // next planned set's restSeconds, default 120
}
export interface LogSetInput { readonly exerciseId: ExerciseId; readonly plannedSetId: Option.Option<PlannedSetId>
  readonly weightKg: number; readonly reps: number; readonly rpe: Option.Option<number> }
useToday(): { state: TodayState; reload: () => void }
useLogSet(): { logSet: (i: LogSetInput) => Promise<void>; pending: boolean }  // creates the session lazily
useSync(): { status: "idle" | "syncing" | "offline" | "error"; lastSyncedAt: Option<string>; syncNow: () => void }
useRestTimer(): { remaining: Option<number>; start: (seconds: number) => void; stop: () => void }
```

## Log

`HH:MM→HH:MM · task · role/model · tokens · tool uses · rounds · outcome`
22:09→22:11 · R1 · researcher/sonnet · 35k · 13 · 1 · done (docs/research/2026-10-20-expo-mobile.md)
22:09→22:15 · M1 · engineer/sonnet · 91k · 56 · 1 · done (tsconfig extends needed `.json`, fixed by M2)
22:09→22:16 · M2 · engineer/opus · 113k · 33 · 1 · done, gate green after fix
22:17→22:18 · M2 fix (tsconfig, test script, expo-crypto ids, StoreEvents) · opus · 125k · 9 · 1 · done
22:17→22:25 · M3 · engineer/opus · 123k · 40 · 1 · done, 33 tests
22:25→22:26 · M3 fix (sync into AppLayer) · opus · 127k · 3 · 1 · done
22:26→22:30 · M4 · engineer/sonnet · 76k · 21 · 1 · done, 49 tests, web bundle ok
22:31→22:33 · RV1 · reviewer/opus · 66k · 14 · 1 · CHANGES: 6 should, 3 nit, 0 blocking
22:34→ · fix round 1 · M2 (#1,#2,#7) ‖ M3 (#3,#5,#6,#8,#9)

## Follow-ups / escalations

- LOCAL_USER_ID + seeded rows: against the real server every local row is `forbidden` and seeded
  parents are `missingParent`, permanently `_rejected`. Step-3 integration must re-key `userId`
  on sign-in, clear `_rejected`, push or drop seeded parents (or skip the seed when signed in).
- RPE input absent on Today (rpe = none). Tab bar is default-light while screens are dark.
- Manual pass in browser + Expo Go (log → rest → swipe, offline) not done by any agent.
- Process: researcher role retired mid-step (coordinator); use `spike` (opus) for run-to-know questions.

## INT-2: LOCAL_USER_ID re-key procedure

From M3 (2026-10-20). `L` = `LOCAL_USER_ID`, `U` = the signed-in `UserId`. Tables `T` = all 8 `ROW_TABLE` values. The only user-id columns are `"userId"` on every table and `"id"` on `profile`; parent ids are entity ids and stay as they are.
- **When:** after sign-in, before the first push or pull. Run it whenever `sync_state` `ownerUserId` ≠ `U`. Every statement goes in one `SqlDriver.batch` (atomic), then `StoreEvents.bump`; the sync loop does not start until the batch commits.
- **Seed: push what real logs reference, drop the rest; skip the seed when signed in.** Seeded rows are clean (`_dirty=0`, never pushed). Pushing all of them would put a demo "active" plan and demo exercise names on the server, colliding with Claude's plan and the per-user unique names. Dropping all of them would turn sets logged against demo exercises into `missingParent`. Steps 1–2 keep only the parents that dirty rows need.
- **1. Mark referenced parents dirty**, in this order so dirtiness propagates up the chain:
  `UPDATE "planned_set" SET "_dirty"=1 WHERE "id" IN (SELECT "plannedSetId" FROM "workout_set" WHERE "_dirty"=1)`
  `UPDATE "planned_session" SET "_dirty"=1 WHERE "id" IN (SELECT "plannedSessionId" FROM "workout_session" WHERE "_dirty"=1 UNION SELECT "plannedSessionId" FROM "planned_set" WHERE "_dirty"=1)`
  `UPDATE "plan_week" SET "_dirty"=1 WHERE "id" IN (SELECT "planWeekId" FROM "planned_session" WHERE "_dirty"=1)`
  `UPDATE "plan" SET "_dirty"=1 WHERE "id" IN (SELECT "planId" FROM "plan_week" WHERE "_dirty"=1)`
  `UPDATE "exercise" SET "_dirty"=1 WHERE "id" IN (SELECT "exerciseId" FROM "workout_set" WHERE "_dirty"=1 UNION SELECT "exerciseId" FROM "planned_set" WHERE "_dirty"=1)`
- **2. Drop the rest of the seed:** for each `T`: `DELETE FROM T WHERE "userId"=? AND "_dirty"=0` with `[L]`. This includes the seeded profile.
- **3. Re-key and reset:** for each `T` other than profile: `UPDATE T SET "userId"=?, "_rejected"=NULL WHERE "userId"=?` with `[U, L]`. Every surviving row is already dirty, so the first push sends all of them. `updatedAt` stays the same: the server has none of these rows, so they insert as new.
- **Profile (§10.2: `id` = `userId`):** a clean seeded profile was deleted in step 2, and the first pull brings the server's profile. A dirty local profile (no UI edits it yet) is re-keyed on both columns: `UPDATE "profile" SET "id"=?1, "userId"=?1, "_rejected"=NULL WHERE "id"=?2` with `[U, L]`. That cannot hit a primary-key clash, because nothing has been pulled yet.
- **Cursor:** `DELETE FROM "sync_state" WHERE "key"='pullCursor'`, so the first pull fetches the user's whole history. Then upsert `('ownerUserId', U)` in the same batch, which makes a re-run a no-op.
- **Also needed:** replace `LOCAL_USER_ID` in TodayRepo, useLogSet and seed with a `CurrentUser` service, and run `seedIfEmpty` only when nobody is signed in. A *different* user signing in on the same device is a full local wipe, which is out of scope here.
- **Test** (node:sqlite + `MockSyncServer.transport(U)`): seed, log one set against a demo exercise, run the re-key. Assert:
  - no row still has `L`;
  - only the referenced exercise, planned set, planned session, plan week and plan survive, all dirty with `U`;
  - every `_rejected` is NULL, there is no `pullCursor`, and `ownerUserId` = `U`;
  - `syncOnce` then gives `rejected = 0` and leaves zero dirty rows;
  - a second re-key run changes nothing.
