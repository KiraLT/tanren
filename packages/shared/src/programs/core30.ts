import { Array as Arr, Option, Schema } from "effect"
import { Program } from "./Program"

/**
 * Core 30 (v2-programs.md §3): 30 days of timed core work. Training days run 7 items × 3 rounds;
 * days 7/14/21/28 are short recovery days (4 items × 1 round). Three templates cycle by day number
 * so consecutive days differ. Every id comes from the frozen `CORE30_CATALOG_IDS`.
 */

const TEMPLATE_A = [
  "dead-bug",
  "crunch",
  "reverse-crunch",
  "lying-leg-raise",
  "v-up",
  "hollow-hold",
  "plank",
] as const

const TEMPLATE_B = [
  "bicycle-crunch",
  "russian-twist",
  "side-plank",
  "heel-touch",
  "plank-hip-dip",
  "mountain-climber",
  "plank-shoulder-tap",
] as const

const TEMPLATE_C = [
  "superman-hold",
  "glute-bridge",
  "bird-dog",
  "flutter-kick",
  "scissor-kick",
  "leg-raise-hold",
  "bear-crawl-hold",
] as const

const TEMPLATES: ReadonlyArray<ReadonlyArray<string>> = [TEMPLATE_A, TEMPLATE_B, TEMPLATE_C]

const RECOVERY_ITEMS: ReadonlyArray<string> = [
  "bird-dog",
  "dead-bug",
  "glute-bridge",
  "superman-hold",
]

/** Work goes up and rest goes down; every phase stays inside 12–18 min (`dayDurationSeconds`). */
interface Phase {
  readonly title: string
  readonly from: number
  readonly to: number
  readonly workSeconds: number
  readonly restSeconds: number
  readonly roundRestSeconds: number
}

const PHASES: ReadonlyArray<Phase> = [
  { title: "Foundation", from: 1, to: 6, workSeconds: 25, restSeconds: 15, roundRestSeconds: 60 },
  { title: "Build", from: 8, to: 13, workSeconds: 30, restSeconds: 15, roundRestSeconds: 45 },
  { title: "Endure", from: 15, to: 20, workSeconds: 35, restSeconds: 10, roundRestSeconds: 45 },
  { title: "Forge", from: 22, to: 27, workSeconds: 40, restSeconds: 5, roundRestSeconds: 45 },
  { title: "Peak", from: 29, to: 30, workSeconds: 45, restSeconds: 5, roundRestSeconds: 15 },
]

const RECOVERY_SECONDS = 75
const RECOVERY_REST_SECONDS = 20
const TRAINING_ROUNDS = 3

/** One round's items on the wire; the last item's rest is the rest between rounds. */
const timedItems = (
  ids: ReadonlyArray<string>,
  workSeconds: number,
  restSeconds: number,
  roundRestSeconds: number,
) =>
  Arr.map(ids, (catalogId, index) => ({
    kind: "timed",
    catalogId,
    seconds: workSeconds,
    restSeconds: index === ids.length - 1 ? roundRestSeconds : restSeconds,
  }))

const trainingDay = (dayNumber: number, phase: Phase) => ({
  dayNumber,
  title: `Day ${dayNumber} · ${phase.title}`,
  rounds: TRAINING_ROUNDS,
  items: timedItems(
    Option.getOrElse(Arr.get(TEMPLATES, (dayNumber - 1) % TEMPLATES.length), () => TEMPLATE_A),
    phase.workSeconds,
    phase.restSeconds,
    phase.roundRestSeconds,
  ),
  restBetweenRoundsSeconds: phase.roundRestSeconds,
})

const recoveryDay = (dayNumber: number) => ({
  dayNumber,
  title: `Day ${dayNumber} · Recovery`,
  rounds: 1,
  items: timedItems(RECOVERY_ITEMS, RECOVERY_SECONDS, RECOVERY_REST_SECONDS, RECOVERY_REST_SECONDS),
  restBetweenRoundsSeconds: RECOVERY_REST_SECONDS,
})

const dayWire = (dayNumber: number) =>
  Option.match(
    Arr.findFirst(PHASES, (phase) => dayNumber >= phase.from && dayNumber <= phase.to),
    {
      onNone: () => recoveryDay(dayNumber),
      onSome: (phase) => trainingDay(dayNumber, phase),
    },
  )

/**
 * Decoded once at module load so ids are branded. The input is static data checked by
 * `core30.test.ts`; `decodeUnknownSync` throwing here would be a build-time data bug.
 */
export const CORE30: Program = Schema.decodeUnknownSync(Program)({
  programId: "core-30",
  name: "Core 30",
  tagline: "Thirty days of timed core work, from foundation to peak.",
  description:
    "Thirty guided days of timed core exercises. Three rotating routines hit the front, the obliques and the back and hips; every seventh day is a short recovery. Work intervals grow and rests shrink as the weeks go by.",
  days: Arr.makeBy(30, (index) => dayWire(index + 1)),
})
