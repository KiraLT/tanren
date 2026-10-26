## Name and meaning

Tanren is 鍛錬 (たんれん, *tan-ren*): "forging", and by extension disciplined training, the tempering of steel and of a person. Say it *TAHN-ren*, two even syllables. Write it **Tanren** in running text (one word, capital T, never "TanRen" or "tanren" mid-sentence), **TANREN** only as the wordmark (Logo system), and 鍛錬 only beside the Latin name, never alone in UI. The mark is a different character: 力 (*chikara*, strength, power), the thing the forging produces.

## Principles

1. **Editorial-athletic.** Paper and graphite, one hot accent, a condensed display face for the few words that matter and the platform font for everything else. The light theme reads like a printed training log; the dark theme like a performance display.
2. **One dominant number per screen.** The weight, the reps, the clock: `numeral` 72 (96 at desktop) in Barlow Condensed ExtraBold, `text`, tabular. Everything else is quiet sentence case in `text-muted`. Units sit beside the number in `caption`, never inside it. Never two 72 px figures on one screen.
3. **Instruments, not ornaments.** Every line and shape carries information: hairlines separate groups, discs number the sets (done / now / todo), rings and 6-segment bars show progress, set-dots count sets. No decorative dividers, no gradients, no all-caps eyebrows, no icons that merely decorate.
4. **One accent object per screen.** `accent` goes to the single most important state: the primary pill, the current set, the active tab. If two things are amber, one of them is wrong.
5. **Same layout in both themes.** Only the palette and the glow change; nothing moves or resizes between light and dark.

## Voice and tone

Short, direct, present tense, sentence case. No exclamation marks, no emoji, no "awesome". Address the owner as *you*; Tanren never says *I*. Verbs on buttons, nouns on titles, states on pills.

| where | copy |
| --- | --- |
| primary button | Log set · Start · Send link · Swap |
| row title / subtitle | Set up your equipment / Tell Tanren what your gym has |
| requirement line | Needs: barbell, rack |
| sign-in confirmation | Check your email |
| status pill | Available at Home · Missed · Upcoming |
| empty state | No sessions yet. Start today's plan. (one sentence, one action) |
| email subject | Sign in to Tanren |

Numbers are data, not prose: `100 kg x 5`, `3:00`, `0/5`, `4,110 kg`. Dates in the user's locale, weekday first (`Mon 26`).

## Logo system

