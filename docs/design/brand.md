# Tanren brand — pointer and inventory

Status: accepted (Lead delegation, plan Amendment 12) · Author: architect-as-brand-designer (BRAND-0, 2026-10-26 22:19–22:30)

**The brandbook is the Design System artifact "Tanren Brandbook":** https://claude.ai/artifact/S6ngEL7NHXU1LaMECafJYa
(brand book README, tokens in both themes, fonts, 40 icons, illustration samples, the logo, nine component cards, cover).
Its source tree is **`docs/design/brandbook/project/`** (the artifact serves exactly these files; edit here, republish with
`root: docs/design/brandbook`, `file_path: …/project/design-system.json`, `files` = the changed `project/…` paths; images go up
as assets first and are recorded in the index `assetGroups`). Generator for tokens/icons/previews:
the BRAND-0 session's `gen_brandbook.py` (scratchpad; values copied from `apps/mobile/src/ui/{tokens,colors,controls,iconPaths}.ts`).
When a token changes in the app, change `tokens.json` here too: the brandbook is a mirror, the code is the source.

## Asset inventory

| asset | state | where |
| --- | --- | --- |
| Mark 力 (J3, owner pick 2026-10-26) | **interim** render only (`J3-interim-mark.png`, 1024 opaque graphite) | `apps/mobile/assets/brand/candidates/J3.png` (git-ignored) |
| Final mark set: iOS icon 1024 no alpha, adaptive icon, favicon 32/16, splash icon, transparent mark on paper and graphite | **missing** (engineer in progress → `apps/mobile/assets/brand/{icon,mark,mark-paper,…}.png`) | replace the Logo group's file when they land; wire in `app.json` |
| Mark as SVG (single-ink first stroke + amber hook) | **missing**: the generated PNG is raster; a traced SVG is needed for the tab bar at 24 px and the OG image | spike: trace J3 or redraw the two strokes |
| Wordmark `TANREN` | rule only (Barlow Condensed ExtraBold, caps, tracking 4); no file, the app renders it from the font | `app/sign-in.tsx` `WORDMARK_TRACKING = 4`, email header |
| Fonts | Barlow Condensed 700/800 TTF (OFL) | `apps/mobile/assets/fonts/`, copied to `project/fonts/` |
| Icons | 40 SVGs, 24 grid, stroke 2, fixed ink `#8A919B` in the brandbook (the app colours them per theme) | `project/assets/Icons/`, source `src/ui/iconPaths.ts` |
| Illustration samples | 4 exercises + 2 muscle maps (of 291 + 291) | `project/assets/Illustration/` |
| OG image 1200×630 | **missing**; spec in README "Surfaces for marketing" | needs the final mark |
| Email template | exists (`apps/worker/src/auth/magicLinkEmail.ts`); its paper/ink/rule hexes (#F6F4EF, #1F1D1A, #E4DFD4, #6B665E) are warm variants, not the app tokens | documented as-is; aligning them to `surface`/`text`/`border`/`text-muted` is an optional follow-up |

## Open decisions for the owner

1. Mark: J3 picked. Confirm the final set once the engineer's files are in (icon on graphite vs on amber; splash background).
2. Wordmark lockup: mark left of `TANREN`, gap = half the mark width (brandbook rule, not yet in any screen).
3. Tagline on the cover, "Forge the number. Log the set." — placeholder in the system's voice; replace or drop.

## Notes

- The brandbook's `glow` token is `rgba(255,176,32,0)` in light (the page cannot read `transparent`); the app uses `"transparent"`.
- Motion durations (120 / 200 / 320 ms) are in the README only: the Design System type has no motion family.
- Component previews are static HTML on `tokens.css` variables (no bundle); props are documented in each card's README.
