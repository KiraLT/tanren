# Logo

**Wordmark W1** (owner pick 2026-10-27, plan Amendment 15): `TANREN` brush-lettered in one ink weight, with a single amber hook off the crossbar of the T (the heat). Use it wherever the full name appears: sign-in, the landing hero, the brandbook cover, social images.

**The mark is the T from W1**: crossbar, stem and the amber hook, cut from the same file so it is the wordmark's own first letter. It replaces the 力 kanji (LOGO-2, superseded; files kept in `apps/mobile/assets/brand/candidates/final-kanji/`) everywhere the mark stands alone: app icon, adaptive icon, splash, favicon, PWA icons, the landing footer.

## Colourways

| ground | ink | hook | files |
| --- | --- | --- | --- |
| dark (graphite `#16181D`, app dark `bg`) | off-white `#F6F4EF` | amber `#F59E0B` | `wordmark.png`, `wordmark-paper.svg`, `mark.png`, `mark-paper.svg`, `icon.png` |
| light (paper `#F6F4EF`, white) | graphite `#16181D` | burnt-orange `#C2410C` | `wordmark-paper.png`, `wordmark-ink.svg`, `mark-paper.png`, `mark-ink.svg` |
| CSS-coloured | `currentColor` | amber `#F59E0B` | `mark.svg` |

PNG names follow the app (`*-paper.png` = for paper grounds); SVG names follow the ink (`*-paper.svg` = paper-coloured ink, for dark grounds). Every file is transparent except `icon.png`, `adaptive-icon.png`, `favicon.png` and the PWA icons, which carry the graphite ground.

## Files (`apps/mobile/assets/brand/`)

- `wordmark.png`, `wordmark-paper.png` — 1280 x 286, transparent (2x for 640 wide).
- `wordmark-ink.svg`, `wordmark-paper.svg` — potrace trace, viewBox 1280 x 286, paths `#ink` and `#amber`.
- `icon.png` — iOS app icon, 1024, opaque graphite, T at 60 % of the canvas.
- `adaptive-icon.png` — Android foreground, 1024, graphite, 58 %.
- `splash-icon.png` — 512, transparent, centred on the splash `bg`.
- `favicon.png` — 48, graphite, T at 84 %.
- `mark.png` / `mark-paper.png` — 512, transparent (dark / light grounds).
- `mark.svg`, `mark-ink.svg`, `mark-paper.svg` — viewBox 512.
- PWA (`apps/mobile/public/icons/`): `icon-192`, `icon-512`, `maskable-512` (T at 50 %, inside the 80 % safe circle), `apple-touch-180`.

## Rules

- Clear space: the height of the wordmark's E on every side of the wordmark; a quarter of the T's width around the mark.
- Minimum sizes: wordmark 24 px high on screen (about 107 px wide), 20 mm wide in print; mark 16 px (the favicon is the 16-32 px case and stays legible at 32).
- Sizes in the app: sign-in 56 px high, landing hero 32 px high, landing footer mark 24 px.

## Don'ts

1. Do not typeset `TANREN` in a font next to the mark: the lettered W1 is the only full-name logo.
2. Do not recolour the hook, add a second accent, or put the dark-ground files (off-white ink) on paper.
3. Do not stretch, outline, add a glow or shadow, or redraw the T separately from the wordmark.
