A small `accent` arc on a `border` track, filling clockwise from 12 o'clock.

**Sizes** `sm` 20 / stroke 3 (`size-ring-sm`, the AppBar eyebrow), `md` 44 / stroke 4 (`size-ring-md`, cards). `diameter` and `stroke` override the preset; the Player's rest ring is `TimerRing` at 220 / 10 (280 at desktop) with the `clock` numeral centred inside and `neutral` tone (`text` arc) when an accented button sits beside it. Progress is clamped to 0..1; `children` is centred over the ring and ignores touches.

**Props (as docs)** `progress`, `size = "sm"`, `stroke?`, `diameter?`, `children?`, `accessibilityLabel`, `style?`.

**Do** pair a ring with the count it shows ("2 of 5 done" in `caption` muted). **Don't** colour the track, use more than one ring per region, or draw a ring under 20 px.
