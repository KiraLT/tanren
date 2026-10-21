/**
 * Stick-figure rig: a `Pose` (segment angles) becomes joints and SVG elements.
 *
 * Authoring cheat-sheet
 * - Every angle is the ABSOLUTE direction of a segment from its proximal joint, in degrees:
 *   0 = straight down, 90 = forward (side view: right, the way the figure faces), 180 = straight
 *   up, -90 = backward (left). Torso goes hip → shoulder (upright 180); neck goes shoulder → head.
 *   Front view: a limb's 90 points OUTWARD on its own side (both arms 90 = a T); torso/neck tilt
 *   uses the side-view rule (90 = image right).
 * - `left` / `right` are the figure's own sides. Side view draws both (equal angles overlap);
 *   the accent always uses `left`.
 * - Origin = the hip point (side view; front view = midpoint of the hips). Put a figure on the
 *   floor with `onFloor(pose, view, hipX)` (lowest joint lands on FLOOR_Y = 208).
 * - Base poses: stand, squat, hinge, lunge, supineLying (head left, face up), proneLying (head
 *   right, face down), plank (forearm, head right), seated, hang, kneel, benchPress, curlTop,
 *   lateralRaiseTop. Tweak with `withAngles(poses.stand, { left: { upperArm: 90 }, both: {...} })`.
 * - Props attach to joints: `const j = jointsOf(pose, "side", origin)` then
 *   `{ glyph: "dumbbell", at: j.hand.left }`; or `handPoints(...)`, `footPoints(...)`,
 *   `hipPoint(...)`, `shoulderPoint(...)`. Floor props: `at: { x, y: FLOOR_Y - <glyph height> }`
 *   (see glyphs.ts header for each glyph's anchor and floor offset).
 * - Side view barbell = `plate` (the bar seen end-on); front view = `barbell`.
 * - Keep every joint inside x 24–216, y 20–220 (the tests check the base poses).
 */
import { BODY, FLOOR_Y } from "./style"

export interface Point {
  readonly x: number
  readonly y: number
}

export type View = "side" | "front"

/** One side's limb angles (degrees, absolute; see the header). */
export interface Limbs {
  readonly upperArm: number
  readonly forearm: number
  readonly thigh: number
  readonly shin: number
}

export interface Pose {
  readonly torso: number
  readonly neck: number
  readonly left: Limbs
  readonly right: Limbs
}

export interface PoseOverride {
  readonly torso?: number
  readonly neck?: number
  /** Applied to both sides first, then `left` / `right` win. */
  readonly both?: Partial<Limbs>
  readonly left?: Partial<Limbs>
  readonly right?: Partial<Limbs>
}

export interface Sides {
  readonly left: Point
  readonly right: Point
}

/** Every joint of a placed figure. */
export interface Joints {
  readonly head: Point
  /** Top of the neck line, where it meets the head circle. */
  readonly neckTop: Point
  /** Side view: the shoulder point; front view: the midpoint of the shoulder line. */
  readonly neckBase: Point
  readonly hipCentre: Point
  readonly shoulder: Sides
  readonly elbow: Sides
  readonly hand: Sides
  readonly hip: Sides
  readonly knee: Sides
  readonly foot: Sides
}

const limbs = (upperArm: number, forearm: number, thigh: number, shin: number): Limbs => ({
  upperArm,
  forearm,
  thigh,
  shin,
})

const symmetric = (torso: number, neck: number, side: Limbs): Pose => ({
  torso,
  neck,
  left: side,
  right: side,
})

export const withAngles = (base: Pose, override: PoseOverride): Pose => ({
  torso: override.torso ?? base.torso,
  neck: override.neck ?? base.neck,
  left: { ...base.left, ...override.both, ...override.left },
  right: { ...base.right, ...override.both, ...override.right },
})

