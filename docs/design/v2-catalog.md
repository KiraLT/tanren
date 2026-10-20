# v2 — Exercise catalog (static shared data, illustrations, Library screen, `search_exercises`)

Status: normative for teams **catalog** and **illustrations** (`docs/tasks/v2-catalog.md`,
`docs/tasks/v2-illustrations.md`). Decisions are `accepted (Lead delegation)` (plan Amendment 3/4);
ADR-0013 (catalog as static shared data) records §1. Facts marked **VERIFY** are checked by the
engineer against installed types. Visual rules (palette, stroke, viewBox, figure proportions) come
from `docs/design/design-system.md` § "SVG illustration style guide" (design architect); this
document only fixes names, shapes and the build/validation contract.

## 1. Shape: the catalog is code in `packages/shared`, not DB rows

- `CATALOG: ReadonlyArray<CatalogExercise>` is a typed constant bundled into mobile and worker.
  No table, no migration, no sync, no REST endpoint; the app searches it offline, the MCP tool
  searches the same array. Owner edits = commit. User `exercise` rows gain an optional
  `catalogId` link (§4); the catalog never changes a user's names.
- Target 200–250 entries covering a commercial gym; ten data modules (§3) so ten engineers
  write them in parallel without touching the same file.

## 2. Schemas — `packages/shared/src/catalog/` (barrel: `export * from "./catalog"` in `index.ts`)

```ts
// catalog/taxonomy.ts
export const Slug = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Schema.isMaxLength(64))
export const CatalogId = Slug.pipe(Schema.brand("CatalogId"))           // e.g. "barbell-back-squat"
export const IllustrationId = Slug.pipe(Schema.brand("IllustrationId")) // default = the catalogId
export const ExerciseKind = Schema.Literals(["reps", "timed", "distance"]) // ADR-0007 Q4: additive
export const CatalogEquipment = Schema.Literals([
  "barbell", "dumbbell", "kettlebell", "cable", "machine", "smithMachine", "trapBar", "ezBar",
  "pullUpBar", "dipStation", "band", "bench", "box", "medicineBall", "abWheel", "foamRoller",
  "cardioMachine", "landmine", "plate", "suspensionTrainer",
])  // empty `equipment` array = bodyweight. Profile filter maps via `equipmentKindFor` (below).
export const MovementPattern = Schema.Literals([
  "squat", "hinge", "lunge", "horizontalPush", "verticalPush", "horizontalPull", "verticalPull",
  "carry", "rotation", "antiExtension", "antiRotation", "flexion", "isolation", "locomotion",
  "mobility",
])
/** Muscles reuse the shared `MuscleGroup` union (exercise.ts, 17 members) unchanged. */
export const equipmentKindFor: (e: CatalogEquipment) => EquipmentKind  // pure table, tested
```

```ts
// catalog/CatalogExercise.ts
export const CatalogExerciseFields = {
  catalogId: CatalogId,
  name: Label,                                               // canonical English gym name
  aliases: Schema.Array(Label).check(Schema.isMaxLength(12)),
  kind: ExerciseKind,
  primaryMuscles: Schema.UniqueArray(MuscleGroup).check(Schema.isMinLength(1), Schema.isMaxLength(3)),
  secondaryMuscles: Schema.UniqueArray(MuscleGroup).check(Schema.isMaxLength(4)),
  equipment: Schema.UniqueArray(CatalogEquipment).check(Schema.isMaxLength(3)),
  movement: MovementPattern,
  instructions: Schema.Array(Note).check(Schema.isMinLength(2), Schema.isMaxLength(4)),
  illustrationId: IllustrationId,
}
export class CatalogExercise extends Schema.Class<CatalogExercise>("@tanren/shared/CatalogExercise")(
  Schema.Struct(CatalogExerciseFields).check(primaryAndSecondaryDisjoint, aliasesDistinct),
) {}
/** Authoring shape for data modules: `illustrationId` optional (defaults to `catalogId`). */
export type CatalogExerciseSpec = Omit<CatalogExerciseEncoded, "illustrationId"> & { readonly illustrationId?: string }
```

```ts
// catalog/index.ts (built once at module load; data modules are plain `satisfies` arrays)
export const CATALOG: ReadonlyArray<CatalogExercise>            // all modules, module order then file order
export const CATALOG_BY_ID: ReadonlyMap<CatalogId, CatalogExercise>
export const findCatalogExercise: (id: CatalogId) => Option.Option<CatalogExercise>
export interface CatalogFilter { readonly query?: string; readonly muscle?: MuscleGroup;
  readonly equipment?: CatalogEquipment; readonly kind?: ExerciseKind }
/** Pure, offline. Ranking: exact name > name prefix > alias prefix > substring in name/aliases;
 *  `muscle` matches primary or secondary; empty filter returns the whole catalog in order. */
export const searchCatalog: (filter: CatalogFilter, limit?: number) => ReadonlyArray<CatalogExercise>
```

