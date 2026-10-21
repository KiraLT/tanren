/**
 * Batch b05 (catalog module back-1): vertical and horizontal pulls. Origins and prop anchors come
 * from the rig, never from hand-guessed coordinates.
 */
import { IllustrationId } from "@tanren/shared"
import type { Scene } from "../compose"
import { cableLine } from "../glyphs"
import { jointsOf, onFloor, type Point, poses, withAngles } from "../rig"
import { FLOOR_Y } from "../style"

const id = IllustrationId.make

const at = (from: Point, dx: number, dy: number): Point => ({ x: from.x + dx, y: from.y + dy })

// assisted-pull-up: hanging mid-pull, knees on the assist pad.
const assistedScale = 0.8
const assistedPose = withAngles(poses.hang, {
  both: { upperArm: 125, forearm: 235, thigh: 0, shin: -90 },
})
const assistedOrigin = { x: 110, y: 120 }
const assisted = jointsOf(assistedPose, "side", assistedOrigin, assistedScale)

// barbell-row: hinged, bar rowed to the hip.
const barbellRowPose = withAngles(poses.hinge, {
  torso: 108,
  neck: 118,
  both: { upperArm: -110, forearm: 10, thigh: 18, shin: -12 },
})
const barbellRowOrigin = onFloor(barbellRowPose, "side", 100)
const barbellRow = jointsOf(barbellRowPose, "side", barbellRowOrigin)

// chest-supported-dumbbell-row: chest on an incline pad, legs trailing behind.
const supportedPose = withAngles(poses.hinge, {
  torso: 140,
  neck: 150,
  both: { upperArm: -120, forearm: -10, thigh: -75, shin: -60 },
})
const supportedOrigin = onFloor(supportedPose, "side", 100)
const supported = jointsOf(supportedPose, "side", supportedOrigin)

// chin-up: side view at the top, chin over the bar.
const chinPose = withAngles(poses.hang, { both: { upperArm: 45, forearm: 170 } })
const chinOrigin = { x: 100, y: 122 }
const chin = jointsOf(chinPose, "side", chinOrigin)

// Seated machines: seat under the hip, feet on the floor.
const seatedOrigin = { x: 100, y: FLOOR_Y - 46 }
const seatAt = { x: seatedOrigin.x + 14, y: FLOOR_Y - 44 }

// close-grip-lat-pulldown: handle pulled to the upper chest, hands ahead of the elbows.
const closePose = withAngles(poses.seated, {
  torso: 165,
  neck: 170,
  both: { upperArm: -15, forearm: 120 },
})
const close = jointsOf(closePose, "side", seatedOrigin)

// lat-pulldown: wide bar, forearms vertical.
const pulldownPose = withAngles(poses.seated, {
  torso: 165,
  neck: 170,
  both: { upperArm: 120, forearm: 190 },
})
const pulldown = jointsOf(pulldownPose, "side", seatedOrigin)

// dumbbell-pullover: on the bench, arms back over the head.
const benchHeight = 36
const pulloverPose = withAngles(poses.benchPress, { both: { upperArm: -145, forearm: -145 } })
const pulloverOrigin = { x: 150, y: FLOOR_Y - benchHeight - 4 }
const pullover = jointsOf(pulloverPose, "side", pulloverOrigin)

// face-pull: standing, rope in front of the face, cable station ahead.
const facePose = withAngles(poses.stand, {
  torso: 175,
  neck: 175,
  both: { upperArm: 100, forearm: 160 },
})
const faceOrigin = onFloor(facePose, "side", 80)
const face = jointsOf(facePose, "side", faceOrigin)
const facePulley = at(face.hand.left, 64, 0)

// inverted-row: body straight under a bar, feet on the floor, chest pulled up to it.
const invertedPose = withAngles(poses.supineLying, {
  torso: -115,
  neck: -110,
  both: { upperArm: 150, forearm: 195, thigh: 65, shin: 65 },
})
const invertedOrigin = onFloor(invertedPose, "side", 104)
const inverted = jointsOf(invertedPose, "side", invertedOrigin)

// machine-high-row: chest pad ahead, handle on a high line.
const highPose = withAngles(poses.seated, {
  torso: 180,
  neck: 180,
  both: { upperArm: -45, forearm: 100 },
})
const high = jointsOf(highPose, "side", seatedOrigin)
const highPulley = at(high.hand.left, 52, -64)

// machine-row: chest pad ahead, handle on a low line at chest height.
const rowPose = withAngles(poses.seated, {
  torso: 180,
  neck: 180,
  both: { upperArm: -45, forearm: 100 },
})
const row = jointsOf(rowPose, "side", seatedOrigin)
const rowPulley = at(row.hand.left, 70, 0)

