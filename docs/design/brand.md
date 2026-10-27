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
| Wordmark W1 (owner pick 2026-10-27, plan Amendment 15): brush-lettered `TANREN`, one ink weight, one amber hook off the T's crossbar. `wordmark.png` 1280×286 transparent (off-white ink #F6F4EF + amber #F59E0B, dark grounds), `wordmark-paper.png` 1280×286 (ink #16181D + burnt-orange #C2410C, light grounds); `wordmark-ink.svg` / `wordmark-paper.svg` (potrace, viewBox 1280×286, `#ink` + `#amber` paths, alpha diff 0.24 % of canvas) | **done** (LOGO-4, cut from the LOGO-3 W1 file; the quality-high rerun drifted, `docs/design/screens/LOGO-4-drift.png`) | `apps/mobile/assets/brand/`; sign-in (56 px high), landing hero (32 px high) |
| Mark: the **T** cut from W1 (crossbar + stem + amber hook). `icon.png` 1024 opaque graphite #16181D (T at 60 %), `adaptive-icon.png` 1024 (58 %), `splash-icon.png` 512 transparent, `favicon.png` 48 graphite (84 %), `mark.png` 512 transparent off-white + amber (dark surfaces), `mark-paper.png` 512 transparent ink + burnt-orange (light surfaces; no tile since LOGO-4); PWA `public/icons/{icon-192,icon-512,maskable-512 (50 %, safe zone),apple-touch-180}.png` | **done** (LOGO-4, `node scripts/generateLogo.ts --w1-export <W1.png>`) | `apps/mobile/assets/brand/`, `app.json` (same filenames) |
| SVG mark (`mark.svg` ink `currentColor` + amber `#F59E0B`; `mark-ink.svg` ink `#16181D` + `#C2410C`; `mark-paper.svg` ink `#F6F4EF` + `#F59E0B`) | **done** (LOGO-4): potrace trace of the T `mark.png`, viewBox 512, 30 KB each (dry-brush edges), alpha diff 0.08 % of canvas | `apps/mobile/assets/brand/*.svg` |
| Mark 力 (J3, LOGO-2) and its SVGs | **superseded** 2026-10-27 by the T; kept for the record | `apps/mobile/assets/brand/candidates/final-kanji/` (tracked) |
| Fonts | Barlow Condensed 700/800 TTF (OFL) | `apps/mobile/assets/fonts/`, copied to `project/fonts/` |
| Icons | 40 SVGs, 24 grid, stroke 2, fixed ink `#8A919B` in the brandbook (the app colours them per theme) | `project/assets/Icons/`, source `src/ui/iconPaths.ts` |
| Illustration samples | 4 exercises + 2 muscle maps (of 291 + 291) | `project/assets/Illustration/` |
| OG image 1200×630 | **done** (BRAND-2b): the paper-ink W1 lockup (`wordmark-paper.svg`, 760 px wide) centred on graphite #16181D, opaque; `og:title` "Tanren", `og:description` = landing headline, `twitter:card summary_large_image` | `apps/mobile/public/og.png` (`node scripts/generateLogo.ts --og`), metas in `public/index.html` → https://tanren.me/og.png |
| Email template | exists (`apps/worker/src/auth/magicLinkEmail.ts`); its paper/ink/rule hexes (#F6F4EF, #1F1D1A, #E4DFD4, #6B665E) are warm variants, not the app tokens | documented as-is; aligning them to `surface`/`text`/`border`/`text-muted` is an optional follow-up |

## Open decisions for the owner

1. Mark: J3 picked, final set in. Confirm the graphite icon ground (#16181D) against the app's dark `bg` #0F1113, or ask for one of the two to move.
2. Wordmark: decided 2026-10-27 (W1, Amendment 15). The lettered W1 is the lockup; the T is the mark. Logo system
   (colourways, clear space, minimum sizes, don'ts): `docs/design/brandbook/project/assets/Logo/README.md`. Short form:
   dark grounds off-white ink + amber `#F59E0B` hook, light grounds `#16181D` + `#C2410C`; clear space = the E's height;
   wordmark >= 24 px high, mark >= 16 px; never a typeset TANREN beside the mark, never a second accent, never a glow.
   The magic-link email embeds no mark (grep of `apps/worker/src/auth`, LOGO-4), so nothing changed there.
3. Tagline on the cover, "Forge the number. Log the set." — placeholder in the system's voice; replace or drop.

## Notes

- The brandbook's `glow` token is `rgba(255,176,32,0)` in light (the page cannot read `transparent`); the app uses `"transparent"`.
- Motion durations (120 / 200 / 320 ms) are in the README only: the Design System type has no motion family.
- Component previews are static HTML on `tokens.css` variables (no bundle); props are documented in each card's README.
