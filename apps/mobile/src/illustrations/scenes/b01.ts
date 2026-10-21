/**
 * Batch b01: catalog module `legs-1` (squats, lunges, jumps, calf and hamstring machines).
 * Coordinates come from the rig (`onFloor`, `jointsOf`), never by hand.
 */
import { IllustrationId } from "@tanren/shared"
import type { Scene } from "../compose"
import { jointsOf, onFloor, poses, withAngles } from "../rig"
import { FLOOR_Y } from "../style"

const id = IllustrationId.make

// Barbell front squat: bar (plate, end-on) on the front shoulders, elbows up and forward.
const frontSquatPose = withAngles(poses.squat, {
  torso: 160,
  neck: 170,
  both: { upperArm: 110, forearm: -70 },
})
const frontSquatOrigin = onFloor(frontSquatPose, "side", 92)
const frontSquat = jointsOf(frontSquatPose, "side", frontSquatOrigin)

// Bodyweight squat: arms straight forward as a counterweight.
const bodyweightSquatPose = withAngles(poses.squat, { both: { upperArm: 90, forearm: 90 } })
const bodyweightSquatOrigin = onFloor(bodyweightSquatPose, "side", 96)

// Box jump: landed in a crouch on top of a box, arms swung forward.
const boxScale = 1.3
const boxTop = FLOOR_Y - 36 * boxScale
const boxJumpPose = withAngles(poses.squat, {
  torso: 140,
  neck: 150,
  both: { upperArm: 70, forearm: 80 },
})
const boxJumpOrigin = onFloor(boxJumpPose, "side", 92, 1, boxTop)
const boxJump = jointsOf(boxJumpPose, "side", boxJumpOrigin)

// Broad jump: take-off crouch, arms swung back, an arrow forward.
const broadJumpPose = withAngles(poses.squat, {
  torso: 130,
  neck: 140,
  both: { upperArm: -70, forearm: -75, thigh: 68, shin: -26 },
})
const broadJumpOrigin = onFloor(broadJumpPose, "side", 84)
const broadJump = jointsOf(broadJumpPose, "side", broadJumpOrigin)

// Bulgarian split squat: rear foot on a bench, dumbbell hanging from each hand.
const bulgarianPose = withAngles(poses.stand, {
  torso: 178,
  neck: 180,
  left: { thigh: 70, shin: 0 },
  right: { thigh: -25, shin: -122 },
})
const bulgarianOrigin = onFloor(bulgarianPose, "side", 124)
const bulgarian = jointsOf(bulgarianPose, "side", bulgarianOrigin)
const bulgarianBenchTop = bulgarian.foot.right.y + 3
const bulgarianBenchScale = (FLOOR_Y - bulgarianBenchTop) / 36

// Curtsy lunge (front view): rear leg crosses behind the working leg, dumbbell at the chest.
const curtsyPose = withAngles(poses.stand, {
  both: { upperArm: 10, forearm: -120 },
  left: { thigh: 62, shin: -10 },
  right: { thigh: -40, shin: -40 },
})
const curtsyOrigin = onFloor(curtsyPose, "front", 120)
const curtsy = jointsOf(curtsyPose, "front", curtsyOrigin)

// Donkey calf raise: bent forward onto a support, load on the hips, heels up on a small block.
const donkeyBlockScale = 0.45
const donkeyLift = 36 * donkeyBlockScale
const donkeyPose = withAngles(poses.stand, {
  torso: 98,
  neck: 104,
  both: { upperArm: 20, forearm: 12, thigh: 4, shin: 0 },
})
const donkeyOrigin = onFloor(donkeyPose, "side", 82, 1, FLOOR_Y - donkeyLift)
const donkey = jointsOf(donkeyPose, "side", donkeyOrigin)

// Dumbbell lunge: split stance at the bottom, dumbbells hanging.
const lungeOrigin = onFloor(poses.lunge, "side", 112)
const lunge = jointsOf(poses.lunge, "side", lungeOrigin)

// Reverse lunge: stepped back onto the toes, arrow backward.
const reversePose = withAngles(poses.lunge, {
  left: { thigh: 72, shin: 6 },
  right: { thigh: -24, shin: -58 },
})
const reverseOrigin = onFloor(reversePose, "side", 124)
const reverse = jointsOf(reversePose, "side", reverseOrigin)

// Step-up: one foot on the box, the other leg trailing, dumbbells hanging.
const stepPose = withAngles(poses.stand, {
  torso: 174,
  neck: 178,
  left: { thigh: 82, shin: 0 },
  right: { thigh: -8, shin: -10 },
})
const stepOrigin = onFloor(stepPose, "side", 96)
const step = jointsOf(stepPose, "side", stepOrigin)
const stepBoxTop = step.foot.left.y + 2
const stepBoxScale = (FLOOR_Y - stepBoxTop) / 36

