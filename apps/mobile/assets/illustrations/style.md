# Exercise illustration style (gpt-image-1)

`pnpm images:generate` sends `style` + a blank line + the filled `template` as the prompt for every
catalog exercise. Edit the two fenced blocks below to change the look; the script reads them by
their info string (`style`, `template`), so keep the fences.

Why this style: the images sit in small library rows and on the exercise page at phone width, in
light and dark themes. A flat figure on a plain off-white square stays legible at 64 px, and one
fixed camera angle, palette and line weight keeps 235 independently generated images looking like
one set. The single accent is the app's own accent (#C2410C, `src/ui/colors.ts` light), placed on
what the user should notice: the working muscle group, or the equipment when no muscle is visible.
No text, because the model misspells it and the app already shows the name.

```style
Minimal flat vector-style fitness illustration of one athlete performing a gym exercise, captured mid-movement at the most recognisable point of the repetition.
Camera: consistent three-quarter front view at chest height, whole body and all equipment fully in frame.
Composition: square, the figure centred with generous empty margin on every side (about 12 percent), feet on an implied floor line, nothing cropped.
Figure: gender-neutral adult with an athletic build, simplified face without features, dark slate (#334155) body and clothing in one or two slate tones, soft rounded shapes, consistent medium line weight.
Accent: exactly one accent colour, burnt orange (#C2410C), used only on the primary working muscle group drawn as a subtle highlight on the body; if that muscle is hidden from this angle, put the accent on the equipment instead.
Equipment: drawn in mid grey (#94A3B8) with correct proportions and a correct grip.
Background: plain flat neutral off-white (#F7F5F2), no floor texture, no shadow except a soft flat ellipse under the figure.
Strictly no text, letters, numbers, logos, watermarks, gradients, photorealism, 3D rendering, background objects, gym interior or extra people.
```

```template
Exercise: {{name}}.
Equipment: {{equipment}}.
How it is performed: {{instructions}}
Primary muscle group to highlight in orange: {{primary}}.
```
