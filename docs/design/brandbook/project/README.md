## Name and meaning

Tanren is 鍛錬 (たんれん, *tan-ren*): "forging", and by extension disciplined training, the tempering of steel and of a person. Say it *TAHN-ren*, two even syllables. Write it **Tanren** in running text (one word, capital T, never "TanRen" or "tanren" mid-sentence), **TANREN** only as the wordmark (Logo system), and 鍛錬 only beside the Latin name, never alone in UI. The mark is the T of the lettered wordmark, with the amber hook that stands for the heat.

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

**Wordmark W1** (owner's pick 2026-10-27): `TANREN` brush-lettered in one ink weight, with a single amber hook off the crossbar of the T, the heat in the forge. It is the full-name logo wherever the name appears: sign-in, the landing hero, the brandbook cover, social images.

**The mark is the T from W1**: crossbar, stem and the amber hook, cut from the same file, so it is the wordmark's own first letter. It stands alone as the app icon, adaptive icon, splash, favicon, PWA icons and the landing footer. The 力 kanji mark is superseded.

**Colourways, two-file rule.** On dark grounds (graphite #16181D) the ink is off-white #F6F4EF and the hook amber #F59E0B: `wordmark.png`, `mark.png`, `icon.png`, `wordmark-paper.svg`, `mark-paper.svg`. On light grounds (paper #F6F4EF, white) the ink is graphite and the hook burnt-orange #C2410C: `wordmark-paper.png`, `mark-paper.png`, `wordmark-ink.svg`, `mark-ink.svg`. `mark.svg` takes `currentColor` for the ink and keeps the amber hook. PNG names follow the app (`*-paper.png` is for paper grounds); SVG names follow the ink (`*-paper.svg` is paper-coloured ink, for dark grounds). Every file is transparent except `icon.png` and `favicon.png`, which carry the graphite ground.

**Clear space**: the height of the wordmark's E on every side of the wordmark; a quarter of the T's width around the mark. **Minimum sizes**: wordmark 24 px high on screen (about 107 px wide), 20 mm wide in print; mark 16 px (the favicon is the 16-32 px case and stays legible at 32). In the app: sign-in 56 px high, landing hero 32 px high, landing footer mark 24 px.

**Don't**: typeset `TANREN` in a font next to the mark (the lettered W1 is the only full-name logo); recolour the hook, add a second accent, or put the dark-ground files on paper; stretch, outline, add a glow or shadow, or redraw the T separately from the wordmark.

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

- **App icon**: the T mark on graphite, 1024 x 1024, T at 60 % of the canvas, no alpha for iOS; Android adaptive icon foreground on a graphite background layer (T at 58 %); favicon 32 and 16 from the same mark; splash = mark centred on `bg` of the current theme.
- **Email** (magic link): fixed light colours with `color-scheme: light`, a 480 px paper card (#F6F4EF, 1 px #E4DFD4 rule, radius 16) on white; the wordmark in the header is the W1 lettered PNG (`wordmark-paper.png` on the paper card), no typeset `TANREN`; body 16/24 ink #1F1D1A; one ember pill button (#C2410C, white 16/20 600, radius 999); muted 12/18 #6B665E footer. Table layout, inline styles only.
- **OG image**: done (`public/og.png`, 1200 x 630, graphite, the paper lockup 760 wide, centred). Same composition on paper for light contexts.

## Don'ts (the native-slop tells)

Everything in a card · a coloured left border on a card · shadows on cards · outline strokes on containers in dark · all-caps labels and tracked eyebrows (the wordmark excepted) · two accented objects on one screen · a second 72 px figure · blue-purple gradients · emoji as decoration · a centred icon as an empty state · a spinner where a skeleton belongs · dividers running under the leading icon · white text on the amber pill.