Building `CATALOG` decodes every spec with `Schema.decodeUnknownSync(CatalogExercise)` once at module
load — a bad entry is a defect caught by the test below, never at runtime in the app (the test runs
the same code). **VERIFY** the Effect 4 name of the sync decoder (`Schema.decodeUnknownSync`).

### Validation test — `packages/shared/src/catalog/catalog.test.ts` (part of `pnpm check`)
1. `CATALOG.length` between 200 and 300; every entry already decoded (module load did not throw).
2. `catalogId` unique; `name` and every alias unique case-insensitively **across the whole catalog**.
3. `illustrationId` is a `Slug`; `primaryMuscles ∩ secondaryMuscles = ∅` (schema check, asserted once).
4. Every `CORE30_CATALOG_IDS` (§3) exists with `kind: "timed"` and `core` among primary muscles.
5. Each data module exports ≥ 12 entries; `searchCatalog({ query: "squat" })[0].catalogId === "barbell-back-squat"`.
The "every `illustrationId` has an SVG" check lives in the illustrations validator (§5), which
imports `CATALOG` (mobile depends on shared; shared never reads `apps/`).

## 3. Data modules — `packages/shared/src/catalog/data/<group>.ts`, one engineer each

| module | scope (≈ count) | id rule / examples |
| --- | --- | --- |
| `chest.ts` | barbell/dumbbell/machine/cable presses, flys, dips, push-ups (22) | `barbell-bench-press`, `incline-dumbbell-press`, `cable-fly`, `push-up` |
| `back.ts` | rows, pull-ups, pulldowns, pullovers, face pulls (24) | `barbell-row`, `pull-up`, `lat-pulldown`, `seated-cable-row` |
| `shoulders.ts` | presses, raises, upright rows, rear-delt work (18) | `overhead-press`, `dumbbell-lateral-raise`, `arnold-press` |
| `arms.ts` | biceps, triceps, forearms (26) | `dumbbell-curl`, `ez-bar-curl`, `triceps-pushdown`, `skull-crusher` |
| `legs.ts` | squats, leg press, lunges, extensions, curls, calves (30) | `barbell-back-squat`, `leg-press`, `bulgarian-split-squat`, `standing-calf-raise` |
| `hips.ts` | hinges, deadlifts, hip thrusts, glute/adductor/abductor (22) | `conventional-deadlift`, `romanian-deadlift`, `hip-thrust`, `hip-abduction-machine` |
| `core.ts` | **must include every `CORE30_CATALOG_IDS`** (28) | see list below |
| `fullBody.ts` | kettlebell, olympic derivatives, carries, landmine, sled (22) | `kettlebell-swing`, `power-clean`, `farmers-carry` |
| `cardio.ts` | machines + locomotion, `kind: "distance"` or `"timed"` (14) | `treadmill-run`, `rowing-machine`, `assault-bike`, `jump-rope` |
| `mobility.ts` | stretches, mobility drills, warm-ups, `kind: "timed"` (18) | `cat-cow`, `worlds-greatest-stretch`, `couch-stretch`, `foam-roll-quads` |

Id rule: kebab-case canonical name; prefix the implement when the same movement exists with several
(`barbell-`, `dumbbell-`, `cable-`, `machine-`, `smith-`); bodyweight unprefixed. Names are the
owner's problem to not know — put every common gym synonym into `aliases` (`"OHP"`, `"military
press"`). Instructions: 2–4 imperative lines, ≤ 120 chars each, second person, no safety boilerplate.

**Frozen `CORE30_CATALOG_IDS`** (exported from `catalog/core30Ids.ts`, used by programs team, `kind: "timed"`):
`plank`, `side-plank`, `dead-bug`, `bicycle-crunch`, `mountain-climber`, `lying-leg-raise`,
`flutter-kick`, `russian-twist`, `hollow-hold`, `bird-dog`, `reverse-crunch`, `heel-touch`,
`crunch`, `sit-up`, `v-up`, `glute-bridge`, `superman-hold`, `scissor-kick`, `plank-shoulder-tap`,
`plank-hip-dip`, `toe-touch-crunch`, `leg-raise-hold`, `bear-crawl-hold`, `high-knees`.

