# Logo

The mark is 力 (chikara, strength) in two brush strokes: the first off-white on graphite, the hooked second stroke amber (the heat). Owner's pick 2026-10-26 (candidate J3); final set produced the same evening (`apps/mobile/assets/brand/`, wired in `app.json`).

**The two-file rule**: on a dark surface use `mark.png` (transparent, off-white first stroke); on a light surface use the `mark-paper.png` tile, which carries its own paper square, at radius 12 (the sign-in screen shows it at 48 px). Never put `mark.png` on paper (the first stroke vanishes) and never recolour either file.

- `icon.png` — iOS app icon, 1024 x 1024, opaque graphite `#16181D`, no alpha; the strokes sit inside the central 80 % for the rounded mask.
- `adaptive-icon.png` — Android adaptive-icon foreground, 1024, same graphite ground.
- `splash-icon.png` — 512, transparent, centred on the theme's `bg` by the splash screen.
- `favicon.png` — 48, graphite tile.
- `mark.png` — 512, transparent: dark surfaces, the lockup beside the wordmark in dark.
- `mark-paper.png` — 512, opaque paper tile: light surfaces (sign-in, email, the lockup in light).
- `mark.svg` — vector mark, viewBox 512, ink path `currentColor` plus amber `#F59E0B` hook: inline it where CSS `color` picks the ink (24 px tab bar, web header, OG image).
- `mark-ink.svg` — same trace, ink `#16181D`, burnt-orange hook `#C2410C` (matches `mark-paper.png`), light grounds: print, one-colour documents on paper, OG image on light.
- `mark-paper.svg` — same trace, ink `#F6F4EF`, amber hook `#F59E0B`: dark surfaces as a file (OG image on graphite, print on dark stock).

Rules (brand book, Logo system): clear space = the wordmark's cap height (or a quarter of the mark's width); mark >= 24 px; wordmark `TANREN` in Barlow Condensed ExtraBold tracked 4 px, >= 80 px wide; lockup mark left of the wordmark, gap = half the mark's width.
