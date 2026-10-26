# Illustration

Samples of the generated exercise art (291 catalog ids in `apps/mobile/assets/illustrations/`, 512 px webp, transparent) and two muscle maps (`assets/musclemaps/`, 384 px, front and back figure side by side).

- `barbell-back-squat.webp`, `lat-pulldown.webp`, `cable-fly.webp`, `plank.webp` — the figure is a neutral grey (about `#8A919B`) with the working muscles in the accent and a soft ground shadow; no background, so one file serves both themes. Shown unframed at 56 (rows), 104 (Today header), 176 (detail hero and desktop). Fallback when an id has no file: a `surface-raised` tile inside the group.
- `musclemap-barbell-back-squat.webp`, `musclemap-lat-pulldown.webp` — primary muscles at full amber, secondary lighter, body in `surface-raised` grey. Shown at 160 in the Library hero and 176 in Progress.

Style prompt and generator: `apps/mobile/assets/illustrations/style.md`, `scripts/generateIllustrations.ts`, `scripts/generateMuscleMap.ts`. Never a cream tile, never a photo.
