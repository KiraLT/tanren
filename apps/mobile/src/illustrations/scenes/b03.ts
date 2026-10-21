/**
 * Batch b03 (catalog module chest-1): push-up variants, dips, bench and floor presses, flyes.
 * Origins and prop anchors come from the rig (`onFloor`, `jointsOf`), never from hand-guessed
 * coordinates.
 */
import { IllustrationId } from "@tanren/shared"
import type { Scene } from "../compose"
import { cableLine } from "../glyphs"
import { jointsOf, onFloor, type Point, poses, withAngles } from "../rig"
import { FLOOR_Y } from "../style"

const id = IllustrationId.make

/** Push-up family: head right, toes on the floor. Bottom: elbows back, hands under the shoulders. */
const bentArm = { upperArm: -55, forearm: 60 }

const archerPose = withAngles(poses.plank, {
  torso: 105,
  neck: 115,
  both: { thigh: -75, shin: -75 },
  left: { upperArm: 57, forearm: 57 },
  right: bentArm,
})
/** The whole push-up family is drawn at this scale so the long body fits the frame. */
const pushScale = 0.8
const archerOrigin = onFloor(archerPose, "side", 112, pushScale)

const clapPose = withAngles(poses.plank, {
  torso: 118,
  neck: 126,
  both: { upperArm: 30, forearm: 150, thigh: -62, shin: -62 },
})
const clapOrigin = onFloor(clapPose, "side", 100, pushScale)
const clap = jointsOf(clapPose, "side", clapOrigin, pushScale)
/** Three spark strokes above the clapping hands. */
const sparks = (h: Point) =>
  `M${h.x - 10},${h.y - 12}L${h.x - 16},${h.y - 20}M${h.x + 4},${h.y - 14}L${h.x + 4},${h.y - 26}M${h.x + 16},${h.y - 10}L${h.x + 24},${h.y - 17}`

const diamondPose = withAngles(poses.plank, {
  torso: 105,
  neck: 115,
  both: { ...bentArm, thigh: -75, shin: -75 },
})
const diamondOrigin = onFloor(diamondPose, "side", 108, pushScale)
const diamond = jointsOf(diamondPose, "side", diamondOrigin, pushScale)
/** A flat diamond (the hands touching) lying on the floor beside the hands. */
const diamondShape = (c: Point) =>
  `M${c.x - 10},${c.y}L${c.x},${c.y - 6}L${c.x + 10},${c.y}L${c.x},${c.y + 6}Z`

/** Decline push-up: feet on a bench, body level, hands under the chest. */
const declinePushPose = withAngles(poses.plank, {
  torso: 86,
  neck: 90,
  both: { ...bentArm, thigh: -94, shin: -94 },
})
const declinePushOrigin = onFloor(declinePushPose, "side", 112, pushScale)
const declinePush = jointsOf(declinePushPose, "side", declinePushOrigin, pushScale)
const declinePushBenchScale = 1.5

/** Dip: arms locked out between two bars, torso leaning forward, knees bent behind. */
const dipPose = withAngles(poses.stand, {
  torso: 160,
  neck: 165,
  both: { upperArm: 0, forearm: 0, thigh: -20, shin: -60 },
})
const dipOrigin = { x: 112, y: 112 }
const dip = jointsOf(dipPose, "side", dipOrigin)
const dipPostScale = (FLOOR_Y - dip.hand.left.y) / 150
/** The post stands just in front of the hand; a short bar joins them. */
const dipPostX = dip.hand.left.x + 18
const dipBar = cableLine(
  { x: dip.hand.left.x - 6, y: dip.hand.left.y },
  { x: dipPostX, y: dip.hand.left.y },
)

/** Flat bench press family (side view, head left). */
const benchHeight = 36
const benchOrigin = { x: 120, y: FLOOR_Y - benchHeight - 4 }
const bench = jointsOf(poses.benchPress, "side", benchOrigin)
const flat = { glyph: "bench", at: { x: 96, y: FLOOR_Y - benchHeight }, scale: 1.5 } as const

/** Decline bench: the pad slopes down toward the head (left). */
const declineDeg = 14
const declineBenchPose = withAngles(poses.benchPress, {
  torso: -(90 - declineDeg),
  neck: -(90 - declineDeg),
  both: { upperArm: 180, forearm: 180, thigh: 100, shin: 5 },
})
const declineBenchCentre = { x: 112, y: 161 }
const declineBenchOrigin = {
  x: 128,
  y: Math.round(
    declineBenchCentre.y -
      (128 - declineBenchCentre.x) * Math.tan((declineDeg * Math.PI) / 180) -
      8,
  ),
}
const declineBench = jointsOf(declineBenchPose, "side", declineBenchOrigin)
/** The raised end of the rotated bench stops short of the floor: one accent stroke extends its leg. */
const declineLegBottom = {
  x:
    declineBenchCentre.x +
    48 * Math.cos((declineDeg * Math.PI) / 180) +
    36 * Math.sin((declineDeg * Math.PI) / 180),
  y:
    declineBenchCentre.y -
    48 * Math.sin((declineDeg * Math.PI) / 180) +
    36 * Math.cos((declineDeg * Math.PI) / 180),
}
const declineLeg = cableLine(declineLegBottom, {
  x: declineLegBottom.x + (FLOOR_Y - declineLegBottom.y) * Math.tan((declineDeg * Math.PI) / 180),
  y: FLOOR_Y,
})
const declineBenchProp = {
  glyph: "bench",
  at: declineBenchCentre,
  rotate: -declineDeg,
  scale: 1.5,
} as const

