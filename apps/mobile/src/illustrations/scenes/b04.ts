/**
 * Batch b04 (catalog module chest-2): incline pressing and flies, push-up variations, cable and
 * machine chest work.
 */
import { IllustrationId } from "@tanren/shared"
import type { Prop, Scene } from "../compose"
import { cableLine } from "../glyphs"
import { jointsOf, onFloor, type Point, type Pose, poses, withAngles } from "../rig"
import { FLOOR_Y } from "../style"

const id = IllustrationId.make

/** Seat plus a back rest tilted 45 degrees, placed from the hip and shoulder of the figure. */
const inclineBench = (hip: Point, shoulder: Point): ReadonlyArray<Prop> => [
  {
    glyph: "bench",
    at: { x: (hip.x + shoulder.x) / 2 - 5, y: (hip.y + shoulder.y) / 2 + 5 },
    rotate: 45,
    scale: 0.75,
  },
  { glyph: "bench", at: { x: hip.x + 6, y: hip.y + 6 }, scale: 0.5 },
]

const inclineLying = withAngles(poses.benchPress, {
  torso: -135,
  neck: -135,
  both: { thigh: 90, shin: 0 },
})
const inclineOrigin = onFloor(inclineLying, "side", 112)

const inclineScene = (
  sceneId: string,
  pose: Pose,
  prop: (hand: Point) => ReadonlyArray<Prop>,
  accent?: ReadonlyArray<string>,
): Scene => {
  const joints = jointsOf(pose, "side", inclineOrigin)
  return {
    id: id(sceneId),
    view: "side",
    figure: { pose, origin: inclineOrigin },
    props: [...inclineBench(joints.hipCentre, joints.neckBase), ...prop(joints.hand.left)],
    floor: true,
    ...(accent === undefined ? {} : { accent }),
  }
}

const flyPose = withAngles(inclineLying, {
  both: { upperArm: 228, forearm: 205 },
})
const flyShoulder = jointsOf(flyPose, "side", inclineOrigin).neckBase
const flyHands = jointsOf(flyPose, "side", inclineOrigin).hand.left

// Push-ups
const pushUpPose = withAngles(poses.plank, {
  both: { upperArm: 0, forearm: 0, thigh: -62, shin: -62 },
  torso: 118,
  neck: 112,
})
const pushUpOrigin = onFloor(pushUpPose, "side", 112)

const kneePose = withAngles(poses.plank, {
  both: { upperArm: 0, forearm: 0, thigh: -50, shin: -115 },
  torso: 135,
  neck: 122,
})
const kneeOrigin = onFloor(kneePose, "side", 112)

const inclinePushPose = withAngles(poses.plank, {
  both: { upperArm: 0, forearm: 0, thigh: -47, shin: -47 },
  torso: 133,
  neck: 124,
})
const inclinePushOrigin = onFloor(inclinePushPose, "side", 100)
const inclinePush = jointsOf(inclinePushPose, "side", inclinePushOrigin)
const pushBenchScale = (FLOOR_Y - inclinePush.hand.left.y - 2) / 24

// Cable fly (front view, arms up and together from low pulleys)
const cableScale = 0.9
const cablePose = withAngles(poses.stand, { both: { upperArm: 110, forearm: 140 } })
const cableOrigin = onFloor(cablePose, "front", 120, cableScale)
const cable = jointsOf(cablePose, "front", cableOrigin, cableScale)
const pulleyLeft = { x: 120 + 96, y: FLOOR_Y - 5 }
const pulleyRight = { x: 120 - 96, y: FLOOR_Y - 5 }

// Machine press (side view, seated, pressing forward)
const machinePose = withAngles(poses.seated, { both: { upperArm: 88, forearm: 90 } })
const machineOrigin = onFloor(machinePose, "side", 104)
const machine = jointsOf(machinePose, "side", machineOrigin)

/** A short horizontal motion arrow starting at `x`, pointing along `dir` (1 right, -1 left). */
const inwardArrow = (x: number, y: number, dir: 1 | -1): string => {
  const tip = Math.round(x + dir * 18)
  const back = tip - dir * 5
  return `M${Math.round(x)},${Math.round(y)}L${tip},${Math.round(y)}M${back},${Math.round(y) - 4}L${tip},${Math.round(y)}L${back},${Math.round(y) + 4}`
}

