A flat `surface` tile for a *thing*: a stat, a hero, a planned session, a chart. Lists are not cards; a list is a `ListGroup`.

**Geometry** `radius-lg` 16 with `borderCurve: continuous`; inner padding `space-lg` 16 (`CARD_PADDING`), overridable. No shadow (`shadow-overlay` belongs to banners and sheets only). In light a `stroke-hairline` border in `border`; in dark no border, the `surface` step against `bg` is the edge. `selected`: `accent-soft` fill and a 1.5 px `accent` border in both themes.

**Tones** `neutral` (`surface`), `accent` (`accent-soft`), `success` (`success-soft`), `danger` (`danger-soft`). Tone tints the background only; text on a tinted card stays `text` / `text-muted`, the tone colour is allowed for one caption or glyph.

**Props (as docs)** `children`, `onPress?` (then give `accessibilityLabel`; hover tint and the 2 px `focus` ring come with it), `selected?`, `tone = "neutral"`, `padding = 16`, `style?`.

**Do** stack cards 24 apart under a `caption` label 8 above the first. Three stat cards in a row share `space-lg` gaps: at 390 that is (358 - 32) / 3 = 108 each. **Don't** nest a card in a card, give a card a coloured left border, or put a whole section inside one.
