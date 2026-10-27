import {
  type Activity,
  type DayTotals,
  type Insight,
  LocalDate,
  type WeekReview,
} from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { shiftDate } from "../../services/progressMath"

/** What `/review` shows for one Mon–Sun week (ADR-0029). */
export interface ReviewSummary {
  readonly weekStart: LocalDate
  /** Sunday of the week. */
  readonly weekEnd: LocalDate
  readonly training: {
    /** Finished sessions started in the week. */
    readonly done: number
    /** Planned sessions of the active plan's week (0 without one). */
    readonly planned: number
    /** Σ weightKg · reps over the finished sessions. */
    readonly volumeKg: number
    readonly prs: number
    /** Program days completed in the week. */
    readonly programDays: number
  }
  /** None when nothing was logged and tracking is off: the card is not drawn. */
  readonly nutrition: Option.Option<{
    /** Mean kcal over the logged days (0 when none). */
    readonly avgKcal: number
    /** Mean of the days' kcal targets; None with tracking off. */
    readonly targetKcal: Option.Option<number>
    readonly avgProteinG: number
    readonly targetProteinG: Option.Option<number>
    readonly daysOnKcalTarget: number
    readonly daysOnProteinTarget: number
    readonly daysLogged: number
  }>
  /** None when no day of the week has a tracker row (no Garmin). */
  readonly tracker: Option.Option<{
    readonly avgSteps: Option.Option<number>
    readonly avgBurnKcal: Option.Option<number>
    /** Days with a burn or step value. */
    readonly days: number
  }>
  readonly insights: ReadonlyArray<Insight>
  /** Mon–Sun totals (`WeekReview.days`), for the week chart. */
  readonly days: ReadonlyArray<DayTotals>
}

export interface ReviewInput {
  readonly review: WeekReview
  /** Finished sessions started in the week (the MCP rule), set-less ones included. */
  readonly sessionsDone: number
  /** The activities of those sessions that have sets: volume and PRs. */
  readonly sessions: ReadonlyArray<Activity>
  readonly programDays: number
}

const sum = (ns: ReadonlyArray<number>): number => Arr.reduce(ns, 0, (a, b) => a + b)

/** Rounded mean; None for an empty list. */
const mean = (ns: ReadonlyArray<number>): Option.Option<number> =>
  ns.length === 0 ? Option.none() : Option.some(Math.round(sum(ns) / ns.length))

/** The page's numbers from the shared `WeekReview` and the week's activities. Pure. */
export const reviewSummary = ({
  review,
  sessionsDone,
  sessions,
  programDays,
}: ReviewInput): ReviewSummary => {
  const targets = Arr.getSomes(Arr.map(review.days, (day) => day.targets))
  const tracking = targets.length > 0
  const steps = Arr.getSomes(Arr.map(review.days, (day) => day.steps))
  const burns = Arr.getSomes(Arr.map(review.days, (day) => day.burned))
  const trackerDays = Arr.filter(
    review.days,
    (day) => Option.isSome(day.steps) || Option.isSome(day.burned),
  ).length
  return {
    weekStart: review.weekStart,
    weekEnd: weekEndOf(review.weekStart),
    training: {
      done: sessionsDone,
      planned: review.workoutsPlanned,
      volumeKg: Math.round(sum(Arr.map(sessions, (session) => session.volumeKg))),
      prs: sum(Arr.map(sessions, (session) => session.prs)),
      programDays,
    },
    nutrition:
      review.daysLogged === 0 && !tracking
        ? Option.none()
        : Option.some({
            // An unlogged day eats 0 kcal, so the week's total over the logged days is their mean.
            avgKcal: review.daysLogged === 0 ? 0 : Math.round(review.eatenKcal / review.daysLogged),
            targetKcal: mean(Arr.map(targets, (target) => target.kcal)),
            avgProteinG: Math.round(review.proteinAvgG),
            targetProteinG: mean(Arr.map(targets, (target) => target.proteinG)),
            daysOnKcalTarget: review.daysOnKcalTarget,
            daysOnProteinTarget: review.daysOnProteinTarget,
            daysLogged: review.daysLogged,
          }),
    tracker:
      trackerDays === 0
        ? Option.none()
        : Option.some({ avgSteps: mean(steps), avgBurnKcal: mean(burns), days: trackerDays }),
    insights: review.insights,
    days: review.days,
  }
}

/** True when some day of the week has food logged or a burn row: the eaten vs burned chart has bars. */
export const weekHasNutritionData = (days: ReadonlyArray<DayTotals>): boolean =>
  !Arr.every(days, (day) => day.eaten.kcal === 0 && Option.isNone(day.burned))

/** The Sunday ending the week. */
export const weekEndOf = (weekStart: LocalDate): LocalDate =>
  LocalDate.make(shiftDate(weekStart, 6))

/** The Monday a week before. */
export const previousWeekStart = (weekStart: LocalDate): LocalDate =>
  LocalDate.make(shiftDate(weekStart, -7))

/** The Monday a week later. */
export const nextWeekStart = (weekStart: LocalDate): LocalDate =>
  LocalDate.make(shiftDate(weekStart, 7))

/** The double ring (avg kcal outside, protein inside) on `/review` and You's week card. */
export const NUTRITION_RING = { size: 104, stroke: 10 } as const

/** Sessions ring fill: done / planned; without a plan any session fills it. */
export const sessionRatio = (done: number, planned: number): number =>
  planned === 0 ? (done > 0 ? 1 : 0) : done / planned

/** Sessions ring centre: "3/4", or "3" without a plan. */
export const sessionsCentre = (done: number, planned: number): string =>
  planned === 0 ? String(done) : `${done}/${planned}`

/** `value` as a fraction of an optional target: 0 without one or with a non-positive target. */
export const targetFraction = (value: number, target: Option.Option<number>): number =>
  Option.match(target, { onNone: () => 0, onSome: (t) => (t <= 0 ? 0 : value / t) })

/** The kcal ring turns danger above 110 % of the target. */
export const kcalTone = (fraction: number): "accent" | "danger" =>
  fraction > 1.1 ? "danger" : "accent"
