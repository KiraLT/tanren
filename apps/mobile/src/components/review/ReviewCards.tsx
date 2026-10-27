import { formatInt, type LocalDate } from "@tanren/shared"
import { Option } from "effect"
import type { ReactNode } from "react"
import { View } from "react-native"
import { Card, HealthRings, ProgressRing, rhythm, SegmentBar, StatRow, space, Text } from "../../ui"
import { DayBars } from "../health/DayBars"
import { WEEK_DAYS } from "../health/dayBarMath"
import { formatVolume } from "../volumeFormat"
import {
  kcalTone,
  NUTRITION_RING,
  type ReviewSummary,
  sessionRatio,
  sessionsCentre,
  targetFraction,
} from "./reviewMath"

/** Ring diameter beside the card's text block: 88 + 16 gap leaves 222 of a 326 card at 390. */
const RING = 88
const RING_STROKE = 8

/** A titled Forge card; the title is the page's h2. */
function ReviewCard({
  title,
  caption,
  children,
}: {
  readonly title: string
  readonly caption?: string
  readonly children?: ReactNode
}) {
  return (
    <Card padding={rhythm.cardPadding}>
      <View style={{ gap: space.lg }}>
        <View style={{ gap: 2 }}>
          <Text variant="title2" headingLevel={2}>
            {title}
          </Text>
          {caption === undefined ? null : (
            <Text variant="caption" tone="muted">
              {caption}
            </Text>
          )}
        </View>
        {children}
      </View>
    </Card>
  )
}

/** Ring (or rings) on the left, a text block filling the rest. */
function Hero({ visual, children }: { readonly visual: ReactNode; readonly children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
      {visual}
      <View style={{ flex: 1, gap: space.xs }}>{children}</View>
    </View>
  )
}

/** One "days hit" meter: label and count over a 7-segment bar. */
function DaysMeter({ label, hit }: { readonly label: string; readonly hit: number }) {
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="label">{label}</Text>
        <Text variant="label" tone="muted">{`${hit} of ${WEEK_DAYS} days`}</Text>
      </View>
      <SegmentBar
        total={WEEK_DAYS}
        filled={hit}
        accessibilityLabel={`${label}: ${hit} of ${WEEK_DAYS} days`}
        style={{ width: "100%" }}
      />
    </View>
  )
}

/** Sessions vs plan as a ring and dots, then volume, PRs and program days as tiles. */
export function TrainingCard({ training }: Pick<ReviewSummary, "training">) {
  const { done, planned } = training
  const ratio = sessionRatio(done, planned)
  const centre = sessionsCentre(done, planned)
  const line =
    planned === 0
      ? `${done} ${done === 1 ? "session" : "sessions"}, no plan this week`
      : `${done} of ${planned} planned sessions`
  return (
    <ReviewCard title="Training">
      <Hero
        visual={
          <ProgressRing
            progress={ratio}
            diameter={RING}
            stroke={RING_STROKE}
            accessibilityLabel={line}
          >
            <Text variant="title2">{centre}</Text>
          </ProgressRing>
        }
      >
        <Text variant="headline">Sessions</Text>
        <Text variant="caption" tone="muted">
          {line}
        </Text>
      </Hero>
      <StatRow
        variant="tile"
        dense
        items={[
          { label: "Volume", value: formatVolume(training.volumeKg) },
          { label: "PRs", value: String(training.prs) },
          // "Program days" truncates in a 103 px tile at 390: the unit moves into the value.
          {
            label: "Program",
            value: `${training.programDays} ${training.programDays === 1 ? "day" : "days"}`,
          },
        ]}
      />
    </ReviewCard>
  )
}

const vsTarget = (value: string, target: Option.Option<number>, unit: string): string =>
  Option.match(target, {
    onNone: () => `${value}${unit}`,
    onSome: (t) => `${value} / ${formatInt(t)}${unit}`,
  })

/** Average intake vs targets on the double ring (kcal outside, protein inside), then days hit. */
export function NutritionCard({ nutrition }: Pick<ReviewSummary, "nutrition">) {
  return Option.match(nutrition, {
    onNone: () => <ReviewCard title="Nutrition" caption="No food logged this week" />,
    onSome: (n) => {
      const kcal = targetFraction(n.avgKcal, n.targetKcal)
      const protein = targetFraction(n.avgProteinG, n.targetProteinG)
      const kcalText = vsTarget(formatInt(n.avgKcal), n.targetKcal, " kcal")
      const proteinText = vsTarget(formatInt(n.avgProteinG), n.targetProteinG, " g")
      return (
        <ReviewCard
          title="Nutrition"
          caption={`Daily averages over ${n.daysLogged} of ${WEEK_DAYS} logged days`}
        >
          <Hero
            visual={
              <HealthRings
                size={NUTRITION_RING.size}
                stroke={NUTRITION_RING.stroke}
                outer={{ progress: kcal, tone: kcalTone(kcal) }}
                inner={{ progress: protein, tone: "success" }}
                empty={n.daysLogged === 0}
                accessibilityLabel={`Average ${kcalText}, protein ${proteinText}`}
              />
            }
          >
            <Text variant="label" tone="muted">
              Avg calories
            </Text>
            <Text variant="headline">{kcalText}</Text>
            <Text variant="label" tone="muted" style={{ marginTop: space.xs }}>
              Avg protein
            </Text>
            <Text variant="headline">{proteinText}</Text>
          </Hero>
          <DaysMeter label="Calories on target" hit={n.daysOnKcalTarget} />
          <DaysMeter label="Protein target hit" hit={n.daysOnProteinTarget} />
        </ReviewCard>
      )
    },
  })
}

/** The week's eaten vs burned bars (the Health screen's chart). */
export function WeekChartCard({
  days,
  today,
}: Pick<ReviewSummary, "days"> & { readonly today: LocalDate }) {
  return (
    <ReviewCard title="Eaten vs burned">
      <DayBars days={days} today={today} />
    </ReviewCard>
  )
}

const dash = (value: Option.Option<number>): string =>
  Option.match(value, { onNone: () => "—", onSome: formatInt })

/** Garmin's daily averages as tiles; nothing without a tracker row this week. */
export function TrackerCard({ tracker }: Pick<ReviewSummary, "tracker">) {
  return Option.match(tracker, {
    onNone: () => null,
    onSome: (t) => (
      <ReviewCard
        title="Activity"
        caption={`Garmin daily averages · ${t.days} of ${WEEK_DAYS} days`}
      >
        <StatRow
          variant="tile"
          items={[
            { label: "Steps", value: dash(t.avgSteps) },
            { label: "Burned kcal", value: dash(t.avgBurnKcal) },
          ]}
        />
      </ReviewCard>
    ),
  })
}
