/**
 * Batch b00: the six reference scenes, one per committed catalog module (legs, core, back, chest,
 * shoulders, arms). Batch engineers copy this shape: compute origins and prop anchors from the rig,
 * never by hand.
 */
import { IllustrationId } from "@tanren/shared"
import type { Scene } from "../compose"
import { jointsOf, onFloor, poses, withAngles } from "../rig"
import { FLOOR_Y } from "../style"

const id = IllustrationId.make

const squatOrigin = onFloor(poses.squat, "side", 96)
const squat = jointsOf(poses.squat, "side", squatOrigin)

const plankOrigin = onFloor(poses.plank, "side", 112)

const pullUpPose = withAngles(poses.hang, {
  both: { upperArm: 150, forearm: 190, thigh: 0, shin: 0 },
})
const pullUpOrigin = { x: 120, y: 128 }
const pullUp = jointsOf(pullUpPose, "front", pullUpOrigin, 0.9)

const benchHeight = 36
const benchOrigin = { x: 120, y: FLOOR_Y - benchHeight - 4 }
const bench = jointsOf(poses.benchPress, "side", benchOrigin)

const raiseOrigin = onFloor(poses.lateralRaiseTop, "front", 120, 0.85)
const raise = jointsOf(poses.lateralRaiseTop, "front", raiseOrigin, 0.85)

const curlOrigin = onFloor(poses.curlTop, "side", 110)
const curl = jointsOf(poses.curlTop, "side", curlOrigin)

export const scenes: ReadonlyArray<Scene> = [
  {
    id: id("barbell-back-squat"),
    view: "side",
    figure: { pose: poses.squat, origin: squatOrigin },
    props: [{ glyph: "plate", at: { x: squat.neckBase.x - 14, y: squat.neckBase.y + 8 } }],
    floor: true,
  },
  {
    id: id("plank"),
    view: "side",
    figure: { pose: poses.plank, origin: plankOrigin },
    props: [],
    floor: true,
  },
  {
    id: id("pull-up"),
    view: "front",
    figure: { pose: pullUpPose, origin: pullUpOrigin, scale: 0.9 },
    props: [{ glyph: "pullUpBar", at: { x: 120, y: pullUp.hand.left.y } }],
    floor: false,
  },
  {
    id: id("barbell-bench-press"),
    view: "side",
    figure: { pose: poses.benchPress, origin: benchOrigin },
    props: [
      { glyph: "bench", at: { x: 96, y: FLOOR_Y - benchHeight }, scale: 1.5 },
      { glyph: "plate", at: bench.hand.left },
    ],
    floor: true,
  },
  {
    id: id("dumbbell-lateral-raise"),
    view: "front",
    figure: { pose: poses.lateralRaiseTop, origin: raiseOrigin, scale: 0.85 },
    props: [
      { glyph: "dumbbell", at: raise.hand.left, rotate: 90, scale: 0.85 },
      { glyph: "dumbbell", at: raise.hand.right, rotate: 90, scale: 0.85 },
    ],
    floor: true,
  },
  {
    id: id("dumbbell-curl"),
    view: "side",
    figure: { pose: poses.curlTop, origin: curlOrigin },
    props: [{ glyph: "dumbbell", at: curl.hand.left }],
    floor: true,
  },
]
