import { Array as Arr } from "effect"
import type { RegionId } from "./regions"

/**
 * Geometry of the front/back muscle map. Two panels of 200 × 400 side by side in one square
 * 400 × 400 viewBox: front at x 0–200, back at x 200–400, both figures standing on y 392 with
 * the head top at y 12 (7.6 heads of 50). Only the viewer's left half of each figure is authored
 * (absolute `M L C Q Z` commands); the right half is mirrored about the panel centre x 100.
 */
export const VIEW_BOX_SIZE = 400
export const PANEL_WIDTH = 200
const CENTRE = PANEL_WIDTH / 2

export type Panel = "front" | "back"
export const PANELS: ReadonlyArray<Panel> = ["front", "back"]

export interface BodyRegion {
  readonly id: RegionId
  readonly panel: Panel
  readonly paths: ReadonlyArray<string>
  /** `hidden`: drawn only when highlighted (the cardio heart marker). */
  readonly idle: "shown" | "hidden"
}

/** Paint for the map: stroke widths are in screen pixels, scaled by the component. */
export const MUSCLE_MAP_STYLE = {
  outlineWidth: 2,
  seamWidth: 1.25,
  primaryOpacity: 0.9,
  secondaryOpacity: 0.35,
} as const

const COMMAND = /([MLCQSZ])([^MLCQSZ]*)/g
const round = (n: number) => String(Math.round(n * 100) / 100)

/** Applies `fx` to every x coordinate of an absolute path (commands take (x, y) pairs only). */
const mapX = (d: string, fx: (x: number) => number): string =>
  Array.from(d.matchAll(COMMAND), (match) => {
    const numbers = (match[2] ?? "")
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
    const coords = numbers.map((s, i) => (i % 2 === 0 ? round(fx(Number(s))) : s))
    return [match[1] ?? "", ...coords].join(" ")
  }).join(" ")

export const mirrorPath = (d: string): string => mapX(d, (x) => 2 * CENTRE - x)
export const shiftPath = (d: string, dx: number): string => mapX(d, (x) => x + dx)

/** Every (x, y) point a path names (anchors and control points). */
export const pathPoints = (d: string): ReadonlyArray<readonly [number, number]> =>
  Array.from(d.matchAll(COMMAND)).flatMap((match) => {
    const numbers = (match[2] ?? "")
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
      .map(Number)
    return Arr.chunksOf(numbers, 2).flatMap(([x, y]) =>
      x === undefined || y === undefined ? [] : [[x, y] as const],
    )
  })

const offset = (panel: Panel) => (panel === "front" ? 0 : PANEL_WIDTH)
const place = (panel: Panel, d: string) => shiftPath(d, offset(panel))
/** A left-half shape and its mirror, placed on a panel. */
const both = (panel: Panel, ...halves: ReadonlyArray<string>): ReadonlyArray<string> =>
  halves.flatMap((half) => [place(panel, half), place(panel, mirrorPath(half))])

/** Viewer's-left half of the silhouette, head top (100,12) to crotch (100,214); open path. */
const OUTLINE_HALF = `M 100 12
  C 89 12 80.5 20 80.5 35 C 80.5 46 83.5 55 89 61 C 91 63.5 91.5 67 91 73
  C 87 78 77 80.5 66 83 C 55 85.5 47.5 92 46.5 104
  C 45.5 116 43.5 128 42.5 140 C 41.5 152 41 161 40 170
  C 38 184 34 204 32 222 C 31 230 30 238 31 248 C 32 256 35 262 39 262
  C 43 262 46 257 46 249 C 46 240 45 233 46 225
  C 49 209 54 191 56.5 175 C 58 163 60 150 61 140 C 62 132 63 127 64 123
  C 66 136 69 150 70 162 C 70 172 66 186 64 200
  C 62 214 61 228 62 244 C 63 262 66 280 69 296
  C 71 304 70.5 312 69 320 C 66 334 66 348 70 362
  C 72 370 73 376 72 382 C 70 388 74 392 81 392 C 88 392 90 388 88 382
  C 87 374 87 366 88 356 C 90 340 90 326 88 316
  C 87 308 89 300 90 292 C 93 270 96 240 97 222 C 98 216 99 214 100 214`

/** The half closed 1 unit past the centre line so the two filled halves overlap (no seam). */
const FILL_HALF = `${OUTLINE_HALF} L 101 214 L 101 12 Z`