export const poses = {
  stand: symmetric(180, 180, limbs(0, 0, 0, 0)),
  /** Squat bottom: hips back, thighs near parallel, torso leaning forward. */
  squat: symmetric(150, 160, limbs(-40, 160, 78, -16)),
  /** Hip hinge (RDL bottom): torso near horizontal, soft knees, arms hanging. */
  hinge: symmetric(100, 110, limbs(0, 0, 14, -4)),
  /** Split squat bottom: left leg forward, right knee near the floor. */
  lunge: {
    torso: 180,
    neck: 180,
    left: limbs(0, 0, 86, 0),
    right: limbs(0, 0, -20, -82),
  },
  /** On the back, head left, face up, arms along the body. */
  supineLying: symmetric(-90, -90, limbs(90, 90, 90, 90)),
  /** On the front, head right, face down, arms along the body. */
  proneLying: symmetric(90, 90, limbs(-90, -90, -90, -90)),
  /** Forearm plank, head right: elbows under the shoulders, straight line to the toes. */
  plank: symmetric(104, 104, limbs(0, 90, -76, -76)),
  /** On a seat: thighs forward, shins down. */
  seated: symmetric(180, 180, limbs(0, 0, 90, 0)),
  /** Dead hang (side view): arms straight overhead, knees bent back so the figure fits. */
  hang: symmetric(180, 180, limbs(180, 180, 30, -40)),
  /** Tall kneel: knees on the floor, shins back along it. */
  kneel: symmetric(180, 180, limbs(0, 0, 0, -90)),
  /** Supine on a bench, head left: arms vertical, knees up, feet down. */
  benchPress: symmetric(-90, -90, limbs(180, 180, 98, 0)),
  /** Standing curl top: elbows at the sides, forearms up. */
  curlTop: symmetric(180, 180, limbs(10, 150, 0, 0)),
  /** Front view lateral raise top: arms out to shoulder height. */
  lateralRaiseTop: symmetric(180, 180, limbs(72, 78, 0, 0)),
} as const satisfies Record<string, Pose>

export type PoseName = keyof typeof poses

const rad = (degrees: number) => (degrees * Math.PI) / 180

const step = (from: Point, degrees: number, length: number, flipX = false): Point => ({
  x: from.x + (flipX ? -1 : 1) * Math.sin(rad(degrees)) * length,
  y: from.y + Math.cos(rad(degrees)) * length,
})

export const jointsOf = (pose: Pose, view: View, origin: Point, scale = 1): Joints => {
  const len = (n: number) => n * scale
  const neckBase = step(origin, pose.torso, len(BODY.torso))
  const head = step(neckBase, pose.neck, len(BODY.neck))
  const neckTop = step(neckBase, pose.neck, len(BODY.neck - BODY.headRadius))
  // Front view: the shoulder and hip lines are perpendicular to the torso axis; the figure's
  // left side is on the image right.
  const axis = step({ x: 0, y: 0 }, pose.torso, 1)
  const across = { x: -axis.y, y: axis.x }
  const offset = (p: Point, half: number, sign: 1 | -1): Point =>
    view === "front"
      ? { x: p.x + sign * across.x * len(half), y: p.y + sign * across.y * len(half) }
      : p
  const shoulder = {
    left: offset(neckBase, BODY.shoulderHalfWidth, 1),
    right: offset(neckBase, BODY.shoulderHalfWidth, -1),
  }
  const hip = {
    left: offset(origin, BODY.hipHalfWidth, 1),
    right: offset(origin, BODY.hipHalfWidth, -1),
  }
  // Front view mirrors the right side so that 90 points outward on both sides.
  const flip = (side: "left" | "right") => view === "front" && side === "right"
  const elbowOf = (side: "left" | "right") =>
    step(shoulder[side], pose[side].upperArm, len(BODY.upperArm), flip(side))
  const kneeOf = (side: "left" | "right") =>
    step(hip[side], pose[side].thigh, len(BODY.thigh), flip(side))
  const elbow = { left: elbowOf("left"), right: elbowOf("right") }
  const knee = { left: kneeOf("left"), right: kneeOf("right") }
  const hand = {
    left: step(elbow.left, pose.left.forearm, len(BODY.forearm), flip("left")),
    right: step(elbow.right, pose.right.forearm, len(BODY.forearm), flip("right")),
  }
  const foot = {
    left: step(knee.left, pose.left.shin, len(BODY.shin), flip("left")),
    right: step(knee.right, pose.right.shin, len(BODY.shin), flip("right")),
  }
  return { head, neckTop, neckBase, hipCentre: origin, shoulder, elbow, hand, hip, knee, foot }
}

