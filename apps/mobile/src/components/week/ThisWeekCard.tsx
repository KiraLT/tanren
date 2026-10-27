import { formatInt } from "@tanren/shared"
import { Option } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { useWeekReview } from "../../hooks/useWeekReview"
import { Card, HealthRings, ProgressRing, StatRow, space, Text } from "../../ui"
import { weekStartFor } from "../health/dayBarMath"
import { localDateOf } from "../planFormat"
import {
  kcalTone,
  NUTRITION_RING,
  type ReviewSummary,
  sessionRatio,
  sessionsCentre,
  targetFraction,
} from "../review/reviewMath"
import { formatVolume } from "../volumeFormat"

/** `tiles` = one row of stat tiles (Home, You below desktop); `rings` = You's desktop column card. */
type ThisWeekVariant = "tiles" | "rings"

const sessionsValue = (done: number, planned: number): string =>
  planned > 0 ? `${done} / ${planned}` : String(done)

/** Sessions ring, then the average kcal / protein double ring (`/review`'s Nutrition card). */
function Rings({ summary }: { readonly summary: ReviewSummary }) {
  const { done, planned } = summary.training
  const nutrition = Option.match(summary.nutrition, {
    onNone: () => ({ kcal: 0, protein: 0, empty: true, text: "No food logged" }),
    onSome: (n) => ({
      kcal: targetFraction(n.avgKcal, n.targetKcal),
      protein: targetFraction(n.avgProteinG, n.targetProteinG),
      empty: n.daysLogged === 0,
      text: `${formatInt(n.avgKcal)} kcal · ${formatInt(n.avgProteinG)} g protein`,
    }),
  })
  return (
    <View style={{ flexDirection: "row", gap: space.lg }}>
      <View style={{ flex: 1, alignItems: "center", gap: space.sm }}>
        <ProgressRing
          progress={sessionRatio(done, planned)}
          diameter={NUTRITION_RING.size}
          stroke={NUTRITION_RING.stroke}
          accessibilityLabel={`Sessions ${sessionsValue(done, planned)}`}
        >
          <Text variant="title2">{sessionsCentre(done, planned)}</Text>
        </ProgressRing>
        <Text variant="label" tone="muted">
          Sessions
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: "center", gap: space.sm }}>
        <HealthRings
          size={NUTRITION_RING.size}
          stroke={NUTRITION_RING.stroke}
          outer={{ progress: nutrition.kcal, tone: kcalTone(nutrition.kcal) }}
          inner={{ progress: nutrition.protein, tone: "success" }}
          empty={nutrition.empty}
          accessibilityLabel={`Daily average: ${nutrition.text}`}
        />
        <Text variant="label" tone="muted" numberOfLines={1}>
          {nutrition.text}
        </Text>
      </View>
    </View>
  )
}

/**
 * "This week" (navigation-v2.md §2 Merge, §3): sessions done / planned, volume and PRs of the local
 * Mon–Sun week, the same `WeekReviewRepo` read the Weekly review shows; `rings` adds the sessions
 * ring and the average kcal / protein rings. Opens `/review`. Nothing while loading or on a read
 * failure (the review page carries the error).
 */
export function ThisWeekCard({ variant = "tiles" }: { readonly variant?: ThisWeekVariant }) {
  const router = useRouter()
  const state = useWeekReview(weekStartFor(localDateOf(new Date())))
  if (state._tag !== "Ready") {
    return null
  }
  const { done, planned, volumeKg, prs } = state.value.training
  const sessions = { label: "Sessions", value: sessionsValue(done, planned) }
  const rest = [
    { label: "Volume", value: formatVolume(volumeKg) },
    { label: "PRs", value: String(prs) },
  ]
  // Label-in-name: the accessible name reads the tiles' own strings.
  const spoken = [sessions, ...rest].map((item) => `${item.label} ${item.value}`).join(", ")
  return (
    <Card
      onPress={() => router.navigate("/review")}
      accessibilityLabel={`This week: ${spoken}. Opens the weekly review`}
    >
      <View style={{ gap: variant === "rings" ? space.lg : space.sm }}>
        <Text variant="caption" tone="muted" headingLevel={2}>
          This week
        </Text>
        {variant === "rings" ? <Rings summary={state.value} /> : null}
        <StatRow variant="tile" items={variant === "rings" ? rest : [sessions, ...rest]} />
      </View>
    </Card>
  )
}