/** Floor press: on a mat, knees bent, arms locked out. */
const floorPose = withAngles(poses.benchPress, { both: { thigh: 135, shin: 12 } })
const floorOrigin = onFloor(floorPose, "side", 112, 1, FLOOR_Y - 4)
const floor = jointsOf(floorPose, "side", floorOrigin)

/** Fly: slightly bent elbows, wide arc. */
const flyPose = withAngles(poses.benchPress, { both: { upperArm: 168, forearm: 186 } })
const fly = jointsOf(flyPose, "side", benchOrigin)
/** Arc the hands sweep through (out and down to the sides). */
const flyArc = (h: Point) =>
  `M${h.x + 16},${h.y - 4}Q${h.x + 38},${h.y + 16} ${h.x + 28},${h.y + 44}M${h.x + 28},${h.y + 44}L${h.x + 21},${h.y + 36}M${h.x + 28},${h.y + 44}L${h.x + 34},${h.y + 35}`

/** Cable flyes (front view). */
const cableScale = 0.85
const cableFlyPose = withAngles(poses.stand, { both: { upperArm: 80, forearm: 86 } })
const cableFlyOrigin = onFloor(cableFlyPose, "front", 120, cableScale)
const cableFly = jointsOf(cableFlyPose, "front", cableFlyOrigin, cableScale)
const highLowPose = withAngles(poses.stand, { both: { upperArm: 22, forearm: 8 } })
const highLowOrigin = onFloor(highLowPose, "front", 120, cableScale)
const highLow = jointsOf(highLowPose, "front", highLowOrigin, cableScale)
const pulleyLeft = { x: 28, y: 44 }
const pulleyRight = { x: 212, y: 44 }
// Image-left hand belongs to the figure's right side in front view.
const flyPulleyLeft = { x: 26, y: cableFly.hand.right.y - 40 }
const flyPulleyRight = { x: 214, y: cableFly.hand.left.y - 40 }

export const scenes: ReadonlyArray<Scene> = [
  {
    id: id("archer-push-up"),
    view: "side",
    figure: { pose: archerPose, origin: archerOrigin, scale: pushScale },
    props: [],
    floor: true,
  },
  {
    id: id("cable-fly"),
    view: "front",
    figure: { pose: cableFlyPose, origin: cableFlyOrigin, scale: cableScale },
    props: [
      { glyph: "cable", at: flyPulleyLeft },
      { glyph: "cable", at: flyPulleyRight },
    ],
    floor: true,
    accent: [
      cableLine(flyPulleyLeft, cableFly.hand.right),
      cableLine(flyPulleyRight, cableFly.hand.left),
    ],
  },
  {
    id: id("chest-dip"),
    view: "side",
    figure: { pose: dipPose, origin: dipOrigin },
    props: [{ glyph: "rack", at: { x: dipPostX, y: FLOOR_Y }, scale: dipPostScale }],
    floor: false,
    accent: [dipBar],
  },
  {
    id: id("clap-push-up"),
    view: "side",
    figure: { pose: clapPose, origin: clapOrigin, scale: pushScale },
    props: [],
    floor: true,
    accent: [sparks(clap.hand.left)],
  },
  {
    id: id("decline-barbell-bench-press"),
    view: "side",
    figure: { pose: declineBenchPose, origin: declineBenchOrigin },
    props: [declineBenchProp, { glyph: "plate", at: declineBench.hand.left }],
    floor: true,
    accent: [declineLeg],
  },
  {
    id: id("decline-dumbbell-press"),
    view: "side",
    figure: { pose: declineBenchPose, origin: declineBenchOrigin },
    props: [declineBenchProp, { glyph: "dumbbell", at: declineBench.hand.left }],
    floor: true,
    accent: [declineLeg],
  },
  {
    id: id("decline-push-up"),
    view: "side",
    figure: { pose: declinePushPose, origin: declinePushOrigin, scale: pushScale },
    props: [
      {
        glyph: "bench",
        at: { x: declinePush.foot.left.x + 36, y: FLOOR_Y - 24 * declinePushBenchScale },
        scale: declinePushBenchScale,
      },
    ],
    floor: true,
  },
  {
    id: id("diamond-push-up"),
    view: "side",
    figure: { pose: diamondPose, origin: diamondOrigin, scale: pushScale },
    props: [],
    floor: true,
    accent: [diamondShape({ x: diamond.hand.left.x + 28, y: FLOOR_Y - 7 })],
  },
  {
    id: id("dumbbell-bench-press"),
    view: "side",
    figure: { pose: poses.benchPress, origin: benchOrigin },
    props: [flat, { glyph: "dumbbell", at: bench.hand.left }],
    floor: true,
  },
  {
    id: id("dumbbell-floor-press"),
    view: "side",
    figure: { pose: floorPose, origin: floorOrigin },
    props: [
      { glyph: "mat", at: { x: floorOrigin.x - 14, y: FLOOR_Y - 2 }, scale: 1.1 },
      { glyph: "dumbbell", at: floor.hand.left },
    ],
    floor: true,
  },
  {
    id: id("dumbbell-fly"),
    view: "side",
    figure: { pose: flyPose, origin: benchOrigin },
    props: [flat, { glyph: "dumbbell", at: fly.hand.left }],
    floor: true,
    accent: [flyArc(fly.hand.left)],
  },
  {
    id: id("high-to-low-cable-fly"),
    view: "front",
    figure: { pose: highLowPose, origin: highLowOrigin, scale: cableScale },
    props: [
      { glyph: "cable", at: pulleyLeft },
      { glyph: "cable", at: pulleyRight },
    ],
    floor: true,
    accent: [cableLine(pulleyLeft, highLow.hand.right), cableLine(pulleyRight, highLow.hand.left)],
  },
]
