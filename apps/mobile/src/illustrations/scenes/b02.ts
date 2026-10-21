/**
 * Batch b02 (catalog module legs-2): machine leg work, calves, single-leg and wall variants.
 * Origins and prop anchors come from the rig (`onFloor` / `jointsOf`), never from hand guesses,
 * except the machine seats, whose post height fixes the hip height.
 */
import { IllustrationId } from "@tanren/shared"
import type { Scene } from "../compose"
import { cableLine } from "../glyphs"
import { jointsOf, onFloor, type Point, poses, pt, withAngles } from "../rig"
import { FLOOR_Y } from "../style"

const id = IllustrationId.make

/** Motion cue: a straight arrow from `from` to `to` with a small head (one path `d`). */
const arrow = (from: Point, to: Point): string => {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const ux = (to.x - from.x) / length
  const uy = (to.y - from.y) / length
  const head = (sign: 1 | -1): Point => ({
    x: to.x - 6 * ux + sign * 4 * uy,
    y: to.y - 6 * uy - sign * 4 * ux,
  })
  return `M${pt(from)}L${pt(to)}M${pt(head(1))}L${pt(to)}L${pt(head(-1))}`
}

/** Machine seat: the post (44) reaches the floor when the seat sits at hip.y + 2. */
const seatedHipY = FLOOR_Y - 46
const seatAt = (hip: Point): Point => ({ x: hip.x + 8, y: hip.y + 2 })

// leg-extension: seated, shins level, ankle pad on the shins
const extensionPose = withAngles(poses.seated, {
  both: { upperArm: 10, forearm: 75, shin: 90 },
})
const extensionOrigin = { x: 84, y: seatedHipY }
const extension = jointsOf(extensionPose, "side", extensionOrigin)

// leg-curl (seated): thighs under a hold-down pad, shins curled back under the seat
const seatedCurlPose = withAngles(poses.seated, {
  both: { upperArm: 10, forearm: 75, shin: -12 },
})
const seatedCurlOrigin = { x: 100, y: seatedHipY }
const seatedCurl = jointsOf(seatedCurlPose, "side", seatedCurlOrigin)

// seated calf raise: knee pad on the thighs, feet flat
const seatedCalfPose = withAngles(poses.seated, {
  both: { upperArm: 10, forearm: 75, shin: 0 },
})
const seatedCalfOrigin = { x: 100, y: seatedHipY }
const seatedCalf = jointsOf(seatedCalfPose, "side", seatedCalfOrigin)

// leg press family: V shape, hips low, back reclined up-left, legs up-right to the platform
const pressPose = withAngles(poses.seated, {
  torso: -130,
  neck: -125,
  both: { upperArm: 100, forearm: 110, thigh: 125, shin: 85 },
})
const pressOrigin = { x: 104, y: 178 }
const press = jointsOf(pressPose, "side", pressOrigin)

const calfPressPose = withAngles(pressPose, { both: { thigh: 130, shin: 130 } })
const calfPress = jointsOf(calfPressPose, "side", pressOrigin)

const singlePressPose = withAngles(pressPose, {
  left: { thigh: 128, shin: 110 },
  right: { thigh: 150, shin: 20 },
})
const singlePress = jointsOf(singlePressPose, "side", pressOrigin)

const pressSeat: Point = { x: pressOrigin.x - 22, y: pressOrigin.y - 14 }
const platformAt = (foot: Point): Point => ({ x: foot.x + 4, y: foot.y - 4 })

// lying leg curl: prone on a bench, heels curled toward the glutes
const lyingPose = withAngles(poses.proneLying, {
  neck: 110,
  both: { upperArm: 60, forearm: 20, shin: 165 },
})
const lyingBenchScale = 1.9
const lyingOrigin = { x: 108, y: FLOOR_Y - 24 * lyingBenchScale - 4 }
const lying = jointsOf(lyingPose, "side", lyingOrigin)

// nordic hamstring curl: kneeling, one straight line from knees to head, hands ready to catch
const nordicPose = withAngles(poses.kneel, {
  torso: 140,
  neck: 140,
  both: { upperArm: 30, forearm: 20, thigh: -40, shin: -90 },
})
const nordicOrigin = onFloor(nordicPose, "side", 126)
const nordic = jointsOf(nordicPose, "side", nordicOrigin)

// pistol squat: left leg squatting, right leg level in front, arms out for balance
const pistolPose = withAngles(poses.squat, {
  torso: 145,
  neck: 150,
  both: { upperArm: 90, forearm: 90 },
  left: { thigh: 80, shin: -16 },
  right: { thigh: 90, shin: 82 },
})
const pistolOrigin = onFloor(pistolPose, "side", 96)

