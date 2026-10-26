Set progress as a row of marks: the first `completed` are done, the next is now (drawn wider), the rest todo.

**`pill` variant** (Today header, next to "Set 3 of 5" in `subhead`): marks 10 x 6, radius 3, gap 4; the current one 16 x 6 in `accent`; done in `text-muted`, todo in `border`. Vertically centred on the subhead x-height. **`dot` variant** (cards, Plan): 8 px dots, the current one 16 wide, done in `success`, now `accent`, todo `border`.

**Props (as docs)** `total`, `completed`, `accessibilityLabel` (the marks are decorative; say "Set 3 of 5"), `variant = "dot"`, `style?`.

**Do** keep the count to the sets of one exercise (3-6). **Don't** use dots for exercises (that is the 6-segment bar in the AppBar) or animate them beyond the 200 ms colour change.