export const handPoints = (pose: Pose, view: View, origin: Point, scale = 1): Sides =>
  jointsOf(pose, view, origin, scale).hand

export const footPoints = (pose: Pose, view: View, origin: Point, scale = 1): Sides =>
  jointsOf(pose, view, origin, scale).foot

export const hipPoint = (pose: Pose, view: View, origin: Point, scale = 1): Point =>
  jointsOf(pose, view, origin, scale).hipCentre

export const shoulderPoint = (pose: Pose, view: View, origin: Point, scale = 1): Point =>
  jointsOf(pose, view, origin, scale).neckBase

/** Every joint as a flat list, head circle extremes included (bounds checks, floor placement). */
export const jointList = (joints: Joints, scale = 1): ReadonlyArray<Point> => {
  const r = BODY.headRadius * scale
  const sides = [
    joints.shoulder,
    joints.elbow,
    joints.hand,
    joints.hip,
    joints.knee,
    joints.foot,
  ].flatMap((s) => [s.left, s.right])
  return [
    { x: joints.head.x - r, y: joints.head.y - r },
    { x: joints.head.x + r, y: joints.head.y + r },
    joints.neckBase,
    joints.hipCentre,
    ...sides,
  ]
}

/** The origin (hip point) at `hipX` that puts the figure's lowest joint on `floorY`. */
export const onFloor = (pose: Pose, view: View, hipX: number, scale = 1, floorY = FLOOR_Y) => {
  const lowest = Math.max(
    ...jointList(jointsOf(pose, view, { x: 0, y: 0 }, scale), scale).map((p) => p.y),
  )
  return { x: hipX, y: Math.round(floorY - lowest) }
}

/** Integer coordinates keep files small; `|| 0` folds -0 into 0. */
export const num = (n: number): string => String(Math.round(n) || 0)

export const pt = (p: Point): string => `${num(p.x)},${num(p.y)}`

const polyline = (points: ReadonlyArray<Point>) =>
  `<polyline points="${points.map(pt).join(" ")}"/>`

/** The figure as SVG elements (no wrapper; the caller's `<g>` sets stroke and width). */
export const drawFigure = (pose: Pose, view: View, origin: Point, scale = 1): string => {
  const j = jointsOf(pose, view, origin, scale)
  const head = `<circle cx="${num(j.head.x)}" cy="${num(j.head.y)}" r="${num(BODY.headRadius * scale)}"/>`
  const arm = (side: "left" | "right") => polyline([j.shoulder[side], j.elbow[side], j.hand[side]])
  const leg = (side: "left" | "right") => polyline([j.hip[side], j.knee[side], j.foot[side]])
  const torso =
    view === "side"
      ? polyline([j.hipCentre, j.neckBase, j.neckTop])
      : `<path d="M${pt(j.shoulder.right)}L${pt(j.shoulder.left)}L${pt(j.hip.left)}L${pt(j.hip.right)}Z"/>${polyline([j.neckBase, j.neckTop])}`
  // Side view: identical left/right limbs would draw the same polyline twice; keep one.
  const unique = (a: string, b: string) => (a === b ? a : `${a}${b}`)
  return `${head}${torso}${unique(leg("right"), leg("left"))}${unique(arm("right"), arm("left"))}`
}
