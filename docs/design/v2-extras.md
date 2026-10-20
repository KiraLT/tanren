# v2 extras: Progress (history), Settings, web install (PWA)

Status: accepted (Lead delegation, 2026-10-21) · Sheet: `docs/tasks/v2-extras.md` · Plan: Amendment 4
("think yourself what to do"). Normative for team extras; names below are frozen once X1 lands.

## 0. Verified facts (2026-10-21)

| Fact | Source |
| --- | --- |
| Better Auth 1.7.11 `POST /api/auth/sign-out`: body optional (`{callbackURL?, disableRedirect?, state?}`), `requireHeaders`, deletes the session + cookie, 200 `{ success: true }` | `node_modules/.pnpm/better-auth@1.7.11*/…/dist/api/routes/sign-out.mjs` |
| Worker mounts every `/api/auth/*` on Better Auth; `trustedOrigins` = `ALLOWED_ORIGINS` → sign-out needs **no worker change** | `apps/worker/src/auth/authRoutes.ts:52`, `BetterAuth.ts:32-34` |
| Local `ALLOWED_ORIGINS` = `http://localhost:8081,http://localhost:8790` (credentialed calls only from these) | `apps/worker/wrangler.jsonc:10` |
| Expo generates **no** manifest and **no** service worker. PWA = hand-written `public/manifest.json` + icons in `public/`; for `web.output: "single"` link it from a template `public/index.html` (`expo customize public/index.html`). Offline shell = Workbox `generateSW` after export (not one flag) | docs.expo.dev/guides/progressive-web-apps |
| `react-native-svg` for SDK 58 = `15.16.0` | `apps/mobile/node_modules/expo/bundledNativeModules.json:115` |
| `seedIfEmpty` seeds only when signed out **and** the store has no exercises | `apps/mobile/src/store/seed.ts:69-76` |
| `rekeyLocalUser` skips when `sync_state.ownerUserId` = user; else moves `LOCAL_USER_ID` rows and drops the pull cursor | `SyncEngine.ts:294-304`, `syncQueries.ts:78-120` |
| `CurrentUser` is resolved once per runtime; offline falls back to stored `ownerUserId` | `CurrentUser.ts:28-40` |
| Holds log seconds in `reps`; history shows the raw number | ADR-0007 Q4, Consequences |
| `Session.finishedAt` (not `endedAt`); `WorkoutSet.loggedAt`; `PlannedSession.name: Label` | `packages/shared/src/{session,plan}.ts` |

