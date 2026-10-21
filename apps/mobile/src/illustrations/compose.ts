/**
 * Scene → complete SVG string (v2-catalog.md §5, design-system.md §7). One neutral `<g>` holds the
 * figure, the equipment and the thin `Scene.accent` paths; the single accent region for the working
 * muscle (TI2) is drawn on top, on the rig segment that `MUSCLE_REGIONS` names.
 */
import type { IllustrationId, MuscleGroup } from "@tanren/shared"
import { drawGlyph, type GlyphName } from "./glyphs"
import { drawFigure, type Joints, jointsOf, type Point, type Pose, pt, type View } from "./rig"
import { ACCENT_FILL_OPACITY, PALETTE, STROKE, SVG_ROOT } from "./style"

export interface Prop {
  readonly glyph: GlyphName
  readonly at: Point
  readonly rotate?: number
  readonly scale?: number
}

export interface Figure {
  readonly pose: Pose
  /** The hip point (see rig.ts). */
  readonly origin: Point
  readonly scale?: number
}

export interface Scene {
  readonly id: IllustrationId
  readonly view: View
  readonly figure: Figure
  /** Drawn after the figure, in order. */
  readonly props: ReadonlyArray<Prop>
  /** True when the figure rests on the floor (origin from `onFloor`); the line is never drawn. */
  readonly floor: boolean
  /** ≤ 3 extra path `d` strings (motion arrow, cable/band line), neutral at stroke 1.5. */
  readonly accent?: ReadonlyArray<string>
}

/** A rig segment from joint `from` to joint `to` of the figure's left side (or the torso). */
export type Segment = "torso" | "upperTorso" | "upperArm" | "forearm" | "thigh" | "shin"

/** Which side of the segment the band sits on (side view); front view always centres it. */
export type Face = "front" | "back" | "centre"

export interface Region {
  readonly segment: Segment
  /** Fractions of the segment length where the band starts and ends. */
  readonly from: number
  readonly to: number
  readonly width: number
  readonly face: Face
}

const region = (segment: Segment, from: number, to: number, width: number, face: Face): Region => ({
  segment,
  from,
  to,
  width,
  face,
})

/** Every `MuscleGroup` → its accent band. A new muscle literal is a compile error here. */
export const MUSCLE_REGIONS: { readonly [M in MuscleGroup]: Region } = {
  chest: region("torso", 0.1, 0.45, 12, "front"),
  lats: region("torso", 0.2, 0.6, 12, "back"),
  upperBack: region("torso", 0.08, 0.38, 12, "back"),
  lowerBack: region("torso", 0.6, 0.95, 10, "back"),
  traps: region("upperTorso", 0, 1, 10, "back"),
  shoulders: region("upperArm", 0, 0.4, 12, "centre"),
  biceps: region("upperArm", 0.15, 0.9, 9, "front"),
  triceps: region("upperArm", 0.15, 0.9, 9, "back"),
  forearms: region("forearm", 0.1, 0.8, 10, "centre"),
  core: region("torso", 0.45, 0.9, 12, "front"),
  quads: region("thigh", 0.1, 0.9, 12, "front"),
  hamstrings: region("thigh", 0.15, 0.9, 11, "back"),
  glutes: region("thigh", 0, 0.35, 13, "back"),
  adductors: region("thigh", 0.1, 0.7, 10, "centre"),
  calves: region("shin", 0.1, 0.6, 10, "back"),
  fullBody: region("torso", 0.1, 0.9, 14, "centre"),
  cardio: region("torso", 0.1, 0.45, 14, "centre"),
}

/** Segment endpoints, oriented proximal → distal (torso: shoulder → hip). */
const ends = (j: Joints, segment: Segment): readonly [Point, Point] => {
  const upperTorso: readonly [Point, Point] = [
    j.neckTop,
    { x: (j.neckBase.x * 3 + j.hipCentre.x) / 4, y: (j.neckBase.y * 3 + j.hipCentre.y) / 4 },
  ]
  const table: { readonly [S in Segment]: readonly [Point, Point] } = {
    torso: [j.neckBase, j.hipCentre],
    upperTorso,
    upperArm: [j.shoulder.left, j.elbow.left],
    forearm: [j.elbow.left, j.hand.left],
    thigh: [j.hip.left, j.knee.left],
    shin: [j.knee.left, j.foot.left],
  }
  return table[segment]
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const shift = (p: Point, n: Point, k: number): Point => ({ x: p.x + n.x * k, y: p.y + n.y * k })

/** Front view torso: a slice of the shoulder-to-hip trapezoid, inset from the outline. */
const frontTorsoBand = (j: Joints, r: Region): ReadonlyArray<Point> => {
  const inset = 5
  const row = (t: number) => {
    const l = lerp(j.shoulder.left, j.hip.left, t)
    const rr = lerp(j.shoulder.right, j.hip.right, t)
    const dx = rr.x > l.x ? inset : -inset
    return [
      { x: l.x + dx, y: l.y },
      { x: rr.x - dx, y: rr.y },
    ] as const
  }
  const [a, b] = row(r.from)
  const [c, d] = row(r.to)
  return [a, b, d, c]
}

/** The closed accent band as a path `d`. */
export const regionPath = (j: Joints, view: View, r: Region): string => {
  const isTorso = r.segment === "torso" || r.segment === "upperTorso"
  const points =
    view === "front" && isTorso
      ? frontTorsoBand(j, r)
      : (() => {
          const [a, b] = ends(j, r.segment)
          const p0 = lerp(a, b, r.from)
          const p1 = lerp(a, b, r.to)
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
          // Anterior normal of a proximal → distal segment in a right-facing figure.
          const n = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length }
          const face = view === "front" ? "centre" : r.face
          const [lo, hi] =
            face === "centre"
              ? [-r.width / 2, r.width / 2]
              : face === "front"
                ? [0, r.width]
                : [-r.width, 0]
          return [shift(p0, n, lo), shift(p1, n, lo), shift(p1, n, hi), shift(p0, n, hi)]
        })()
  return `M${points.map(pt).join("L")}Z`
}

/** The accent region element for `muscle` on the placed figure. */
export const accentRegion = (scene: Scene, muscle: MuscleGroup): string => {
  const j = jointsOf(scene.figure.pose, scene.view, scene.figure.origin, scene.figure.scale)
  const d = regionPath(j, scene.view, MUSCLE_REGIONS[muscle])
  return `<path d="${d}" stroke="${PALETTE.accent}" stroke-width="${STROKE.accent}" fill="${PALETTE.accent}" fill-opacity="${ACCENT_FILL_OPACITY}"/>`
}

/**
 * The complete `<svg>`; deterministic (same scene and muscle → same string). Without `muscle`
 * there is no accent region (the build always passes the catalog's first primary muscle).
 */
export const renderScene = (scene: Scene, muscle?: MuscleGroup): string => {
  const { pose, origin, scale } = scene.figure
  const figure = drawFigure(pose, scene.view, origin, scale)
  const props = scene.props
    .map((prop) => drawGlyph(prop.glyph, prop.at, prop.rotate, prop.scale))
    .join("")
  const extras = (scene.accent ?? [])
    .map((d) => `<path d="${d}" stroke-width="${STROKE.thin}"/>`)
    .join("")
  const accent = muscle === undefined ? "" : accentRegion(scene, muscle)
  return `${SVG_ROOT}<g stroke="${PALETTE.figure}" stroke-width="${STROKE.figure}">${figure}${props}${extras}</g>${accent}</svg>`
}
