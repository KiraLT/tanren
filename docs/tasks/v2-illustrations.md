# v2 — team illustrations: figure rig + glyphs, scene batches, composer, validator
Source: docs/plan.md Amendment 4 ("for image try to generate SVG illustration") · Status: planning · Updated: 2026-10-21 · Baseline commit: the Lead's post-step-5 commit
Design: `docs/design/v2-catalog.md` §5 (normative: `Scene`, build/validate contract, render) · visual rules: `docs/design/design-system.md` § "SVG illustration style guide" (design architect; palette, stroke widths, viewBox, figure proportions) · starts after **V2-F2** (deps) and the design architect's style guide; batches start after the catalog data modules they cover have reported.

## Team charter: illustrations
Mission: every `CatalogExercise.illustrationId` has a consistent line illustration, generated from a shared stick-figure rig and equipment glyphs by `illustrations:build`, validated by `illustrations:check` inside `pnpm check`, and exported as `ILLUSTRATIONS` strings that `ExerciseIllustration` renders with `react-native-svg` on native and web.
Owned paths (exclusive): `apps/mobile/src/illustrations/**` (`style.ts`, `rig.ts`, `glyphs.ts`, `compose.ts`, `scenes/**`, `generated/**`, tests), `apps/mobile/scripts/illustrations.ts`, `apps/mobile/assets/exercises/**`, the two `illustrations:*` script lines + `check` script line in `apps/mobile/package.json`, `.gitignore` line for `_contact-sheet.html`, `apps/mobile/CLAUDE.md` §illustrations.
Adjacent with owners: `apps/mobile/src/library/ExerciseIllustration.tsx` — team catalog (consumes `generated/index.ts`). `packages/shared/src/catalog/**` — team catalog (read `CATALOG` only). `apps/mobile/src/ui/**`, `design-system.md` — design architect; `style.ts` copies its constants and cites the section. `package.json` deps — V2-F2 (done).
Provides: `generated/index.ts` `ILLUSTRATIONS: Readonly<Record<IllustrationId, string>>`; `assets/exercises/<id>.svg` (committed); `illustrations:check` in the gate; `_contact-sheet.html` for reviewers.
Assumes (cross-team, cited):
- catalog: ids are final per data module once that module's C1 task reported (v2-catalog.md §3); `illustrationId` defaults to `catalogId` (v2-catalog.md §2) — the team-lead derives each batch's id list from `CATALOG` filtered by module, splitting modules > 18 ids alphabetically into two batches.
- design: the style guide fixes `VIEW_BOX`, palette tokens (≤ 4 colours), stroke widths and figure proportions (design-system.md §SVG style guide); until it lands, I1 uses placeholders in `style.ts` marked `VERIFY: design-system` and the team-lead re-runs `illustrations:build` once the guide is final (the composer makes a restyle a rebuild, not a redraw).
- F2: `react-native-svg` installed (v2-programs.md §6); Node 24 runs `scripts/illustrations.ts` directly (v2-catalog.md §5 VERIFY; else add `tsx` as a mobile dev dep and announce).
Runtime proof (I3 and once before the team report): `pnpm -F @tanren/mobile illustrations:build && pnpm -F @tanren/mobile illustrations:check` output pasted (count, bytes, missing/extra = 0); `agent-browser open file://…/_contact-sheet.html` + screenshot described in the report (every figure upright, equipment attached to hands/floor, no overlaps); after team catalog's C4 lands, one ui-check of `/library/barbell-back-squat` showing the SVG.
Docs: `apps/mobile/CLAUDE.md` §illustrations (team-lead: how to add an exercise drawing = add a scene, run build) · `expo-mobile` skill paragraph on `SvgXml` (I3).
Budget: ≤ 3 engineers in parallel (batches) · one reviewer for the team, after I3, with the contact sheet · ≤ 2 review rounds · target ≤ 120 min wall-clock.
Forbidden: never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine. Hand-written `.svg` files (everything is composed); raster, `<image>`, `<script>`, inline `style=`; colours outside `style.PALETTE`; editing catalog data to make an id fit. No dev servers (no ports needed).
Report: team report format from `.claude/agents/team-lead.md`.

## Decisions
- D1 Composer from a rig + glyphs, scenes authored per batch; `.svg` and TS string modules are both committed and the check rebuilds and diffs — accepted (Lead delegation).
- D2 Render with `SvgXml` strings; no metro `.svg` transformer — accepted (Lead delegation); fallback in v2-catalog.md §5 if web fails.
- D3 One frame per exercise, working position, side view default — accepted (Lead delegation).

