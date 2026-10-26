# Tanren brand — pointer and inventory

Status: accepted (Lead delegation, plan Amendment 12) · Author: architect-as-brand-designer (BRAND-0 22:19–22:30, BRAND-1 22:52–, 2026-10-26)

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
| Mark 力 (J3, owner pick 2026-10-26): `icon.png` 1024 opaque graphite #16181D, `adaptive-icon.png` 1024, `splash-icon.png` 512 transparent, `favicon.png` 48, `mark.png` 512 transparent (dark surfaces), `mark-paper.png` 512 paper tile (light surfaces, radius 12) | **done** (commit fb7094a, BRAND-1 in the brandbook Logo group) | `apps/mobile/assets/brand/`, `app.json`; copies in `project/assets/Logo/` |
| SVG mark (`mark.svg` ink `currentColor` + amber `#F59E0B` hook; `mark-ink.svg` ink `#16181D` + burnt-orange `#C2410C` hook; `mark-paper.svg` ink `#F6F4EF`) | **done** (BRAND-2a): potrace trace of `mark.png`, viewBox 512, two `<path>`s (`#ink`, `#amber`), 7.6 KB each, alpha diff vs the PNG 0.19 % | `apps/mobile/assets/brand/*.svg`; copies in `project/assets/Logo/` |
| Wordmark `TANREN` | rule only (Barlow Condensed ExtraBold, caps, tracking 4); no file, the app renders it from the font | `app/sign-in.tsx` `WORDMARK_TRACKING = 4`, email header |
| Fonts | Barlow Condensed 700/800 TTF (OFL) | `apps/mobile/assets/fonts/`, copied to `project/fonts/` |
| Icons | 40 SVGs, 24 grid, stroke 2, fixed ink `#8A919B` in the brandbook (the app colours them per theme) | `project/assets/Icons/`, source `src/ui/iconPaths.ts` |
| Illustration samples | 4 exercises + 2 muscle maps (of 291 + 291) | `project/assets/Illustration/` |
| OG image 1200×630 | **missing** (BRAND-2); spec in README "Surfaces for marketing" | compose from `mark.png` |
| Email template | exists (`apps/worker/src/auth/magicLinkEmail.ts`); its paper/ink/rule hexes (#F6F4EF, #1F1D1A, #E4DFD4, #6B665E) are warm variants, not the app tokens | documented as-is; aligning them to `surface`/`text`/`border`/`text-muted` is an optional follow-up |

## Open decisions for the owner

1. Mark: J3 picked, final set in. Confirm the graphite icon ground (#16181D) against the app's dark `bg` #0F1113, or ask for one of the two to move.
2. Wordmark lockup: mark left of `TANREN`, gap = half the mark width (brandbook rule, not yet in any screen).
3. Tagline on the cover, "Forge the number. Log the set." — placeholder in the system's voice; replace or drop.

## Notes

- The brandbook's `glow` token is `rgba(255,176,32,0)` in light (the page cannot read `transparent`); the app uses `"transparent"`.
- Motion durations (120 / 200 / 320 ms) are in the README only: the Design System type has no motion family.
- Component previews are static HTML on `tokens.css` variables (no bundle); props are documented in each card's README.
