import { describe, expect, it } from "@effect/vitest"
import { jointList, jointsOf, onFloor, type PoseName, poses, type View, withAngles } from "./rig"
import { FLOOR_Y, SAFE_AREA } from "./style"

const bounds = (name: PoseName, view: View) => {
  const pose = poses[name]
  const origin = onFloor(pose, view, 0)
  const points = jointList(jointsOf(pose, view, origin))
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

const FRONT_POSES: ReadonlyArray<PoseName> = ["stand", "hang", "lateralRaiseTop", "seated"]

describe("rig", () => {
  it("has the ten required base poses", () => {
    const required = [
      "stand",
      "squat",
      "hinge",
      "lunge",
      "supineLying",
      "proneLying",
      "plank",
      "seated",
      "hang",
      "kneel",
    ]
    expect(Object.keys(poses)).toEqual(expect.arrayContaining(required))
  })

  // Object.keys loses the literal key type; the keys are exactly `poses`' own.
  const names = Object.keys(poses) as ReadonlyArray<PoseName>
  const cases = names.flatMap((name) =>
    (FRONT_POSES.includes(name) ? (["side", "front"] as const) : (["side"] as const)).map(
      (view) => [name, view] as const,
    ),
  )

  it.each(cases)("%s (%s view) fits inside x 24–216 / y 20–220", (name, view) => {
    const b = bounds(name, view)
    expect(b.maxX - b.minX).toBeLessThanOrEqual(SAFE_AREA.maxX - SAFE_AREA.minX)
    expect(b.maxY).toBeCloseTo(FLOOR_Y, 0)
    // A hanging figure is placed from the bar down, not on the floor: only its height must fit.
    const top = name === "hang" ? SAFE_AREA.maxY - (b.maxY - b.minY) : b.minY
    expect(top).toBeGreaterThanOrEqual(SAFE_AREA.minY)
  })

  it("standing proportions match the §7 reference (hip 118, shoulders 62, head 40, ankles 208)", () => {
    const origin = onFloor(poses.stand, "front", 120)
    const j = jointsOf(poses.stand, "front", origin)
    expect(origin).toEqual({ x: 120, y: 118 })
    expect(j.neckBase).toEqual({ x: 120, y: 62 })
    expect(j.head.y).toBeCloseTo(40)
    expect(j.shoulder.left.x).toBeCloseTo(148)
    expect(j.shoulder.right.x).toBeCloseTo(92)
    expect(j.foot.left.y).toBeCloseTo(208)
  })

  it("90° points forward in side view and outward on both sides in front view", () => {
    const tee = withAngles(poses.stand, { both: { upperArm: 90, forearm: 90 } })
    const side = jointsOf(tee, "side", { x: 100, y: 100 })
    const front = jointsOf(tee, "front", { x: 120, y: 118 })
    expect(side.hand.left.x).toBeGreaterThan(side.neckBase.x)
    expect(front.hand.left.x).toBeCloseTo(148 + 70)
    expect(front.hand.right.x).toBeCloseTo(92 - 70)
  })

  it("withAngles applies both, then the named side", () => {
    const pose = withAngles(poses.stand, { torso: 170, both: { thigh: 20 }, left: { thigh: 40 } })
    expect(pose.torso).toBe(170)
    expect(pose.left.thigh).toBe(40)
    expect(pose.right.thigh).toBe(20)
    expect(pose.right.shin).toBe(0)
  })
})