export const SILHOUETTE: Readonly<
  Record<Panel, { readonly fill: ReadonlyArray<string>; readonly outline: ReadonlyArray<string> }>
> = {
  front: { fill: both("front", FILL_HALF), outline: both("front", OUTLINE_HALF) },
  back: { fill: both("back", FILL_HALF), outline: both("back", OUTLINE_HALF) },
}

/** Non-region anatomy (knee caps, shins) drawn in the idle tone for a muscular read. */
export const DETAILS: Readonly<Record<Panel, ReadonlyArray<string>>> = {
  front: both(
    "front",
    // tibialis anterior
    "M 71 324 C 69 336 70 350 74 366 C 77 356 80 342 82 328 C 79 322 75 320 71 324 Z",
    // knee
    "M 72 296 C 74 290 82 288 86 294 C 87 302 84 308 79 309 C 74 308 71 302 72 296 Z",
    // neck (sternocleidomastoid)
    "M 92 66 C 93 72 95 79 98 86 C 99 80 98 72 96 64 C 95 63 93 64 92 66 Z",
  ),
  back: both(
    "back",
    // back of the knee
    "M 70 304 C 76 300 86 300 90 305 C 86 312 76 312 70 304 Z",
  ),
}

const FRONT_HALVES: ReadonlyArray<readonly [RegionId, ReadonlyArray<string>]> = [
  [
    "trapsFront",
    ["M 90.5 72 C 86 77.5 76 80.5 67 83.5 C 76 86 86 86.5 95 85 C 92 81 91 77 90.5 72 Z"],
  ],
  [
    "chest",
    [
      "M 98.5 91 C 88 87.5 75 88.5 66.5 94 C 62.5 103 62.5 114 67 124 C 75 134 88 138 98.5 134.5 C 99.5 120 99.5 104 98.5 91 Z",
    ],
  ],
  [
    "frontDelts",
    [
      "M 64 87.5 C 59 99 57 116 55.5 135 C 59.5 131 62.5 127 64.5 122.5 C 61 112 61 102 65 93.5 C 65.5 90.5 65.5 88.5 64 87.5 Z",
    ],
  ],
  [
    "sideDelts",
    ["M 62 86 C 53.5 88 48.5 95 48 106 C 47.5 117 49 127 52.5 137 C 54 120 57 102 62 86 Z"],
  ],
  [
    "biceps",
    [
      "M 52.5 128 C 47 136 45.5 150 47 163 C 49 169 54.5 170 56.5 164 C 59 151 59.5 137 56 129 C 55 126.5 53.5 126.5 52.5 128 Z",
    ],
  ],
  [
    "forearmsFront",
    [
      "M 44 174 C 39.5 188 36 205 34.5 222 C 37.5 226 42 226 44.5 222 C 48 207 52.5 190 55 177 C 52 171 47 170 44 174 Z",
    ],
  ],
  [
    "abs",
    [
      "M 98.5 140 C 92 139 87.5 141 86.5 146 C 86 150 86 154 86.5 158 C 91 159.5 95 159.5 98.5 158.5 Z",
      "M 98.5 162 C 94 162.5 90 162.5 86.5 161.5 C 86 166 86 172 86.5 177 C 91 178.5 95 178.5 98.5 178 Z",
      "M 98.5 181.5 C 94 182 90 182 86.5 181 C 86 186 86 192 87 197 C 91 198.5 95 198.5 98.5 198 Z",
      "M 98.5 201.5 C 94 202 90.5 202 87.5 201 C 88.5 208 91.5 216 98.5 220 Z",
    ],
  ],
  [
    "obliques",
    [
      "M 68 131 C 73 136 79 140 83.5 142 C 83 160 83 180 84 196 C 79 199 74 200.5 68 199 C 69.5 186 71.5 173 71 161 C 70.5 150 69.5 140 68 131 Z",
    ],
  ],
  [
    "quads",
    [
      // vastus lateralis
      "M 63.5 213 C 61.5 236 62.5 262 68.5 292 C 74 286 77.5 270 78 252 C 78.5 236 72.5 221 63.5 213 Z",
      // rectus femoris
      "M 72 209 C 76 222 78.5 238 78.5 254 C 78.5 266 78 274 78.5 281 C 80 289 84 290 86 284 C 88.5 262 88.5 236 84 214 C 80 209.5 76 208 72 209 Z",
      // vastus medialis
      "M 88.5 254 C 86 268 85.5 283 88.5 293 C 92.5 292 95 286 94.5 275 C 94 266 92 259 88.5 254 Z",
    ],
  ],
  [
    "adductors",
    [
      "M 96.5 221 C 93.5 218.5 90.5 219 88 222 C 90 233 90.5 243 90 253 C 93.5 244 95.5 233 96.5 221 Z",
    ],
  ],
  [
    "calvesFront",
    ["M 85.5 319 C 89.5 329 90.5 341 88.5 353 C 87 358.5 85 360 84 356 C 83 344 83 331 85.5 319 Z"],
  ],
]

