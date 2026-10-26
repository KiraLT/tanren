Three (or two) equal-width stats under a hero or a header: a `caption` muted label over a `headline` value, tabular.

**Geometry** slots share `space-lg` 16 gaps and split the inner width: `(inner - 16 x (count - 1)) / count`, so 358 inner and 3 slots give 108.67 each. No card around it unless it is the only thing in the aside; then each stat is a `Card`.

**Props (as docs)** `items: { label, value }[]` (values already formatted: "0/5", "3:00", "4,110 kg"), `style?`.

**Do** keep labels one word where possible and units inside the value. **Don't** put a second `numeral` here: the stat row is the quiet summary under the one dominant number.