// Pec deck (front view, forearms up on the pads)
const pecPose = withAngles(poses.seated, {
  both: { upperArm: 90, forearm: 180, thigh: 24, shin: 0 },
})
const pecOrigin = onFloor(pecPose, "front", 120)
const pec = jointsOf(pecPose, "front", pecOrigin)

// Smith machine bench press: the same lift as the barbell, with a rail through the bar
const benchHeight = 36
const smithOrigin = { x: 120, y: FLOOR_Y - benchHeight - 4 }
const smith = jointsOf(poses.benchPress, "side", smithOrigin)

// Svend press: plate squeezed between the palms in front of the chest
const svendPose = withAngles(poses.stand, { both: { upperArm: 80, forearm: 90 } })
const svendOrigin = onFloor(svendPose, "side", 110)
const svend = jointsOf(svendPose, "side", svendOrigin)

export const scenes: ReadonlyArray<Scene> = [
  inclineScene("incline-barbell-bench-press", inclineLying, (hand) => [
    { glyph: "plate", at: hand },
  ]),
  inclineScene(
    "incline-dumbbell-fly",
    flyPose,
    (hand) => [{ glyph: "dumbbell", at: hand, scale: 0.9 }],
    [
      `M${Math.round(flyHands.x - 20)},${Math.round(flyHands.y + 8)}Q${Math.round(flyHands.x - 28)},${Math.round((flyHands.y + flyShoulder.y) / 2)} ${Math.round(flyShoulder.x - 14)},${Math.round(flyShoulder.y - 22)}`,
    ],
  ),
  inclineScene("incline-dumbbell-press", inclineLying, (hand) => [{ glyph: "dumbbell", at: hand }]),
  {
    id: id("incline-push-up"),
    view: "side",
    figure: { pose: inclinePushPose, origin: inclinePushOrigin },
    props: [
      {
        glyph: "bench",
        at: { x: inclinePush.hand.left.x + 24, y: inclinePush.hand.left.y + 2 },
        scale: pushBenchScale,
      },
    ],
    floor: true,
  },
  {
    id: id("knee-push-up"),
    view: "side",
    figure: { pose: kneePose, origin: kneeOrigin },
    props: [],
    floor: true,
  },
  {
    id: id("low-to-high-cable-fly"),
    view: "front",
    figure: { pose: cablePose, origin: cableOrigin, scale: cableScale },
    props: [
      { glyph: "cable", at: pulleyLeft },
      { glyph: "cable", at: pulleyRight },
    ],
    floor: true,
    accent: [cableLine(pulleyLeft, cable.hand.left), cableLine(pulleyRight, cable.hand.right)],
  },
  {
    id: id("machine-chest-press"),
    view: "side",
    figure: { pose: machinePose, origin: machineOrigin },
    props: [
      { glyph: "machineSeat", at: { x: machineOrigin.x, y: machineOrigin.y + 3 } },
      { glyph: "dumbbell", at: machine.hand.left, rotate: 90, scale: 0.6 },
    ],
    floor: true,
    accent: [inwardArrow(machine.hand.left.x + 8, machine.hand.left.y - 16, 1)],
  },
  {
    id: id("pec-deck"),
    view: "front",
    figure: { pose: pecPose, origin: pecOrigin },
    props: [
      { glyph: "box", at: { x: pecOrigin.x, y: pecOrigin.y + 2 }, scale: 0.8 },
      { glyph: "roller", at: pec.hand.left, scale: 0.6 },
      { glyph: "roller", at: pec.hand.right, scale: 0.6 },
    ],
    floor: true,
    accent: [
      inwardArrow(pec.hand.left.x, pec.hand.left.y - 16, -1),
      inwardArrow(pec.hand.right.x, pec.hand.right.y - 16, 1),
    ],
  },
  {
    id: id("push-up"),
    view: "side",
    figure: { pose: pushUpPose, origin: pushUpOrigin },
    props: [],
    floor: true,
  },
  {
    id: id("smith-machine-bench-press"),
    view: "side",
    figure: { pose: poses.benchPress, origin: smithOrigin },
    props: [
      { glyph: "bench", at: { x: 96, y: FLOOR_Y - benchHeight }, scale: 1.5 },
      { glyph: "rack", at: { x: smith.hand.left.x, y: FLOOR_Y } },
      { glyph: "plate", at: smith.hand.left },
    ],
    floor: true,
  },
  {
    id: id("svend-press"),
    view: "side",
    figure: { pose: svendPose, origin: svendOrigin },
    props: [{ glyph: "plate", at: svend.hand.left, scale: 0.9 }],
    floor: true,
  },
]
