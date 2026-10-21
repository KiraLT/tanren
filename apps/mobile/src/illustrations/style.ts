/**
 * Illustration style constants, copied from docs/design/design-system.md §7 (SVG style guide).
 * The palette repeats `illustration` in `src/ui/colors.ts` (figure `#71717A`, accent `#F0632A`):
 * the SVG files carry literal hex, so these two values must stay equal to those tokens.
 */

export const VIEW_BOX = "0 0 240 240"

/**
 * The exact root element every file starts with (§7 "Root exactly"). Biome skips `*.svg`
 * (biome.jsonc), so its a11y title rule does not apply; `illustrations:check` is the gate.
 */
export const SVG_ROOT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" fill="none" stroke-linecap="round" stroke-linejoin="round">`

export const PALETTE = { figure: "#71717A", accent: "#F0632A" } as const

/** `figure` = figure and equipment outlines, `accent` = the muscle region, `thin` = cables/arrows. */
export const STROKE = { figure: 2.5, accent: 4, thin: 1.5 } as const

/** Accent region fill opacity (§7 "optionally filled"). */
export const ACCENT_FILL_OPACITY = 0.18

/** Per-file budget (§7: ≤ 6 KB). */
export const MAX_BYTES = 6144

/** Whole-set budget (v2-catalog.md §5: ≤ 1.2 MB of strings). */
export const MAX_TOTAL_BYTES = 1_200_000

/** Elements a file may contain (§7 validation list; TI3). */
export const ALLOWED_ELEMENTS: ReadonlyArray<string> = [
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "ellipse",
]

/**
 * Figure proportions from the §7 standing reference (front view): head centre (120,40), shoulders
 * y 62 (x 92–148), hips y 118 (x 102–138), knees y 160, ankles y 206.
 */
export const BODY = {
  headRadius: 14,
  /** Shoulder point to head centre (62 − 40). */
  neck: 22,
  /** Hip point to shoulder point (118 − 62). */
  torso: 56,
  upperArm: 36,
  forearm: 34,
  thigh: 44,
  shin: 46,
  /** Front view: half the shoulder width (148 − 120). */
  shoulderHalfWidth: 28,
  /** Front view: half the hip width (138 − 120). */
  hipHalfWidth: 18,
} as const

/** Where feet (and anything resting on the ground) sit. The ground line itself is never drawn. */
export const FLOOR_Y = 208

/** Every figure joint stays inside this box (§7). */
export const SAFE_AREA = { minX: 24, maxX: 216, minY: 20, maxY: 220 } as const