### Re-key of the seed's hand-named exercises (`packages/db/src/seed/catalog.ts`)
Each `ExerciseSpec` gets `catalogId` (seed → `exercise.catalog_id`): Back Squat→`barbell-back-squat`,
Bench Press→`barbell-bench-press`, Conventional Deadlift→`conventional-deadlift`, Overhead
Press→`overhead-press`, Barbell Row→`barbell-row`, Romanian Deadlift→`romanian-deadlift`,
Pull-Up→`pull-up`, Incline Dumbbell Press→`incline-dumbbell-press`, Dumbbell Curl→`dumbbell-curl`,
Lateral Raise→`dumbbell-lateral-raise`, Bulgarian Split Squat→`bulgarian-split-squat`, Hip
Thrust→`hip-thrust`, Standing Calf Raise→`standing-calf-raise`, Hanging Leg Raise→`hanging-leg-raise`.
The seed test asserts every `catalogId` is in `CATALOG_BY_ID`.

## 4. Linking user `exercise` rows (foundation task V2-F1 changes; frozen)

- `ExerciseFields.catalogId: Schema.OptionFromNullOr(CatalogId)` (shared `exercise.ts`; `ExerciseRow`
  needs no JSON column); Drizzle `exercise.catalogId: text("catalog_id")`, index
  `exercise_user_catalog_idx (user_id, catalog_id)`; migration `0002_v2.sql` (shared with programs,
  v2-programs.md §2); mobile store migration v2 adds `"catalogId" TEXT` to `exercise`.
- Sync: not immutable (user may relink); LWW as any column. `SyncChange` member `exercise` picks it up.
- **Port for other mobile features** — `apps/mobile/src/services/ExerciseLink.ts` (team catalog):
```ts
export interface ExerciseLinkShape {
  /** Live exercise with this catalogId → its id; else a live exercise whose name/alias matches the
   *  catalog name or an alias (case-insensitive) → patch its catalogId, return it; else insert
   *  { name, aliases, muscleGroups: primary ++ secondary, notes: None, catalogId } and return the new id.
   *  Dirty-marks what it writes, emits StoreEvents like TodayRepo. */
  readonly ensure: (catalogId: CatalogId) => Effect.Effect<ExerciseId, StoreError>
}
export class ExerciseLink extends Context.Service<ExerciseLink, ExerciseLinkShape>()("@tanren/ExerciseLink") {
  static readonly layerNoDeps: Layer<ExerciseLink, never, LocalStore | StoreEvents | CurrentUser | IdGenerator>
}
```
  Team catalog adds `ExerciseLink.layerNoDeps` to `AppLayer` in `runtime.ts` (one line, announced;
  programs adds its own line — see v2-programs.md §6 for the single-owner rule).

## 5. Illustrations — one SVG per `illustrationId`, composed from a shared rig

Decision: **composer, not hand-drawn SVGs**. 250 hand-written files cannot keep one stroke width,
palette and proportion; a figure rig makes consistency a property of the code and lets sonnet
batch-engineers author *scenes* (joint angles + equipment glyphs) instead of paths.

- Source of truth: `apps/mobile/src/illustrations/scenes/b01.ts … bNN.ts` (one batch file ≈ 15
  ids, `export const scenes: ReadonlyArray<Scene>`), plus the primitives:
  `rig.ts` (side/front stick-figure: `Pose` = angles for neck, torso, upperArm, forearm, thigh,
  shin, foot per side; `drawFigure(pose, view, origin)` → path strings), `glyphs.ts` (equipment
  glyph per `CatalogEquipment`: `barbell`, `dumbbell`, `kettlebell`, `bench`, `rack`, `cable`,
  `machineSeat`, `pullUpBar`, `box`, `mat`, `band`, `plate`, `ball`, `abWheel`, `roller`), `style.ts`
  (constants copied from design-system.md §SVG style guide: `VIEW_BOX`, palette tokens, stroke
  widths, max bytes), `compose.ts` (`renderScene(scene): string` → a complete `<svg>`).
```ts
export interface Scene {
  readonly id: IllustrationId
  readonly view: "side" | "front"
  readonly figure: { readonly pose: Pose; readonly origin: Point; readonly scale?: number }
  readonly props: ReadonlyArray<{ readonly glyph: GlyphName; readonly at: Point; readonly rotate?: number; readonly scale?: number }>
  readonly floor: boolean
  readonly accent?: ReadonlyArray<string>   // ≤ 3 extra path `d` strings (motion arrow, cable line)
}
```
- Build: `pnpm -F @tanren/mobile illustrations:build` (`apps/mobile/scripts/illustrations.ts`, Node
  24 runs `.ts` directly — **VERIFY** type-stripping in the installed Node; else `tsx` dev-dep) writes
  `apps/mobile/assets/exercises/<id>.svg` (committed) and `apps/mobile/src/illustrations/generated/
  <batch>.ts` exporting `{ [id]: string }` maps + `generated/index.ts` → `ILLUSTRATIONS: Readonly<Record<IllustrationId, string>>`.
