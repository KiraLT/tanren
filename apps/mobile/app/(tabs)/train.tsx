import { Match } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import type { ReactNode } from "react"
import { View } from "react-native"
import { LibraryView } from "../../src/components/train/LibraryView"
import { PlanView } from "../../src/components/train/PlanView"
import { ProgramsView } from "../../src/components/train/ProgramsView"
import {
  isTrainView,
  type PlanAvailability,
  TRAIN_VIEWS,
  type TrainView,
  trainViewFor,
} from "../../src/components/train/trainView"
import { type PlanWeekState, usePlanWeek } from "../../src/hooks/usePlanWeek"
import { AppBar, gutter, SegmentedControl, sizes, space, useBreakpoint } from "../../src/ui"

/** Segment row width: 3 × 119 at 390 (navigation-v2.md §7); desktop keeps the same width. */
const SEGMENT_ROW_WIDTH = 358

const availability = (state: PlanWeekState): PlanAvailability =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Loading: () => "loading" as const,
      Ready: ({ view }) => (view.days.length > 0 ? ("days" as const) : ("none" as const)),
      Empty: () => "none" as const,
      Failed: () => "none" as const,
    }),
  )

/**
 * Train (ADR-0029 §3): Plan · Programs · Library as segments of one page. `?view=` is the source
 * of truth; without it the hub opens on Plan when this week has days, else Programs.
 */
export default function TrainScreen() {
  const router = useRouter()
  const breakpoint = useBreakpoint()
  const params = useLocalSearchParams<{ view?: string | string[] }>()
  const { state } = usePlanWeek()
  const view = trainViewFor(params.view, availability(state))
  const header = (trailing: ReactNode) => (
    <View>
      {/* Without an action, a tap-high spacer keeps the bar at the same height in every segment
          (56 vs 61 px measured), so the segment row never jumps when the view changes. */}
      <AppBar
        title="Train"
        trailing={trailing === null ? <View style={{ height: sizes.tap }} /> : trailing}
      />
      <View
        style={{
          paddingHorizontal: gutter[breakpoint],
          paddingTop: space.md,
          paddingBottom: space.xs,
        }}
      >
        <SegmentedControl
          options={TRAIN_VIEWS}
          value={view}
          accessibilityLabel="Train views"
          onChange={(next) => {
            if (isTrainView(next)) {
              router.setParams({ view: next })
            }
          }}
          style={{ width: "100%", maxWidth: SEGMENT_ROW_WIDTH }}
        />
      </View>
    </View>
  )
  return Match.value<TrainView>(view).pipe(
    Match.when("plan", () => <PlanView state={state} header={header(null)} />),
    Match.when("programs", () => <ProgramsView header={header} />),
    Match.when("library", () => <LibraryView header={header(null)} />),
    Match.exhaustive,
  )
}