// Walking lunge: the lunge with a forward arrow.
const walkPose = withAngles(poses.lunge, { torso: 176 })
const walkOrigin = onFloor(walkPose, "side", 100)
const walk = jointsOf(walkPose, "side", walkOrigin)

// Glute-ham raise: knees on a pad, heels hooked behind a footplate, torso hinged forward.
const ghrPadScale = 0.9
const ghrPadTop = FLOOR_Y - 24 * ghrPadScale
const ghrPose = withAngles(poses.kneel, {
  torso: 128,
  neck: 135,
  both: { upperArm: 50, forearm: 100 },
})
const ghrOrigin = onFloor(ghrPose, "side", 112, 1, ghrPadTop - 2)
const ghr = jointsOf(ghrPose, "side", ghrOrigin)

// Goblet squat: one dumbbell held upright at the chest.
const gobletPose = withAngles(poses.squat, { both: { upperArm: 20, forearm: 150 } })
const gobletOrigin = onFloor(gobletPose, "side", 96)
const goblet = jointsOf(gobletPose, "side", gobletOrigin)

// Hack squat: back against an inclined pad, feet forward on the platform.
const hackPose = withAngles(poses.squat, {
  torso: 200,
  neck: 198,
  left: { thigh: 80, shin: -8 },
  right: { thigh: 80, shin: -8 },
  both: { upperArm: 10, forearm: 70 },
})
const hackOrigin = onFloor(hackPose, "side", 112)
const hack = jointsOf(hackPose, "side", hackOrigin)
const hackPadCentre = {
  x: (hack.hipCentre.x + hack.neckBase.x) / 2 - 16,
  y: (hack.hipCentre.y + hack.neckBase.y) / 2 + 6,
}

// Jump squat: airborne, arms up, knees tucked slightly, the mat marks the ground.
const jumpScale = 0.85
const jumpPose = withAngles(poses.stand, {
  both: { upperArm: 125, forearm: 135, thigh: 12, shin: -30 },
})
const jumpGround = onFloor(jumpPose, "side", 120, jumpScale)
const jumpOrigin = { x: jumpGround.x, y: jumpGround.y - 22 }

// Lateral lunge (front view): wide stance, working knee bent, dumbbell at the chest.
const lateralPose = withAngles(poses.stand, {
  both: { upperArm: 10, forearm: -120 },
  left: { thigh: 62, shin: -6 },
  right: { thigh: 42, shin: 42 },
})
const lateralOrigin = onFloor(lateralPose, "front", 110)
const lateral = jointsOf(lateralPose, "front", lateralOrigin)