// meadows-row: staggered hinge, one-arm row on a landmine bar anchored on the floor.
const meadowsPose = withAngles(poses.hinge, {
  torso: 110,
  neck: 120,
  left: { upperArm: -100, forearm: 10, thigh: 36, shin: -8 },
  right: { upperArm: 0, forearm: 0, thigh: -22, shin: -6 },
})
const meadowsOrigin = onFloor(meadowsPose, "side", 96)
const meadows = jointsOf(meadowsPose, "side", meadowsOrigin)
const meadowsAnchor = { x: meadows.hand.left.x + 70, y: FLOOR_Y - 4 }

export const scenes: ReadonlyArray<Scene> = [
  {
    id: id("assisted-pull-up"),
    view: "side",
    figure: { pose: assistedPose, origin: assistedOrigin, scale: assistedScale },
    props: [
      { glyph: "pullUpBar", at: assisted.hand.left },
      { glyph: "box", at: at(assisted.knee.left, 0, 4), scale: assistedScale },
    ],
    floor: false,
  },
  {
    id: id("barbell-row"),
    view: "side",
    figure: { pose: barbellRowPose, origin: barbellRowOrigin },
    props: [{ glyph: "plate", at: barbellRow.hand.left }],
    floor: true,
  },
  {
    id: id("chest-supported-dumbbell-row"),
    view: "side",
    figure: { pose: supportedPose, origin: supportedOrigin },
    props: [
      { glyph: "bench", at: at(supportedOrigin, 24, -16), rotate: -50, scale: 0.8 },
      { glyph: "dumbbell", at: supported.hand.left },
    ],
    floor: true,
  },
  {
    id: id("chin-up"),
    view: "side",
    figure: { pose: chinPose, origin: chinOrigin },
    props: [{ glyph: "pullUpBar", at: chin.hand.left }],
    floor: false,
  },
  {
    id: id("close-grip-lat-pulldown"),
    view: "side",
    figure: { pose: closePose, origin: seatedOrigin },
    props: [
      { glyph: "machineSeat", at: seatAt },
      { glyph: "cable", at: { x: close.hand.left.x + 8, y: 30 } },
      { glyph: "plate", at: close.hand.left, scale: 0.5 },
    ],
    floor: true,
    accent: [cableLine({ x: close.hand.left.x + 8, y: 35 }, close.hand.left)],
  },
  {
    id: id("dumbbell-pullover"),
    view: "side",
    figure: { pose: pulloverPose, origin: pulloverOrigin },
    props: [
      { glyph: "bench", at: { x: 126, y: FLOOR_Y - benchHeight }, scale: 1.5 },
      { glyph: "dumbbell", at: pullover.hand.left, rotate: 90 },
    ],
    floor: true,
  },
  {
    id: id("face-pull"),
    view: "side",
    figure: { pose: facePose, origin: faceOrigin },
    props: [
      { glyph: "rack", at: { x: facePulley.x + 8, y: FLOOR_Y }, scale: 1.25 },
      { glyph: "cable", at: facePulley },
    ],
    floor: true,
    accent: [cableLine(at(facePulley, -5, 0), face.hand.left)],
  },
  {
    id: id("inverted-row"),
    view: "side",
    figure: { pose: invertedPose, origin: invertedOrigin },
    props: [
      { glyph: "rack", at: { x: inverted.hand.left.x + 14, y: FLOOR_Y }, scale: 0.9 },
      { glyph: "plate", at: inverted.hand.left, scale: 0.5 },
    ],
    floor: true,
  },
  {
    id: id("lat-pulldown"),
    view: "side",
    figure: { pose: pulldownPose, origin: seatedOrigin },
    props: [
      { glyph: "machineSeat", at: seatAt },
      { glyph: "cable", at: { x: pulldown.hand.left.x + 4, y: 22 } },
      { glyph: "plate", at: pulldown.hand.left, scale: 0.7 },
    ],
    floor: true,
    accent: [cableLine({ x: pulldown.hand.left.x + 4, y: 27 }, pulldown.hand.left)],
  },
  {
    id: id("machine-high-row"),
    view: "side",
    figure: { pose: highPose, origin: seatedOrigin },
    props: [
      { glyph: "machineSeat", at: seatAt },
      { glyph: "bench", at: at(high.neckBase, 18, 14), rotate: -90, scale: 0.6 },
      { glyph: "cable", at: highPulley },
    ],
    floor: true,
    accent: [cableLine(at(highPulley, 0, 5), high.hand.left)],
  },
  {
    id: id("machine-row"),
    view: "side",
    figure: { pose: rowPose, origin: seatedOrigin },
    props: [
      { glyph: "machineSeat", at: seatAt },
      { glyph: "bench", at: at(row.neckBase, 18, 14), rotate: -90, scale: 0.6 },
      { glyph: "cable", at: rowPulley },
    ],
    floor: true,
    accent: [cableLine(at(rowPulley, -5, 0), row.hand.left)],
  },
  {
    id: id("meadows-row"),
    view: "side",
    figure: { pose: meadowsPose, origin: meadowsOrigin },
    props: [{ glyph: "plate", at: meadows.hand.left, scale: 0.8 }],
    floor: true,
    accent: [cableLine(meadowsAnchor, meadows.hand.left)],
  },
]
