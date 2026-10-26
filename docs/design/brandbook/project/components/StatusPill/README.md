A capsule status label: tone-coloured `caption` text (and an optional 16 px glyph) on `surface`.

**Tones** map from plan status through `statusTone`: `done` → `success` (check glyph), `today` → `accent`, `missed` → `danger`, `upcoming` → `neutral` (`text-muted`). Padding `space-sm` 8 horizontal, `radius-full`. The fill is always `surface`; the tone lives in the text so the pill stays quiet next to the one accent object on the screen.

**Props (as docs)** `label`, `tone: "neutral" | "accent" | "success" | "danger"`, `icon?: IconName` (16 px), `style?`.

**Do** write the label as a state, sentence case, no exclamation mark ("Available at Home", "Missed"). **Don't** fill the pill with the tone colour, use it as a button, or stack more than one on a row.