## Tasks
| id | title | role/model | group | files | depends on | done when |
| --- | --- | --- | --- | --- | --- | --- |
| V2-I1 | primitives: `style.ts` (from the guide), `rig.ts` (side/front rig, `Pose`, ≥ 8 named base poses: stand, squat, hinge, lunge, supineLying, proneLying, plank, seated, hang, kneel), `glyphs.ts` (§5 list), `compose.ts` `renderScene`, `scenes/b00.ts` with 5 reference scenes, `scripts/illustrations.ts` build + check, package scripts, unit tests (determinism, byte budget, validator rejects a bad fixture) | engineer/opus | A (first, alone) | all primitives | F2, style guide (or placeholders) | `illustrations:build && illustrations:check` green on the 5 refs; contact sheet opens |
| V2-I2-<batch> | scene batch (≈ 15 ids from one catalog module; team-lead names the ids in the brief) | engineer/sonnet | B (≤ 3 at once) | `scenes/<batch>.ts` only | I1, that catalog module reported | build + check green for the batch; contact-sheet row described in report (each figure plausible for the exercise) |
| V2-I3 | final: coverage both directions = 0, size totals, `generated/index.ts`, CLAUDE.md §, skill paragraph, contact sheet review notes | engineer/sonnet | C | `generated/**`, docs | all I2 | `pnpm check` (root) green with `illustrations:check` wired |
| V2-REV | one reviewer with the contact sheet (consistency: stroke, scale, floor line, equipment anchoring) | reviewer/opus | after I3 | owned paths | — | APPROVE; redraw list routed to batch engineers |

## Done-criteria (team)
- `illustrations:check` in `pnpm check`: viewBox, ≤ 6 KB each, allowed elements, palette, coverage = `CATALOG` ids both ways, committed outputs fresh.
- Contact sheet reviewed; ≤ 5 % of scenes flagged for redraw after the review round.
- `ExerciseIllustration` (team catalog) renders a real SVG in the Library proof.

## Frozen contracts
v2-catalog.md §5 (`Scene`, `ILLUSTRATIONS`, output paths, validator rules); `style.ts` constant names `VIEW_BOX`, `PALETTE`, `STROKE`, `MAX_BYTES`.

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`
- 2026-10-21 · created from architect breakdown

## Briefs (each adds the charter's Forbidden line and `Report: engineer format, gate output pasted`)
### V2-I1 (opus, Time box 45 min)
Read v2-catalog.md §5 and design-system.md § SVG style guide (or write placeholders marked `VERIFY: design-system`). Load `expo-mobile`, `effect-conventions`, `monorepo`. Build the rig as pure functions (angles in degrees, segment lengths from `style.ts`, rounded `stroke-linecap`, head circle, no fills except equipment plates), the §5 glyph set, `renderScene` (deterministic output, `<svg viewBox=… xmlns=…>` + `<title>` with the id), `scripts/illustrations.ts` with `build` (writes `assets/exercises/<id>.svg`, `generated/<batch>.ts`, `generated/index.ts`, `_contact-sheet.html`) and `check` (rules of §5; exit 1 with a list). Node 24 runs the `.ts` script directly — verify; else add `tsx` and announce. 5 reference scenes in `scenes/b00.ts`: `plank`, `barbell-back-squat`, `pull-up`, `dumbbell-curl`, `kettlebell-swing`. Wire `illustrations:check` into the mobile `check` script. Done: build + check green, contact sheet described, `pnpm -F @tanren/mobile check` pasted.
### V2-I2-<batch> (sonnet, Time box 15 min) — template
Read v2-catalog.md §5 `Scene` and `scenes/b00.ts`; skim `rig.ts` pose names and `glyphs.ts`. Write `scenes/<batch>.ts` with one `Scene` per id in: `<ids>`. Choose the base pose closest to the working position and adjust ≤ 4 angles; attach equipment at the hands (`rig.handPoints(pose)`) or floor; `floor: true` unless hanging; ≤ 3 accent paths. Run `pnpm -F @tanren/mobile illustrations:build && illustrations:check`; open `_contact-sheet.html` with agent-browser and describe your row (what looks wrong, fixed or not). Never edit another batch, the rig or the glyphs — a missing glyph/pose is an escalation line in your report. Done: check green, descriptions in the report.
### V2-I3 (sonnet, 20 min) — coverage 0/0, totals, `generated/index.ts` final, CLAUDE.md §illustrations, `expo-mobile` skill `SvgXml` paragraph (with the web VERIFY resolved from catalog C4's proof if available).
