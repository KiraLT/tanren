# Team illustrations — sheet
Charter: `docs/tasks/v2-illustrations.md` · Design: `docs/design/v2-catalog.md` §5 · style: `docs/design/design-system.md` §7 · Start 00:50 · Box 120 min → 02:50
Budget: ≤ 3 engineers parallel (Lead may raise to 5) · 1 reviewer (opus) · ≤ 2 review rounds · one static port 8795 for the Demo only

## Assumes (cross-team, copied from charter; verified 00:51)
- catalog: ids final per data module once committed (ed6f22f: legs 32, hips 23, chest 24, back 25, shoulders 19, arms 26 = 149; core 3 so far, fullBody/cardio/mobility 0 — Lead messages their ids). `illustrationId` defaults to `catalogId`.
- design: style guide landed (design-system.md §7: viewBox 0 0 240 240, `#71717A` figure / `#F0632A` accent, strokes 1.5/2.5/4, 3 reference SVGs). `src/ui/colors.ts` exports `illustration = { figure, accent }`.
- F2: `react-native-svg` in `apps/mobile/package.json` (verified). Node v24.21.0.
- catalog already ships `src/library/ExerciseIllustration.tsx` (SvgXml + placeholder) reading `src/library/illustrationMap.ts` (`// INTEGRATION: replace with ILLUSTRATIONS from ../illustrations/generated`) — team catalog's files.

## Decisions (for Lead ratification)
- TI1 No second `ExerciseIllustration`: catalog's component in `src/library/` already renders `SvgXml` + placeholder. Our deliverable is `generated/index.ts` `ILLUSTRATIONS`; the swap in `illustrationMap.ts` (+ their test line asserting `plank` is absent) is catalog's one-line change, relayed via the Lead.
- TI2 Muscle accent is automatic: the build looks up `primaryMuscles[0]` in `CATALOG` for each scene id and `compose.ts` draws the single accent region on the matching rig segment. Scenes never hand-draw accents; `Scene.accent` paths (§5: motion arrow / cable line) render neutral at stroke 1.5. `renderScene(scene, muscle?)` is a superset of the frozen `renderScene(scene)`.
- TI3 Validator element set = design-system §7 (`svg|g|path|circle|rect|line|polyline|ellipse`) — stricter than §5; no `<title>` (unknown-tag risk in `SvgXml`; the View carries the a11y label), no `id` attrs, root attrs exactly as §7.
- TI4 Coverage: `extra` ids (SVG without a catalog entry) always fail; `missing` ids are printed but non-fatal until I3 flips `STRICT_COVERAGE = true`, so the shared `pnpm check` stays green for other teams while batches land.
- TI5 Reference SVGs in §7.1 are visual targets for the composer (same pose and proportions), not byte-exact fixtures.

## Tasks
| id | title | model | box | depends | status |
| --- | --- | --- | --- | --- | --- |
| I1 | primitives + build/check script + b00 refs | opus | 45 | — | todo |
| I2-b01/b02 | legs (16/16) | sonnet | 15 | I1 phase 1 | todo |
| I2-b03/b04 | chest (12/12) | sonnet | 15 | I1 phase 1 | todo |
| I2-b05/b06 | back (13/12) | sonnet | 15 | I1 phase 1 | todo |
| I2-b07/b08 | hips (12/11) | sonnet | 15 | I1 phase 1 | todo |
| I2-b09/b10 | shoulders (10/9) | sonnet | 15 | I1 phase 1 | todo |
| I2-b11/b12 | arms (13/13) | sonnet | 15 | I1 phase 1 | todo |
| I2-b13+ | core, fullBody, cardio, mobility | sonnet | 15 | catalog C1 D/E | todo |
| I3 | STRICT_COVERAGE, totals, CLAUDE.md §, skill paragraph, Demo | sonnet | 20 | all I2 + catalog swap | todo |
| REV | contact-sheet + primitives review | opus | 8 | I1 (roll), I3 (delta) | todo |

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`

## Escalations

## Integration checklist
- [ ] `apps/mobile/src/library/illustrationMap.ts` (team catalog) · replace the empty map with `export { ILLUSTRATIONS } from "../illustrations/generated"` and update `illustration.test.ts` line asserting `plank` is none · verify `pnpm -F @tanren/mobile check`