const centre = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export const scenes: ReadonlyArray<Scene> = [
  {
    id: id("barbell-front-squat"),
    view: "side",
    figure: { pose: frontSquatPose, origin: frontSquatOrigin },
    props: [
      {
        glyph: "plate",
        at: { x: frontSquat.neckBase.x + 20, y: frontSquat.neckBase.y + 10 },
        scale: 0.7,
      },
    ],
    floor: true,
  },
  {
    id: id("bodyweight-squat"),
    view: "side",
    figure: { pose: bodyweightSquatPose, origin: bodyweightSquatOrigin },
    props: [],
    floor: true,
  },
  {
    id: id("box-jump"),
    view: "side",
    figure: { pose: boxJumpPose, origin: boxJumpOrigin },
    props: [{ glyph: "box", at: { x: boxJump.foot.left.x, y: boxTop }, scale: boxScale }],
    floor: true,
  },
  {
    id: id("broad-jump"),
    view: "side",
    figure: { pose: broadJumpPose, origin: broadJumpOrigin },
    props: [],
    floor: true,
    accent: [
      `M${Math.round(broadJump.foot.left.x + 28)},${Math.round(broadJump.neckBase.y + 6)}L${Math.round(broadJump.foot.left.x + 70)},${Math.round(broadJump.neckBase.y + 6)}M${Math.round(broadJump.foot.left.x + 62)},${Math.round(broadJump.neckBase.y - 2)}L${Math.round(broadJump.foot.left.x + 70)},${Math.round(broadJump.neckBase.y + 6)}L${Math.round(broadJump.foot.left.x + 62)},${Math.round(broadJump.neckBase.y + 14)}`,
    ],
  },
  {
    id: id("bulgarian-split-squat"),
    view: "side",
    figure: { pose: bulgarianPose, origin: bulgarianOrigin },
    props: [
      {
        glyph: "box",
        at: { x: bulgarian.foot.right.x - 8, y: bulgarianBenchTop },
        scale: bulgarianBenchScale,
      },
      { glyph: "dumbbell", at: bulgarian.hand.left, scale: 0.8 },
    ],
    floor: true,
  },
  {
    id: id("curtsy-lunge"),
    view: "front",
    figure: { pose: curtsyPose, origin: curtsyOrigin },
    props: [{ glyph: "dumbbell", at: centre(curtsy.hand.left, curtsy.hand.right), rotate: 90 }],
    floor: true,
  },
  {
    id: id("donkey-calf-raise"),
    view: "side",
    figure: { pose: donkeyPose, origin: donkeyOrigin },
    props: [
      {
        glyph: "box",
        at: { x: donkey.hand.left.x + 12, y: donkey.hand.left.y + 3 },
        scale: (FLOOR_Y - donkey.hand.left.y - 3) / 36,
      },
      {
        glyph: "plate",
        at: { x: donkey.hipCentre.x - 6, y: donkey.hipCentre.y - 14 },
        scale: 0.7,
      },
      {
        glyph: "box",
        at: { x: donkey.foot.left.x, y: FLOOR_Y - donkeyLift },
        scale: donkeyBlockScale,
      },
    ],
    floor: true,
  },
  {
    id: id("dumbbell-lunge"),
    view: "side",
    figure: { pose: poses.lunge, origin: lungeOrigin },
    props: [{ glyph: "dumbbell", at: lunge.hand.left, scale: 0.8 }],
    floor: true,
  },
  {
    id: id("dumbbell-reverse-lunge"),
    view: "side",
    figure: { pose: reversePose, origin: reverseOrigin },
    props: [{ glyph: "dumbbell", at: reverse.hand.left, scale: 0.8 }],
    floor: true,
    accent: [
      `M${Math.round(reverse.foot.right.x - 4)},${Math.round(reverse.hipCentre.y - 8)}L${Math.round(reverse.foot.right.x - 40)},${Math.round(reverse.hipCentre.y - 8)}M${Math.round(reverse.foot.right.x - 32)},${Math.round(reverse.hipCentre.y - 16)}L${Math.round(reverse.foot.right.x - 40)},${Math.round(reverse.hipCentre.y - 8)}L${Math.round(reverse.foot.right.x - 32)},${Math.round(reverse.hipCentre.y)}`,
    ],
  },
  {
    id: id("dumbbell-step-up"),
    view: "side",
    figure: { pose: stepPose, origin: stepOrigin },
    props: [
      { glyph: "box", at: { x: step.foot.left.x - 4, y: stepBoxTop }, scale: stepBoxScale },
      { glyph: "dumbbell", at: step.hand.left, scale: 0.8 },
    ],
    floor: true,
  },
  {
    id: id("dumbbell-walking-lunge"),
    view: "side",
    figure: { pose: walkPose, origin: walkOrigin },
    props: [{ glyph: "dumbbell", at: walk.hand.left, scale: 0.8 }],
    floor: true,
    accent: [
      `M${Math.round(walk.foot.left.x + 14)},${Math.round(walk.hipCentre.y - 8)}L${Math.round(walk.foot.left.x + 50)},${Math.round(walk.hipCentre.y - 8)}M${Math.round(walk.foot.left.x + 42)},${Math.round(walk.hipCentre.y - 16)}L${Math.round(walk.foot.left.x + 50)},${Math.round(walk.hipCentre.y - 8)}L${Math.round(walk.foot.left.x + 42)},${Math.round(walk.hipCentre.y)}`,
    ],
  },
  {
    id: id("glute-ham-raise"),
    view: "side",
    figure: { pose: ghrPose, origin: ghrOrigin },
    props: [
      {
        glyph: "bench",
        at: { x: ghr.knee.left.x - 6, y: ghrPadTop + 4 },
        scale: ghrPadScale,
      },
      { glyph: "rack", at: { x: ghr.foot.left.x - 8, y: FLOOR_Y }, scale: 0.4 },
    ],
    floor: true,
  },
  {
    id: id("goblet-squat"),
    view: "side",
    figure: { pose: gobletPose, origin: gobletOrigin },
    props: [{ glyph: "dumbbell", at: goblet.hand.left, rotate: 90, scale: 0.9 }],
    floor: true,
  },
  {
    id: id("hack-squat"),
    view: "side",
    figure: { pose: hackPose, origin: hackOrigin },
    props: [{ glyph: "mat", at: hackPadCentre, rotate: 70, scale: 0.85 }],
    floor: true,
  },
  {
    id: id("jump-squat"),
    view: "side",
    figure: { pose: jumpPose, origin: jumpOrigin, scale: jumpScale },
    props: [{ glyph: "mat", at: { x: 120, y: FLOOR_Y - 2 }, scale: 0.8 }],
    floor: true,
  },
  {
    id: id("lateral-lunge"),
    view: "front",
    figure: { pose: lateralPose, origin: lateralOrigin },
    props: [{ glyph: "dumbbell", at: centre(lateral.hand.left, lateral.hand.right), rotate: 90 }],
    floor: true,
  },
]
