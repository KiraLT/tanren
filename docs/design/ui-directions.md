# UI-B — four visual directions for Tanren (2026-10-21)

Owner verdict (11:20/11:35): "it does not have real design, just random elements thrown … give me multiple
different screenshots and I can tell you what I like." This note is the comparison set. Mockups are static
HTML (same content, same two screens, 390×844) in the session scratchpad
`scratchpad/ui-b/{A,B,C,D}-{today,library}.html`, PNGs `UI-B-{A,B,C,D}-{today,library}-390.png`, grid
`UI-B-contact-sheet.png`. They are not repo artifacts; the direction the owner picks becomes a decision row
in `docs/tasks/v3-design.md` and a token delta for UI-1.

Current system (baseline, `apps/mobile/src/ui/tokens.ts` + ui-audit §2): platform system font, ember orange
accent `#D9480F`/`#FF7A1A`, radius 8/12/20, `boxShadow` overlay only, cards with padding 16, standard tab bar.
No `expo-font`, no Google Fonts, no `expo-blur` installed.

Shared to all four (what was checked in the mockups): `Log set` and `Add to today's session` visible without
scrolling at 390×844; `107.5` fits the weight numeral (checked with a second render); headline / body /
caption are different sizes *and* weights; one accent object per screen; dividers encode grouping only.

## A. Editorial athletic
Rationale: the number is the product. A condensed display face (Barlow Condensed 800) at 96 px makes the
weight the single loudest thing; everything else is Inter on flat white with hairline dividers. Reads like a
race-day board: fast, loud, no chrome.
Borrows: Strava/Nike principles — numerals as hero, uppercase condensed session title, flat surfaces, one
saturated accent, square 8 px corners, outlined steppers instead of filled slabs.
Token deltas: display face `Barlow Condensed` (headings + numeral), body `Inter` (tabular); ramp 96/40/32/
17/15/13; radius 8 everywhere (no `lg`); surfaces flat white, hairline `#E6E6E6`; accent ember `#E5400E`
(keep); shadows none; tab bar standard 84 with filled icon on active; steppers 72 px outlined 1.5 px.
Cost: ~6 h. Two bundled fonts via `expo-font` (`useFonts` + 4 files) — risk: RN-web needs `@font-face` for
the static export (`expo-font` web plugin handles it, VERIFY), Expo Go loads async fonts at start (splash
hold). At 107.5 the steppers compress to ~52 px; fix is numeral 88 px or stepper row under the number.

## B. Quiet instrument
Rationale: Apple Fitness / Things — the calmest reading of the same data. System font, light grey canvas
`#F2F2F7`, white grouped cards with 14 px radius and a 1 px shadow, muted labels, accent only on the primary
button, the active tab and the muscle map. Dense but airy; nothing shouts.
Borrows: HIG grouped-inset lists, SF text styles (34/22/17/15/13), teal accent kept off everything but the
control, 999 radius chips.
Token deltas: font system (no change); numeral 60/600 with −3 % tracking; radius 14 for cards, 12 steppers,
999 chips; surfaces canvas `#F2F2F7` + card `#FFF` + hairline `#E5E5EA`; accent teal `#0B7285` (or keep
ember — the direction does not depend on the hue); shadow `0 1px 2px rgba(0,0,0,.04)` on cards; standard tab
bar on white with hairline; steppers 64×56 filled grey.
Cost: ~3 h. Pure token + layout change inside `src/ui`; no new deps; dark mode is the system palette inverted
(`#000` canvas, `#1C1C1E` cards). Lowest risk. Danger: slides back into "Everything's a Card" if the card
count per screen is not capped (max three groups per screen).

## C. Dark performance
Rationale: a sports-watch face. Graphite `#0F1113` canvas, `#181B1F` panels at 24 px radius, Manrope 800
numerals with one glowing amber accent `#FFB020` on the live value, the primary pill and the active tab.
Steppers stacked under the number so both numerals sit side by side; the tab bar floats as a blurred pill.
Borrows: Whoop/Garmin data-first panels, Apple Watch workout glow, Strava dark mode's single accent.
Token deltas: font `Manrope` (one family, 500–800); ramp 64/30/22/15/13/12; radius 24 panels, 999 pills and
tabs; surfaces canvas/panel/raised `#0F1113`/`#181B1F`/`#23272D`; accent amber `#FFB020` with text glow
`0 0 24px rgba(255,176,32,.35)` and button glow `0 8px 32px`; floating tab bar (absolute, 64 px, blur 20);
light mode is a second palette (not shown — this direction is dark-first).
Cost: ~10 h. Floating pill tab bar means a custom `tabBar` in `app/(tabs)/_layout.tsx` + bottom inset on
every scroll view; `backdrop-filter` needs `expo-blur` (`BlurView`) on native, CSS on web — risk; text
glow is `textShadow*` on RN (supported) but costs on long lists; the catalog illustrations are drawn for a
light background (mockup inverts them — a dark variant or a light tile is needed, see library mockup).

## D. Warm minimal mono
Rationale: typography does the structure. Bone `#F3EFE7` and ink `#1C1917`, Fraunces (serif, optical size)
for headings and Inter Tight for data; thin rules instead of boxes; circular outlined steppers; the only
"accent" is ink — the primary button is a black pill. Feels like a well-set training journal.
Borrows: Things/Linear restraint, editorial serif-plus-grotesk pairing, "no boxes" hierarchy by size and rule.
Token deltas: display `Fraunces` 500 (44/40/30), data `Inter Tight` (numeral 76/400 −4 % tracking, 17/15/14
body); radius 999 for all controls, none elsewhere; surfaces one bone canvas, rule `#D6CFC2`; accent none
(ink), success/danger stay as semantic text colours; shadows none; standard tab bar with 1.5 px icons;
steppers 56 px outlined circles.
Cost: ~6 h (fonts as in A; variable-font `opsz` axis is not available on RN native, use two static weights —
VERIFY). Risk: monochrome weakens status colouring on Plan/Progress (done/missed), the webp illustrations
need `mix-blend-mode: multiply` on web only (no RN equivalent → keep their cream tile as-is); dark mode must
be designed (ink canvas, bone type), not inverted.

## Recommendation
**B (Quiet instrument) as the system, with A's hero numeral.** The owner's own words are "simple and modern
like Strava" and "sizes, spacing are out"; B fixes exactly that with the platform ramp, grouped lists and a
single accent, costs ~3 h, needs no new dependency and already matches the ui-audit §2 scale that UI-1 is
about to implement (the two can be one task). Taking A's one idea — the numeral as the loudest element
(60→72 px, 800, tabular, condensed only if the owner likes A's type) — gives B the Strava energy it lacks.
C is the most "designed" at a glance but is the most expensive and is dark-first with a floating bar that
fights the catalog illustrations; D is the most distinctive but mono removes the status colours Plan and
Progress depend on. Both can be revisited as themes once the structure is right.

If the owner picks C or D anyway: fonts land as a 1-h follow-up task to UI-1 (`expo-font` + 2 files + web
`@font-face`), and the tab-bar/blur work (C) is its own task after UI-2.

Open for the owner: which direction (A–D, or "B with A's numbers"); accent hue if B (teal shown, ember
possible); whether a bundled font is acceptable on web (system font keeps load instant).