- Render: `<SvgXml xml={ILLUSTRATIONS[id]} width height />` from `react-native-svg` (included in
  Expo Go; works on web through react-native-svg's web build — **VERIFY** `SvgXml` on web, fall
  back to `react-native-svg/css`-free `SvgXml` or inline `<Svg>` via SVGR only if it fails). No
  metro `.svg` transformer (needs metro config + web parity we have not verified).
  Component: `apps/mobile/src/library/ExerciseIllustration.tsx` `{ id: IllustrationId; size: number }`,
  renders a neutral placeholder glyph when `id` is missing from `ILLUSTRATIONS`.
- Validate: `pnpm -F @tanren/mobile illustrations:check` (wired into the mobile `check` script and
  so into `pnpm check`): rebuilds into a temp dir and diffs against committed outputs (stale →
  fail); every committed `.svg`: root `viewBox === style.VIEW_BOX`, size ≤ 6 KB, only elements in
  `{svg,g,path,circle,ellipse,rect,line,polyline,polygon,defs,use,symbol,title}`, no
  `<script>`, `<image>`, `<foreignObject>`, `style=`/`on*=` attributes, every `fill`/`stroke` value
  in `style.PALETTE` or `none`/`currentColor`; set of ids == `{ e.illustrationId for e in CATALOG }`
  (both directions; the report prints missing/extra). Budget: whole set ≤ 1.2 MB of strings.
- Preview for reviewers: `illustrations:build` also writes `apps/mobile/assets/exercises/_contact-sheet.html`
  (git-ignored) with every SVG labelled; the reviewer opens it with agent-browser.

## 6. MCP `search_exercises` (team catalog, **after mcp-oauth reports**; owner of `mcp.ts` until then)

```ts
// packages/shared/src/mcp.ts additions
export const SearchExercisesInput = Schema.Struct({
  query: Schema.optionalKey(Label),
  muscle: Schema.optionalKey(MuscleGroup),
  equipment: Schema.optionalKey(CatalogEquipment),
  kind: Schema.optionalKey(ExerciseKind),
  limit: Schema.optionalKey(PageLimit),             // default 20
})
export const CatalogMatch = CatalogExercise.mapFields(Struct.pick(["catalogId","name","aliases","kind","primaryMuscles","secondaryMuscles","equipment","movement"]))
export const SearchExercisesResult = Schema.Struct({ results: Schema.Array(CatalogMatch), total: Schema.Number })
// MCP_TOOLS: append "search_exercises" (read scope; registered in `readTools`, annotations readOnlyHint)
```
Worker: `apps/worker/src/mcp/tools.ts` adds the tool with **0 D1 statements** (pure
`searchCatalog`); `write_plan_week`/`log_session` may accept a `catalogId` in place of
`exerciseId` later — not in this scope. Wire example: `{"query":"ohp"}` →
`{"results":[{"catalogId":"overhead-press","name":"Overhead Press","aliases":["OHP","military press"],…}],"total":1}`.

## 7. Library screen (team catalog, after design-system foundation)

- Route `app/(tabs)/library.tsx` (tab "Library", third tab; `_layout.tsx` line owned by the
  **programs** team's foundation task V2-F2 which adds both `library` and `program` tabs as stubs).
- `src/hooks/useCatalogSearch.ts` (pure state over `searchCatalog`, debounced 150 ms), components
  `CatalogList`, `CatalogFilterBar` (muscle chips from `MuscleGroup`, equipment chips, kind), 
  `CatalogDetail` (illustration 240 px, instructions, muscles, "Add to today's session").
- Detail route `app/library/[catalogId].tsx` (Stack, modal on phone; on two-column web the detail
  renders in `Screen`'s `aside`). "Add to today" = `ExerciseLink.ensure(catalogId)` then
  `TodayRepo` add-exercise path (existing swap/add flow) → `router.push("/today")`.
- Design tokens/primitives come from `apps/mobile/src/ui/**` (design-system.md); no new colours.

## 8. Not decided here
Catalog images beyond line illustrations (photos, animation); per-user custom catalog entries
(users keep free-form `exercise` rows); localisation of names; exercise `kind` enforcement on
`WorkoutSet` (ADR-0007 keeps `reps` = seconds for timed).
