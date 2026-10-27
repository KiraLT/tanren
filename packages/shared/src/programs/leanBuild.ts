import { Array as Arr, Option, Schema } from "effect"
import { Program } from "./Program"

/**
 * 12-Week Lean Build (programs-mcp.md §7, ADR-0026): 84 days, a push / pull / cardio / legs /
 * upper / cardio / recovery week repeated twelve times in three 4-week blocks. Loads go up from
 * block to block while reps go down; rest grows and cardio gets longer. Generated from templates
 * like Core 30; every id exists in the catalog (`leanBuild.test.ts` asserts it).
 */

/** One block's numbers (the design's table). */
interface Block {
  readonly mainReps: number
  readonly accessoryReps: number
  readonly mainRestSeconds: number
  readonly accessoryRestSeconds: number
  readonly cardioSeconds: number
}

const BLOCK_1: Block = {
  mainReps: 12,
  accessoryReps: 15,
  mainRestSeconds: 60,
  accessoryRestSeconds: 45,
  cardioSeconds: 900,
}
const BLOCK_2: Block = {
  mainReps: 10,
  accessoryReps: 12,
  mainRestSeconds: 75,
  accessoryRestSeconds: 45,
  cardioSeconds: 1200,
}
const BLOCK_3: Block = {
  mainReps: 8,
  accessoryReps: 12,
  mainRestSeconds: 90,
  accessoryRestSeconds: 60,
  cardioSeconds: 1500,
}

const blockOfWeek = (week: number): Block => (week <= 4 ? BLOCK_1 : week <= 8 ? BLOCK_2 : BLOCK_3)

const STRENGTH_ROUNDS = 3
const STRENGTH_ROUND_REST_SECONDS = 90

interface Move {
  readonly catalogId: string
  readonly role: "main" | "accessory"
}
const main = (catalogId: string): Move => ({ catalogId, role: "main" })
const accessory = (catalogId: string): Move => ({ catalogId, role: "accessory" })

const PUSH: ReadonlyArray<Move> = [
  main("barbell-bench-press"),
  main("incline-dumbbell-press"),
  main("machine-shoulder-press"),
  accessory("cable-fly"),
  accessory("dumbbell-lateral-raise"),
  accessory("triceps-pushdown"),
  accessory("cable-overhead-triceps-extension"),
]

const PULL: ReadonlyArray<Move> = [
  main("lat-pulldown"),
  main("seated-cable-row"),
  main("one-arm-dumbbell-row"),
  accessory("face-pull"),
  accessory("dumbbell-rear-delt-fly"),
  accessory("ez-bar-curl"),
  accessory("hammer-curl"),
]

const LEGS: ReadonlyArray<Move> = [
  main("barbell-back-squat"),
  main("romanian-deadlift"),
  main("leg-press"),
  accessory("lying-leg-curl"),
  accessory("leg-extension"),
  main("hip-thrust"),
  accessory("standing-calf-raise"),
]

const UPPER: ReadonlyArray<Move> = [
  main("machine-chest-press"),
  main("chest-supported-row-machine"),
  main("dumbbell-shoulder-press"),
  main("close-grip-lat-pulldown"),
  accessory("dumbbell-curl"),
  accessory("rope-triceps-pushdown"),
]

const repsItem = (catalogId: string, reps: number, restSeconds: number) => ({
  kind: "reps",
  catalogId,
  reps,
  restSeconds,
})

const timedItem = (catalogId: string, seconds: number, restSeconds: number) => ({
  kind: "timed",
  catalogId,
  seconds,
  restSeconds,
})

/** The last item of a round carries the round rest, as in Core 30. */
const strengthDay = (moves: ReadonlyArray<Move>) => (block: Block) => ({
  rounds: STRENGTH_ROUNDS,
  items: Arr.map(moves, (move, index) =>
    repsItem(
      move.catalogId,
      move.role === "main" ? block.mainReps : block.accessoryReps,
      index === moves.length - 1
        ? STRENGTH_ROUND_REST_SECONDS
        : move.role === "main"
          ? block.mainRestSeconds
          : block.accessoryRestSeconds,
    ),
  ),
  restBetweenRoundsSeconds: STRENGTH_ROUND_REST_SECONDS,
})

const cardioA = (block: Block) => ({
  rounds: 1,
  items: [
    timedItem("incline-treadmill-walk", 300, 0),
    timedItem("stationary-bike", block.cardioSeconds, 60),
    timedItem("plank", 45, 15),
    timedItem("side-plank", 30, 0),
  ],
  restBetweenRoundsSeconds: 0,
})

const cardioB = (block: Block) => ({
  rounds: 1,
  items: [
    timedItem("elliptical-trainer", 300, 0),
    timedItem("treadmill-interval-run", block.cardioSeconds, 60),
    repsItem("dead-bug", 12, 15),
    timedItem("hollow-hold", 30, 0),
  ],
  restBetweenRoundsSeconds: 0,
})

const recovery = () => ({
  rounds: 1,
  items: [
    repsItem("bird-dog", 10, 15),
    repsItem("glute-bridge", 12, 15),
    timedItem("superman-hold", 30, 15),
    repsItem("dead-bug", 10, 0),
  ],
  restBetweenRoundsSeconds: 0,
})

interface Slot {
  readonly name: string
  readonly build: (block: Block) => {
    readonly rounds: number
    readonly items: ReadonlyArray<unknown>
    readonly restBetweenRoundsSeconds: number
  }
}

/** Week slot = `(day - 1) % 7`. */
const SLOTS: ReadonlyArray<Slot> = [
  { name: "Push", build: strengthDay(PUSH) },
  { name: "Pull", build: strengthDay(PULL) },
  { name: "Cardio A", build: cardioA },
  { name: "Legs", build: strengthDay(LEGS) },
  { name: "Upper", build: strengthDay(UPPER) },
  { name: "Cardio B", build: cardioB },
  { name: "Recovery", build: recovery },
]

const RECOVERY_SLOT: Slot = { name: "Recovery", build: recovery }

const dayWire = (dayNumber: number) => {
  const week = Math.floor((dayNumber - 1) / 7) + 1
  const slot = Option.getOrElse(Arr.get(SLOTS, (dayNumber - 1) % 7), () => RECOVERY_SLOT)
  return {
    dayNumber,
    title: `Day ${dayNumber} · Week ${week} · ${slot.name}`,
    ...slot.build(blockOfWeek(week)),
  }
}

/**
 * Decoded once at module load so ids are branded. The input is static data checked by
 * `leanBuild.test.ts`; `decodeUnknownSync` throwing here would be a build-time data bug.
 */
export const LEAN_BUILD_12: Program = Schema.decodeUnknownSync(Program)({
  programId: "lean-build-12",
  name: "12-Week Lean Build",
  tagline: "Push, pull, legs and cardio — six days a week for twelve weeks.",
  description:
    "Twelve weeks of machine, cable and free-weight training: push, pull, cardio, legs, upper body and a second cardio day, then a short recovery day to close each week. Loads go up with every four-week block while reps come down, rests get longer and the cardio sessions stretch from fifteen to twenty-five minutes.",
  days: Arr.makeBy(84, (index) => dayWire(index + 1)),
})
