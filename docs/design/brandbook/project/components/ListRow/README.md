One row of a grouped list: a leading mark, a title with an optional subtitle, a trailing value or chevron. Rows live inside a `ListGroup` (a `surface` slab, `radius-lg`, 4 px vertical padding) which draws the hairlines between them.

**Geometry** minimum height 52 (`size-row-min`); horizontal padding `space-lg` 16, vertical `space-sm` 8, gap `space-md` 12 between leading mark and text. A two-line row (headline 22 + subhead 20 + 2 x 8 + 2) is 60. A row with a 56 px thumb (`thumb`) is 64 high with 4 px vertical padding. The separator starts at the text edge, never under the art: `inset="none"` 16, `"icon"` 16 + 20 + 12 = 48, `"thumb"` 16 + 56 + 12 = 84.

**Leading marks** `disc` (24 px): `done` = `success` fill with a 16 px check in `bg`; `now` = `accent` fill, number in `on-accent`; `todo` = 1.5 px `border` outline, number in `text-muted`. `icon` = a 20 px glyph in `text-muted` (the icon slot is exactly 20 wide, so `leading={null}` aligns the same). `leading` = any node, for a 56 illustration.

**States** `selected` paints the row `accent-soft` (the current set). Pressed/hovered: `surface-raised` inside a group, `surface` on the page. `tone="danger"`: title and glyph in `danger`, transparent background, `surface-raised` when pressed (Sign out, Delete location). `disabled`: opacity 0.4, not pressable. `chevron` adds a trailing 20 px `chevronRight` in `text-muted` after `trailing`; use it on every row that opens something.

**Props (as docs)** `title`, `titleVariant = "headline"` (`"body"` for dense lists, `"subhead"`), `subtitle?`, `leading?`, `disc?: {state, index}`, `icon?`, `trailing?`, `chevron?`, `tone?`, `disabled?`, `onPress?`, `selected?`, `thumb?`, `accessibilityLabel?`. `ListGroup` takes `children`, `inset`, `style`.

**Do** put trailing numbers in `subhead` tabular. **Don't** wrap a row in a `Card`, draw a hairline under the last row, or let the separator run under the leading icon.
