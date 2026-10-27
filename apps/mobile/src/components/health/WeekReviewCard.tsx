import type { WeekReview } from "@tanren/shared"
import { View } from "react-native"
import { Card, rhythm, StatRow, space, Text } from "../../ui"
import { avgBalanceText, WEEK_DAYS } from "./dayBarMath"

export interface WeekReviewCardProps {
  readonly review: WeekReview
}

/**
 * "This week" (nutrition.md §6 week review): four stats as two `plain` rows of two, because
 * `StatRow variant="plain"` ignores `direction` and four slots of 72.5 px truncate
 * "−310 kcal/day"; the balance steps to `headline` (the primitive's long-value rule).
 */
export function WeekReviewCard({ review }: WeekReviewCardProps) {
  return (
    <Card padding={rhythm.cardPadding}>
      <View style={{ gap: space.md }}>
        <Text variant="title2" headingLevel={2}>
          This week
        </Text>
        <StatRow
          variant="plain"
          items={[
            { label: "On target", value: `${review.daysOnKcalTarget} / ${WEEK_DAYS}` },
            {
              label: "Avg balance",
              value: avgBalanceText(review),
              valueVariant: "headline",
            },
          ]}
        />
        <StatRow
          variant="plain"
          items={[
            { label: "Protein hit", value: `${review.daysOnProteinTarget} / ${WEEK_DAYS}` },
            { label: "Workouts", value: `${review.workoutsDone} / ${review.workoutsPlanned}` },
          ]}
        />
      </View>
    </Card>
  )
}
