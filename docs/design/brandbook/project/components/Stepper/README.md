A value between a borderless minus and plus, readable at arm's length.

The buttons are icon-only and fill-less: a 64 px invisible hit area (`size-stepper-button`) around a 30 px glyph at `stroke-stepper-glyph` 2.5; the `surface` circle appears only while pressed or hovered. The value is the screen's dominant number: `numeral` 72/76 in Barlow Condensed ExtraBold, tabular, `text`; in dark it carries the `glow` text shadow. The unit sits after the figure in `caption` muted ("kg"), never inside the numeral; the label line ("Weight") is `caption` muted below, and collapses to the label alone when unit and label coincide ("Reps").

**Sizes** `lg` hit 56 / glyph 24, `xl` 64 / 30 (default, phone and tablet), `xxl` 72 / 34 at desktop, where the value becomes `numeralLg` 96/100. On the web the numeral scales linearly below a 375 px window so "107.5" stays inside its column.

**Props (as docs)** `label`, `valueText` (already formatted), `unit`, `onDecrement`, `onIncrement`, `disabled?` (opacity 0.4, glyph `text-muted`), `size = "xl"`.

**Do** give the stepper the full row (at desktop cap it at `size-control-max` 560, centred). Pair weight and reps as two steppers 24 apart, the reps block the quieter one. **Don't** outline the buttons, add a fill at rest, or put a second 72 px figure on the same screen.