VERIFY (engineer, against installed types / runtime): V1 Chrome installs without a service
worker (fetch-handler criterion removed in current Chrome) — proof in X5; V2 `react-native-svg`
renders under `react-native-web` in the export (X3 proof); V3 Workers static assets serve `.json`
as `application/json` (curl in X5); V4 `pnpm -F @tanren/mobile exec expo customize public/index.html`
works under the isolated linker (else hand-copy the head of today's `dist/index.html`, no script tags).

## 1. Progress screen (History)

Route `app/(tabs)/progress.tsx`, tab title "Progress" (tab line added by design, §5). Reads the
**local store only** (rows are synced down; ADR-0006/INT-2), no endpoint, no `userId` filter
(one owner per device, `apps/mobile/CLAUDE.md` §Plan screen). Live rows only (`deletedAt IS NULL`
on set **and** session).

### 1.1 Pure math — `apps/mobile/src/services/progressMath.ts` (no Effect, node tests)

```ts
/** Epley. reps 0 → 0; reps 1 → weightKg; weightKg 0 → 0. Rounded to 0.1 kg for display only. */
export const epley1Rm = (weightKg: number, reps: number): number   // w * (1 + reps / 30), reps>=1
/** Total order for "better set": e1RM, then reps, then weightKg. Bodyweight (0 kg) → reps decide. */
export const SetScore: Order.Order<Pick<ScoredSet, "weightKg" | "reps">>
export interface ScoredSet { readonly weightKg: number; readonly reps: number; readonly loggedAt: DateTime.Utc; readonly id: string }
/** Set i is a PR iff some earlier set exists and score(i) > max score of all earlier sets (by loggedAt, id). */
export const markPrs: <S extends ScoredSet>(chronological: ReadonlyArray<S>) => ReadonlyArray<S & { readonly isPr: boolean }>
/** Local ISO week (Monday 00:00 in CurrentTimeZone). History buckets only; plan weeks stay any weekday (ADR-0007 Q3). */
export const weekStartOf: (at: DateTime.Zoned) => string /* LocalDate, YYYY-MM-DD */
```

The first-ever set of an exercise is never a PR (nothing to beat).

### 1.2 Service — `apps/mobile/src/services/HistoryRepo.ts`

```ts
export interface ExerciseSummary {
  readonly exercise: Exercise
  readonly lastLoggedAt: DateTime.Utc
  readonly best: WorkoutSet          // max by SetScore over all live sets
  readonly bestE1Rm: number
  readonly totalSets: number
}
export interface WeekBucket { readonly weekStart: string /* LocalDate */; readonly volumeKg: number; readonly sets: number; readonly reps: number }
export interface ExerciseHistory {
  readonly exercise: Exercise
  readonly best: Option.Option<WorkoutSet>
  readonly bestE1Rm: number
  readonly weeks: ReadonlyArray<WeekBucket>          // exactly 8, oldest first, current week last, zero-filled
  readonly e1RmTrend: ReadonlyArray<{ readonly weekStart: string; readonly e1Rm: Option.Option<number> }> // 8, best per week
  readonly recent: ReadonlyArray<{ readonly session: Session; readonly sets: ReadonlyArray<WorkoutSet & { readonly isPr: boolean }> }> // newest 10 sessions
}
export interface SessionSummary {
  readonly session: Session
  readonly title: string             // live linked PlannedSession.name, else "Workout"
  readonly durationMinutes: Option.Option<number> // finishedAt − startedAt, floor
  readonly sets: number; readonly exercises: number; readonly volumeKg: number; readonly prs: number
}
export interface HistoryRepoShape {
  readonly exercises: Effect.Effect<ReadonlyArray<ExerciseSummary>, StoreError>            // only exercises with ≥1 live set, lastLoggedAt desc
  readonly exercise: (id: ExerciseId) => Effect.Effect<Option.Option<ExerciseHistory>, StoreError, DateTime.CurrentTimeZone>
  readonly sessions: (limit: number) => Effect.Effect<ReadonlyArray<SessionSummary>, StoreError> // startedAt desc; UI pages by 30
}
export class HistoryRepo extends Context.Service<HistoryRepo, HistoryRepoShape>()("@tanren/HistoryRepo") {
  static readonly layer: Layer.Layer<HistoryRepo, never, LocalStore>
}
```

Rules: reads through `LocalStore.all` + `decodeRecords(XRow)` (as `PlanWeekRepo`); ≤ 3 SELECTs per
method; window = `DateTime.now` in `CurrentTimeZone`, 8 weeks back to the current week's Monday;
`prs` per session = sets in it with `isPr` (PR computed over the exercise's full history, so a
session's PR count is stable); `volumeKg = Σ weightKg·reps` (0 for bodyweight; the chart then
plots `reps`). Hook `src/hooks/useHistory.ts` re-runs on `StoreEvents` like `useToday`
(subscribe only; never edits `StoreEvents.ts`). Registration in `runtime.ts` is one line in
`AppLayer`'s `mergeAll` (owner MOBILE-2/Lead, §5).

### 1.3 Charts — decision

Hand-rolled SVG with `react-native-svg` 15.16.0 (`Svg`, `Rect`, `Polyline`, `Line`), geometry in a
pure `src/components/chartGeometry.ts` (bars → `{x,y,width,height}`, sparkline → `points` string,
empty/all-zero → flat baseline), tested in node. Components `WeekBars.tsx` (8 bars, value label on
the last) and `Sparkline.tsx` (e1RM trend, gaps for weeks without sets). Colours from design D1
tokens. Why: two fixed chart shapes; a library (victory-native needs Skia + Reanimated;
gifted-charts wraps the same `react-native-svg`) adds weight and its own styling for nothing;
plain `View` bars cannot draw the sparkline; `react-native-svg` is in Expo Go and the illustrations
work needs it anyway. Accessibility: each chart has `accessibilityLabel` summarising the values
("Volume last 8 weeks: … kg").

### 1.4 UI

List view: segmented control "Exercises | Sessions". Exercise row: name, best set `100 kg × 5`,
`e1RM 116.7 kg`, last logged date. Session row: date, title, duration, `sets · exercises · volume`,
`PR ×n` badge. Exercise detail `app/progress/[exerciseId].tsx` (root Stack, no layout edit):
best set card, `WeekBars`, `Sparkline`, recent sessions with a `PR` badge on PR sets. Wide (≥ 900,
`useLayoutMode`): list main, detail of the selected exercise in `Screen`'s `aside`. Empty state:
"Log your first set on Today". Units: kg (ADR-0007).

## 2. Settings and sign-out

Route `app/settings.tsx` (root Stack; reached from a gear button in the Progress header — no
fifth tab). Rows: Account, Appearance, Units, Data, About.

### 2.1 `apps/mobile/src/services/Account.ts`

```ts
/** get-session body; email added to the INT-2 shape. */
export const AccountSessionBody = Schema.NullOr(Schema.Struct({ user: Schema.Struct({ id: UserId, email: Email }) }))
export class SignOutFailed extends Data.TaggedError("SignOutFailed")<{ readonly reason: "offline" | "server" }> {}
export interface AccountShape {
  /** None when signed out; fails offline (UI then shows "Signed in (offline)" from CurrentUser). */
  readonly session: Effect.Effect<Option.Option<{ readonly userId: UserId; readonly email: Email }>, SignOutFailed>
  /** POST /api/auth/sign-out {} with credentials, then forgets the owner. */
  readonly signOut: Effect.Effect<void, SignOutFailed>
}
export class Account extends Context.Service<Account, AccountShape>()("@tanren/Account") {
  static readonly layer // needs SqlDriver (BaseLayer) + FetchHttpClient, apiBaseUrl
}
export const forgetOwner: SqlStatement // DELETE FROM "sync_state" WHERE "key" = ? [OWNER_USER_ID_KEY]
```

Same request options as `CurrentUser.fetchSession` (`credentials: "include"`, tracer propagation
off, 3 s timeout, `content-type: application/json`, body `{}`).

### 2.2 Local-data policy on sign-out — decision: keep rows, forget the owner

Sequence (web only; native never shows Sign out, sign-in is web-only per `apps/mobile/CLAUDE.md`):
1. `POST /api/auth/sign-out`; non-2xx or network error → `SignOutFailed`, nothing local changes
   (the HttpOnly cookie can only be cleared by the server; UI: "Sign-out needs a connection").
2. `forgetOwner` (one statement through `SqlDriver.batch`).
3. Full reload `window.location.assign("/today")` so the runtime and `CurrentUser` rebuild.

Result: `get-session` → null → signed out; offline fallback finds no owner → signed out too;
store not empty → no demo seed; Today/Plan/Progress still show the user's rows. Unsynced
(`_dirty`) rows stay dirty and push after the **same** user signs in again: the re-key runs (owner
missing), moves rows logged while signed out from `LOCAL_USER_ID` to the user, drops the cursor,
and the full pull is last-write-wins. Why keep: the device is single-owner (plan: personal app),
nothing is lost offline, no SyncEngine change. Not decided: a *different* user on the same device
(still "not built", needs a full wipe — follow-up ADR); the Settings copy says "Data on this device
is kept".

### 2.3 Other rows

- Appearance: System / Light / Dark through design D1's theme preference API (§5 request R2).
- Units: static "Kilograms (kg). Pounds are not supported." (ADR-0007).
- Data → "Export my data" (web): `DataExport` (§3) built by `src/services/DataExport.ts`
  (`exportAll: Effect<string /* JSON */, StoreError>`, live rows, `exportedAt` from `DateTime.now`),
  downloaded by `src/hooks/useExportData.web.ts` (Blob + object URL + `<a download="tanren-export-YYYY-MM-DD.json">`);
  `useExportData.ts` (native) returns `Option.none()` and the row reads "Export on the web app".
- About: `Tanren <expo.version>` via `expo-constants` `expoConfig.version`, links to tanren.me.

## 3. Shared contract — `packages/shared/src/dataExport.ts`

```ts
export const DataExport = Schema.Struct({
  format: Schema.Literal("tanren.export"),
  version: Schema.Literal(1),
  exportedAt: Timestamp,                         // common.ts
  userId: Schema.OptionFromNullOr(UserId),       // ids.ts; null when signed out
  rows: Schema.Array(SyncChange),                // sync.ts; live rows of all 8 SyncTables
})
export type DataExport = typeof DataExport.Type
```

Wire example (encoded):

```json
{ "format": "tanren.export", "version": 1, "exportedAt": "2026-10-21T08:00:00.000Z",
  "userId": "8f0c…-4…", "rows": [ { "table": "exercise", "row": { "id": "…", "userId": "…",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "name": "Bench press", "aliases": [],
  "muscleGroups": ["chest"], "notes": null } } ] }
```

Reusing `SyncChange` makes the file re-importable later through the sync push path. Barrel: one
append-only line `export * from "./dataExport"` in `packages/shared/src/index.ts`.

## 4. Web install (PWA)

- `apps/mobile/public/manifest.json`: `name` "Tanren", `short_name` "Tanren", `id` "/",
  `start_url` "/today", `scope` "/", `display` "standalone", `background_color` + `theme_color`
  = D1 token hex values (a node test `manifestTokens.test.ts` asserts equality with the tokens),
  `icons`: `icons/icon-192.png` (192), `icons/icon-512.png` (512), `icons/maskable-512.png`
  (512, `purpose: "maskable"`, art inside the 80 % safe zone), `icons/icon.svg` (`sizes: "any"`).
- Art: one hand-written `public/icons/icon.svg` (geometric mark, paths only — no text, so no font
  dependency). PNGs are rendered **once** from it by headless Chrome (`agent-browser` at the exact
  viewport, `screenshot`) and committed; `apple-touch-icon.png` (180) for iOS Safari.
- `apps/mobile/public/index.html` (template, `expo customize`): today's head plus
  `<link rel="manifest" href="/manifest.json">`, `<meta name="theme-color" content="…">`,
  `<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">`,
  `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`. No `app.json` change.
- `_headers`: unchanged (all same-origin, COEP `require-corp` allows it; `.json` content type is
  the asset default, V3). No service worker: offline shell is out of scope (Workbox step, §0).

## 5. Cross-team requests (the Lead adds them to the owners' sheets before fan-out)

- R1 design (owner of `app/(tabs)/_layout.tsx`): add `<Tabs.Screen name="progress" options={{ title: "Progress" }} />` (+ D1 icon).
- R2 design D1: theme preference API — `ThemePreference = "system" | "light" | "dark"` with a hook
  returning the current value and a setter (persistence is D1's call). Names are D1's; extras reads
  them from `src/ui/**` after D1. If D1 ships no setter, Settings shows "Follows system" (read-only).
- R3 owner of `apps/mobile/package.json` + catalog + lockfile (design D1 or illustrations foundation,
  whoever runs first): `react-native-svg` `15.16.0`.
- R4 owner of `src/services/runtime.ts` (MOBILE-2 now; afterwards the Lead): one line adding
  `HistoryRepo.layer` and `Account.layer` to `AppLayer`'s `mergeAll`; extras does it itself if the
  file is free when X2 finishes (Lead says which).
