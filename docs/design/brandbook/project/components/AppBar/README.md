The screen title row: minimum 56 (`size-control-lg`), a hairline below, the gutter of the breakpoint as horizontal padding and `space-sm` 8 vertical.

**Slots** `leading` (a 24 px glyph button, usually `chevronLeft`), the title block, `trailing`. The title is `title` 28/30 in Barlow Condensed ExtraBold; above it an optional **eyebrow**: a 20 px `ProgressRing` (stroke 3) and a `caption` muted label ("2 of 5 done"). The trailing slot holds a `subhead` tabular counter plus a 6-segment bar (one segment per exercise, 4 px tall, 3 px gaps, 2 px radius, `accent` on / `border` off) or a 24 px `more` glyph.

**Desktop** (>= 900, `nav` true) the bar also carries the five nav links in `headline`, hover `surface`, active `accent`; leading + title share a fixed 280 px slot (`size-app-bar-title-slot`) so the links start at one x on every route, and the bar stays one line.

**Props (as docs)** `title`, `subtitle?`, `eyebrow?: { label, progress? }`, `leading?`, `trailing?`, `nav?`, `style?`.

**Do** keep the title the screen's noun ("Today", "Plan", "Back Squat"). **Don't** use an all-caps eyebrow, centre the title, or put a primary pill in the bar.