**Mark: 力 in two brush strokes** (owner's pick 2026-10-26, candidate J3). The first stroke is off-white on graphite; the hooked second stroke is amber, the heat in the forge. 力 means strength; paired with the name 鍛錬, the mark says what the training produces and the name says how. Considered and set aside: J2 (both strokes neutral) and J1 (the M8 ring as brush strokes). The final set lives in the Logo asset group: `icon.png` (iOS 1024, opaque graphite #16181D), `adaptive-icon.png`, `splash-icon.png`, `favicon.png` (48), and the two marks. **Two-file rule**: `mark.png` (transparent, off-white first stroke) on dark surfaces; the `mark-paper.png` tile at radius 12 on light surfaces, as the sign-in screen does at 48 px. A traced SVG of the mark is still to come.

**Wordmark**: `TANREN` in Barlow Condensed ExtraBold, uppercase, letter-spacing 4 px at 22-34 px (the one permitted use of caps and tracking in the system, ratified 2026-10-26; the sign-in screen and the email header use it). Colour `text` on `bg`; `on-accent` only inside an accent block.

**Clear space** around mark and wordmark: the cap height of the wordmark (or a quarter of the mark's width). **Minimum sizes**: mark 24 px (the tab bar is the smallest surface), wordmark 80 px wide. **Lockup**: mark left of the wordmark, gap = half the mark's width, baselines aligned to the mark's foot.

**Don't**: recolour the strokes (amber hook only), outline the mark, place it on a photo or a gradient, letter-space anything else, set the wordmark in the system font, or show 鍛錬 without the Latin name.

## Colour

Two themes, one role table (`color` tokens). Light is paper: `bg` #FFFFFF, `surface` #F6F6F7, `text` #141416, `accent` ember #C2410C (white on it 5.0:1). Dark is graphite: `bg` #0F1113, `surface` #181B1F, `text` #F2F3F5, `accent` amber #FFB020 with `on-accent` #141210 (about 10:1): the amber pill carries dark text, never white.

- Text: `text` on `bg`, `surface` and `surface-raised`; `text-muted` for secondary copy (5.9:1 / 5.4:1 light, about 8:1 / 7:1 dark).
- Semantic: `success` = done (discs, dots, pill text), `accent` = now / today, `text-muted` and `border` = todo, `danger` = missed and destructive. The `*-soft` tints sit behind a state, never under body text.
- `border` draws every hairline, track and todo outline. In dark a card has no border at all; the `surface` step is the edge.
- `glow` exists only in dark: `shadow-glow` under the primary pill and a 24 px text shadow behind the numeral. In light nothing glows.
- `focus` is the 2 px web keyboard ring, outside the control, solid.

Chips flip by theme: ON = `text` fill with a `bg` label in light, `accent` fill with `on-accent` in dark; OFF = 1 px `border` outline, `text` label.

## Typography

**Barlow Condensed** (700 `displayBold`, 800 `display`; OFL, bundled, two static TTFs) for the display group: `numeral` 72/76, `numeralLg` 96/100 (desktop hero only), `clock` 64/68 (Player ring), `display` 34/38 (exercise name), `title` 28/30 (AppBar). The **platform font** (SF on iOS, the system stack on web) for the text group: `title2` 22/28 700, `headline` 17/22 600, `body` 17/22 400, `subhead` 15/20 400, `caption` 13/18 500, `label` 12/16 500 (tab bar only). At most two weights >= 600 per region. Numerals and every compared figure are tabular (`fontVariant: tabular-nums`). Layouts never depend on the condensed width: the fallback is the system font at weight 800.

## Layout and rhythm

8-pt grid (`space-xs` 4 ... `space-xxxl` 48). Gutters 16 / 24 / 32 at < 600 / 600-899 / >= 900. Section rhythm, every breakpoint: label -> its group **8**, group -> next label **24**, hero -> first section 24, chip rows 8 apart, card inner padding 16, text rows 52, thumb rows 64, separators inset to the text edge (16 / 48 / 84).

**Cards vs grouped lists**: a `Card` holds a *thing* (a stat, a hero, a planned session); a `ListGroup` holds rows. Never a card per row, never a whole section in a card.

**Desktop** (>= 900): page column `min(window - 64, 1360)`, so 1216 at 1280; two columns `7/5`, `5/7` or `6/6` with a 24 gap (every split renders 6/6 below 1024; no column under 364); the aside is sticky under the 56 AppBar + 24. Auth, Loading, Empty and NotFound states keep a single 600 column (`size-content-max`) on every route. The tab bar hides at desktop and the five links move into the AppBar.

## Iconography

One stroke set on a 24 grid, round caps and joins, `stroke-icon` 2 (tabs inactive 1.75): 40 glyphs in the Icons group, geometry after Lucide (ISC), drawn in the app from path data, so they take any theme colour. Sizes: 16 in chips, discs and pills; **20 in rows and meta (the row icon slot is exactly 20 wide, title at 16 + 20 + 12 = 48)**; 24 in tabs, buttons and the AppBar; 28 in empty states; the stepper glyph 30 at stroke 2.5. Colour: `text-muted` on rows, `text` in buttons, `accent` only for the active tab and the now-marks. Icons never stand alone as a message: the control carries the label.

## Illustration

Exercise art is generated (gpt-image-1 family), 512 px square, **transparent background**, a neutral grey figure (about #8A919B) with the working muscles in the accent and a soft ground shadow: one file serves both themes. It is shown unframed (`framed=false`) at 56 (rows), 104 (Today header), 176 (detail hero, desktop Today); the fallback tile when an id has no file is `surface-raised` inside a group. Muscle maps are the same family: front and back figure side by side, 384 px, transparent, highlighted muscles in amber. Every page that names an exercise shows its picture: the owner forgets exercises by name. No stock photos, no clip-art people, no cream tiles behind the figure.

## Motion

Reduced. `fast` 120 ms press feedback, `base` 200 ms state and colour changes (disc, dot, pill), `slow` 320 ms sheets; the rest ring steps once a second. No entrance animations, no parallax, no bouncing numbers. Under reduced motion every duration is 0.

## Surfaces for marketing

- **App icon**: the 力 mark on graphite, 1024 x 1024, no alpha for iOS, the strokes inside the central 80 % (safe zone for the rounded mask); Android adaptive icon foreground on a graphite background layer; favicon 32 and 16 from the same mark; splash = mark centred on `bg` of the current theme.
- **Email** (magic link): fixed light colours with `color-scheme: light`, a 480 px paper card (#F6F4EF, 1 px #E4DFD4 rule, radius 16) on white; `TANREN` wordmark 22 px tracked 4 in the header; body 16/24 ink #1F1D1A; one ember pill button (#C2410C, white 16/20 600, radius 999); muted 12/18 #6B665E footer. Table layout, inline styles only.
- **OG image**: 1200 x 630, graphite `bg` #0F1113, the mark at 240 px left, wordmark + one line of `body` copy in `text-muted` right, amber only in the mark's hook. Same composition on paper for light contexts.

## Don'ts (the native-slop tells)

Everything in a card · a coloured left border on a card · shadows on cards · outline strokes on containers in dark · all-caps labels and tracked eyebrows (the wordmark excepted) · two accented objects on one screen · a second 72 px figure · blue-purple gradients · emoji as decoration · a centred icon as an empty state · a spinner where a skeleton belongs · dividers running under the leading icon · white text on the amber pill.