const BACK_HALVES: ReadonlyArray<readonly [RegionId, ReadonlyArray<string>]> = [
  [
    "traps",
    [
      "M 99.5 66 C 96 72 92.5 76 89 78.5 C 81 82 71 84.5 65 88 C 73 94 82 100 88 110 C 92 126 96 148 99.5 166 Z",
    ],
  ],
  [
    "rearDelts",
    [
      "M 63 89 C 54 89.5 48.5 96 48 106 C 47.5 118 49.5 128 52.5 137 C 56 126 62 112 71 100.5 C 69 95 66.5 91 63 89 Z",
    ],
  ],
  [
    "upperBack",
    [
      "M 72.5 101.5 C 79 105 84.5 110 87 115 C 89 124 89 132 86 139 C 78 139.5 70.5 135.5 65 128 C 65 118 68 109 72.5 101.5 Z",
    ],
  ],
  [
    "lats",
    [
      "M 64.5 131 C 72 139.5 81 143.5 88 143.5 C 92 151 96 160 98.5 170 C 96 182 92 192 88 199 C 80 198 74 192 71 180 C 70.5 164 68.5 146 64.5 131 Z",
    ],
  ],
  [
    "lowerBack",
    ["M 99 172 C 94.5 176 91 184 89 195 C 88.5 202 90 208 93 212 C 95 212.5 97 212.5 99 212 Z"],
  ],
  [
    "triceps",
    [
      "M 50.5 128 C 45.5 138 44 152 46 165 C 50 171 55.5 169 57.5 161 C 59.5 147 59 134 56 127 C 54 125.5 52 126 50.5 128 Z",
    ],
  ],
  [
    "forearmsBack",
    [
      "M 44 174 C 39.5 188 36 205 34.5 222 C 37.5 226 42 226 44.5 222 C 48 207 52.5 190 55 177 C 52 171 47 170 44 174 Z",
    ],
  ],
  [
    "glutes",
    [
      "M 99.5 206 C 90 202.5 77 201.5 66.5 206.5 C 62.5 220 64 236 72 244.5 C 82 250.5 94 249 99.5 243 Z",
    ],
  ],
  [
    "hamstrings",
    [
      // biceps femoris
      "M 64 249 C 63 267 66 285 72.5 301 C 78 294 81 279 81.5 260 C 78 253 71.5 250 64 249 Z",
      // semitendinosus / semimembranosus
      "M 82.5 254 C 82 272 83 289 87 301 C 91 299 94 290 95 277 C 96 267 96.5 257 96.5 249.5 C 91 251 86.5 252.5 82.5 254 Z",
    ],
  ],
  [
    "calves",
    [
      // lateral gastrocnemius
      "M 70 312 C 66 326 66 342 71.5 356 C 76.5 351 79 339 79 324 C 77.5 317 74 313 70 312 Z",
      // medial gastrocnemius
      "M 80.5 312 C 80 329 82 346 86 359 C 90.5 352 91.5 338 89.5 323 C 88 315.5 84.5 311.5 80.5 312 Z",
    ],
  ],
]

/** A small heart on the figure's left chest (viewer's right), not mirrored. */
const HEART =
  "M 112 106 C 112 101.5 106 100.5 106 105.5 C 106 110 112 114 112 116 C 112 114 118 110 118 105.5 C 118 100.5 112 101.5 112 106 Z"

export const REGIONS: ReadonlyArray<BodyRegion> = [
  ...FRONT_HALVES.map(([id, halves]) => ({
    id,
    panel: "front" as const,
    paths: both("front", ...halves),
    idle: "shown" as const,
  })),
  { id: "heart", panel: "front", paths: [HEART], idle: "hidden" },
  ...BACK_HALVES.map(([id, halves]) => ({
    id,
    panel: "back" as const,
    paths: both("back", ...halves),
    idle: "shown" as const,
  })),
]
