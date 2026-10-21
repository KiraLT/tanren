/**
 * Equipment glyphs (design-system.md §7 "Equipment glyphs"), one per `CatalogEquipment` name in
 * v2-catalog.md §5. Each glyph is drawn around its anchor `at`; `scale` resizes it, `rotate`
 * (degrees, clockwise) turns it about `at`. Strokes come from the caller's `<g>`.
 *
 * Anchors (and how far below `at` the glyph reaches at scale 1, for floor props: at.y = FLOOR_Y − d)
 * - barbell: bar centre, bar 120 wide, plates 12×30 at both ends (front view) · d 15
 * - plate: disc centre, r 16 (also the side-view barbell, seen end-on) · d 16
 * - dumbbell: handle centre, bar 24 + plates 8×20 · d 10
 * - kettlebell: top of the handle (the hand) · d 32
 * - bench: centre of the top line, 80 wide, legs 24 · d 24
 * - rack: foot of the upright, 150 tall, hook at 104 · d 0
 * - cable: pulley centre r 5 (draw the cable itself with `cableLine` in `Scene.accent`) · d 5
 * - machineSeat: centre of the seat, back rest behind (left), post 44 · d 44
 * - pullUpBar: bar centre, 90 wide, mounts up · d 0
 * - box: centre of the top, 48×36 · d 36
 * - mat: centre, 110×4 · d 2
 * - band: anchor loop (draw the band with `bandLine` in `Scene.accent`) · d 4
 * - ball: centre, r 14 · d 14
 * - abWheel: axle centre, wheel r 10, handles ±14 · d 10
 * - roller: centre, r 10 (end-on) · d 10
 */
import { num, type Point, pt } from "./rig"
import { STROKE } from "./style"

export type GlyphName =
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "bench"
  | "rack"
  | "cable"
  | "machineSeat"
  | "pullUpBar"
  | "box"
  | "mat"
  | "band"
  | "plate"
  | "ball"
  | "abWheel"
  | "roller"

export const GLYPH_NAMES: ReadonlyArray<GlyphName> = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "bench",
  "rack",
  "cable",
  "machineSeat",
  "pullUpBar",
  "box",
  "mat",
  "band",
  "plate",
  "ball",
  "abWheel",
  "roller",
]

type Draw = (at: Point, s: number) => string

const p = (at: Point, s: number, dx: number, dy: number): Point => ({
  x: at.x + dx * s,
  y: at.y + dy * s,
})

const line = (a: Point, b: Point) =>
  `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}"/>`

const poly = (points: ReadonlyArray<Point>) => `<polyline points="${points.map(pt).join(" ")}"/>`

const circle = (c: Point, r: number) => `<circle cx="${num(c.x)}" cy="${num(c.y)}" r="${num(r)}"/>`

/** A rect centred on `c`. */
const rect = (c: Point, w: number, h: number, rx: number) =>
  `<rect x="${num(c.x - w / 2)}" y="${num(c.y - h / 2)}" width="${num(w)}" height="${num(h)}" rx="${num(rx)}"/>`

const thin = (inner: string) => inner.replace("/>", ` stroke-width="${STROKE.thin}"/>`)

const draw: { readonly [G in GlyphName]: Draw } = {
  barbell: (at, s) =>
    `${line(p(at, s, -60, 0), p(at, s, 60, 0))}${rect(p(at, s, -54, 0), 12, 30, 3)}${rect(p(at, s, 54, 0), 12, 30, 3)}`,
  plate: (at, s) => `${circle(at, 16 * s)}${circle(at, 3 * s)}`,
  dumbbell: (at, s) =>
    `${line(p(at, s, -12, 0), p(at, s, 12, 0))}${rect(p(at, s, -16, 0), 8, 20, 2)}${rect(p(at, s, 16, 0), 8, 20, 2)}`,
  kettlebell: (at, s) =>
    `<path d="M${pt(p(at, s, -7, 10))}C${pt(p(at, s, -8, -3))} ${pt(p(at, s, 8, -3))} ${pt(p(at, s, 7, 10))}"/>${circle(p(at, s, 0, 20), 12 * s)}`,
  bench: (at, s) =>
    `${line(p(at, s, -40, 0), p(at, s, 40, 0))}${poly([p(at, s, -32, 0), p(at, s, -32, 24)])}${poly([p(at, s, 32, 0), p(at, s, 32, 24)])}`,
  rack: (at, s) =>
    `${line(p(at, s, -14, 0), p(at, s, 14, 0))}${line(at, p(at, s, 0, -150))}${poly([p(at, s, 0, -104), p(at, s, 10, -104), p(at, s, 10, -110)])}`,
  cable: (at, s) => `${circle(at, 5 * s)}${line(p(at, s, 0, -5), p(at, s, 0, -14))}`,
  machineSeat: (at, s) =>
    `${line(p(at, s, -20, 0), p(at, s, 20, 0))}${line(p(at, s, -20, 0), p(at, s, -26, -60))}${line(at, p(at, s, 0, 44))}${line(p(at, s, -20, 44), p(at, s, 20, 44))}`,
  pullUpBar: (at, s) =>
    `${line(p(at, s, -45, 0), p(at, s, 45, 0))}${line(p(at, s, -40, 0), p(at, s, -40, -12))}${line(p(at, s, 40, 0), p(at, s, 40, -12))}`,
  box: (at, s) => rect(p(at, s, 0, 18), 48 * s, 36 * s, 2),
  mat: (at, s) => rect(at, 110 * s, 4 * s, 2),
  band: (at, s) =>
    `<ellipse cx="${num(at.x)}" cy="${num(at.y)}" rx="${num(6 * s)}" ry="${num(4 * s)}"/>`,
  ball: (at, s) =>
    `${circle(at, 14 * s)}<path d="M${pt(p(at, s, -14, 0))}Q${pt(p(at, s, 0, 10))} ${pt(p(at, s, 14, 0))}"/>`,
  abWheel: (at, s) => `${circle(at, 10 * s)}${line(p(at, s, -14, 0), p(at, s, 14, 0))}`,
  roller: (at, s) => `${circle(at, 10 * s)}${thin(circle(at, 4 * s))}`,
}

/** One glyph as SVG elements, optionally wrapped in a rotation about `at`. */
export const drawGlyph = (glyph: GlyphName, at: Point, rotate = 0, scale = 1): string => {
  const body = draw[glyph](at, scale)
  return rotate === 0
    ? body
    : `<g transform="rotate(${num(rotate)} ${pt(at).replace(",", " ")})">${body}</g>`
}

/** Path `d` for a cable from a pulley to a hand (goes in `Scene.accent`, drawn thin). */
export const cableLine = (from: Point, to: Point): string => `M${pt(from)}L${pt(to)}`

/** Path `d` for a resistance band with a slight sag (goes in `Scene.accent`, drawn thin). */
export const bandLine = (from: Point, to: Point): string => {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 6 }
  return `M${pt(from)}Q${pt(mid)} ${pt(to)}`
}