// sissy squat: leaning back in one line from knees to head, up on the toes
const sissyPose = withAngles(poses.stand, {
  torso: 212,
  neck: 212,
  both: { upperArm: 90, forearm: 90, thigh: 32, shin: -14 },
})
const sissyOrigin = onFloor(sissyPose, "side", 104)

// smith machine squat: squat bottom, bar (plate, end-on) on the back, a guide rail behind it
const smithPose = withAngles(poses.squat, { torso: 158, neck: 165, both: { thigh: 76, shin: -8 } })
const smithOrigin = onFloor(smithPose, "side", 108)
const smith = jointsOf(smithPose, "side", smithOrigin)
const smithPlate: Point = { x: smith.neckBase.x - 12, y: smith.neckBase.y + 8 }

// split squat: dumbbells at the sides, front thigh level
const splitOrigin = onFloor(poses.lunge, "side", 112)
const split = jointsOf(poses.lunge, "side", splitOrigin)

// standing calf raise: shoulder pad on a column, toes on a block
const blockScale = 0.45
const blockTop = FLOOR_Y - 36 * blockScale
const standCalfOrigin = onFloor(poses.stand, "side", 112, 1, blockTop)
const standCalf = jointsOf(poses.stand, "side", standCalfOrigin)
const standCalfPad: Point = { x: standCalf.neckBase.x + 2, y: standCalf.neckBase.y + 6 }
const standCalfColumn: Point = { x: standCalf.neckBase.x - 26, y: FLOOR_Y }

// tibialis raise: back to the wall, feet forward, toes pulled up
const tibialisPose = withAngles(poses.stand, {
  torso: 196,
  neck: 196,
  both: { thigh: 16, shin: 16 },
})
const tibialisOrigin = onFloor(tibialisPose, "side", 124)
const tibialis = jointsOf(tibialisPose, "side", tibialisOrigin)

// wall sit: thighs level, shins vertical, back flat on the wall
const wallPose = withAngles(poses.seated, { both: { upperArm: 6, forearm: 80 } })
const wallOrigin = onFloor(wallPose, "side", 110)

export const scenes: ReadonlyArray<Scene> = [
  {
    id: id("leg-extension"),
    view: "side",
    figure: { pose: extensionPose, origin: extensionOrigin },
    props: [
      { glyph: "machineSeat", at: seatAt(extensionOrigin) },
      { glyph: "roller", at: { x: extension.foot.left.x - 2, y: extension.foot.left.y - 11 } },
    ],
    floor: true,
    accent: [
      arrow(
        { x: extension.foot.left.x + 8, y: extension.foot.left.y + 22 },
        { x: extension.foot.left.x + 8, y: extension.foot.left.y + 4 },
      ),
    ],
  },
  {
    id: id("leg-press"),
    view: "side",
    figure: { pose: pressPose, origin: pressOrigin },
    props: [
      { glyph: "bench", at: pressSeat, rotate: 40 },
      { glyph: "bench", at: platformAt(press.foot.left), rotate: 220, scale: 0.8 },
    ],
    floor: true,
  },
  {
    id: id("leg-press-calf-raise"),
    view: "side",
    figure: { pose: calfPressPose, origin: pressOrigin },
    props: [
      { glyph: "bench", at: pressSeat, rotate: 40 },
      { glyph: "bench", at: platformAt(calfPress.foot.left), rotate: 220, scale: 0.8 },
    ],
    floor: true,
    accent: [
      arrow(
        { x: calfPress.foot.left.x - 26, y: calfPress.foot.left.y + 26 },
        { x: calfPress.foot.left.x - 12, y: calfPress.foot.left.y + 8 },
      ),
    ],
  },
  {
    id: id("lying-leg-curl"),
    view: "side",
    figure: { pose: lyingPose, origin: lyingOrigin },
    props: [
      {
        glyph: "bench",
        at: { x: lyingOrigin.x - 6, y: lyingOrigin.y + 4 },
        scale: lyingBenchScale,
      },
      { glyph: "roller", at: { x: lying.foot.left.x + 2, y: lying.foot.left.y + 12 } },
    ],
    floor: true,
    accent: [
      arrow(
        { x: lying.foot.left.x - 14, y: lying.foot.left.y + 22 },
        { x: lying.foot.left.x - 14, y: lying.foot.left.y + 2 },
      ),
    ],
  },
  {
    id: id("nordic-hamstring-curl"),
    view: "side",
    figure: { pose: nordicPose, origin: nordicOrigin },
    props: [
      { glyph: "mat", at: { x: nordic.knee.left.x - 22, y: FLOOR_Y + 2 }, scale: 1 },
      { glyph: "roller", at: { x: nordic.foot.left.x - 2, y: nordic.foot.left.y - 11 } },
    ],
    floor: true,
    accent: [
      arrow(
        { x: nordic.head.x + 26, y: nordic.head.y - 14 },
        { x: nordic.head.x + 40, y: nordic.head.y + 20 },
      ),
    ],
  },
  {
    id: id("pistol-squat"),
    view: "side",
    figure: { pose: pistolPose, origin: pistolOrigin },
    props: [],
    floor: true,
  },
  {
    id: id("seated-calf-raise"),
    view: "side",
    figure: { pose: seatedCalfPose, origin: seatedCalfOrigin },
    props: [
      { glyph: "machineSeat", at: seatAt(seatedCalfOrigin) },
      {
        glyph: "roller",
        at: { x: seatedCalf.knee.left.x - 2, y: seatedCalf.knee.left.y - 12 },
        scale: 1.2,
      },
    ],
    floor: true,
    accent: [
      arrow(
        { x: seatedCalf.foot.left.x - 14, y: seatedCalf.foot.left.y - 2 },
        { x: seatedCalf.foot.left.x - 14, y: seatedCalf.foot.left.y - 22 },
      ),
    ],
  },
  {
    id: id("seated-leg-curl"),
    view: "side",
    figure: { pose: seatedCurlPose, origin: seatedCurlOrigin },
    props: [
      { glyph: "machineSeat", at: seatAt(seatedCurlOrigin) },
      {
        glyph: "roller",
        at: { x: seatedCurl.knee.left.x - 8, y: seatedCurl.knee.left.y - 12 },
        scale: 1.1,
      },
      { glyph: "roller", at: { x: seatedCurl.foot.left.x - 11, y: seatedCurl.foot.left.y - 6 } },
    ],
    floor: true,
    accent: [
      arrow(
        { x: seatedCurl.foot.left.x + 14, y: seatedCurl.foot.left.y - 34 },
        { x: seatedCurl.foot.left.x + 14, y: seatedCurl.foot.left.y - 10 },
      ),
    ],
  },
  {
    id: id("single-leg-press"),
    view: "side",
    figure: { pose: singlePressPose, origin: pressOrigin },
    props: [
      { glyph: "bench", at: pressSeat, rotate: 40 },
      { glyph: "bench", at: platformAt(singlePress.foot.left), rotate: 220, scale: 0.8 },
    ],
    floor: true,
  },
  {
    id: id("sissy-squat"),
    view: "side",
    figure: { pose: sissyPose, origin: sissyOrigin },
    props: [],
    floor: true,
  },
  {
    id: id("smith-machine-squat"),
    view: "side",
    figure: { pose: smithPose, origin: smithOrigin },
    props: [
      { glyph: "rack", at: { x: smithPlate.x - 28, y: FLOOR_Y } },
      { glyph: "plate", at: smithPlate },
    ],
    floor: true,
  },
  {
    id: id("split-squat"),
    view: "side",
    figure: { pose: poses.lunge, origin: splitOrigin },
    props: [{ glyph: "dumbbell", at: split.hand.left }],
    floor: true,
  },
  {
    id: id("standing-calf-raise"),
    view: "side",
    figure: { pose: poses.stand, origin: standCalfOrigin },
    props: [
      { glyph: "rack", at: standCalfColumn },
      { glyph: "roller", at: standCalfPad },
      { glyph: "box", at: { x: standCalf.foot.left.x, y: blockTop }, scale: blockScale },
    ],
    floor: true,
    accent: [
      cableLine({ x: standCalfColumn.x, y: standCalfPad.y }, standCalfPad),
      arrow(
        { x: standCalf.foot.left.x - 16, y: blockTop - 2 },
        { x: standCalf.foot.left.x - 16, y: blockTop - 20 },
      ),
    ],
  },
  {
    id: id("tibialis-raise"),
    view: "side",
    figure: { pose: tibialisPose, origin: tibialisOrigin },
    props: [{ glyph: "rack", at: { x: tibialis.head.x - 18, y: FLOOR_Y } }],
    floor: true,
    accent: [
      arrow(
        { x: tibialis.foot.left.x + 14, y: tibialis.foot.left.y - 2 },
        { x: tibialis.foot.left.x + 14, y: tibialis.foot.left.y - 20 },
      ),
    ],
  },
  {
    id: id("wall-sit"),
    view: "side",
    figure: { pose: wallPose, origin: wallOrigin },
    props: [{ glyph: "rack", at: { x: wallOrigin.x - 16, y: FLOOR_Y } }],
    floor: true,
  },
]
