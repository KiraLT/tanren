import type { LocalDate, PlannedSessionId } from "@tanren/shared"
import { Match, Option } from "effect"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { PlannedSessionCard } from "../../src/components/PlannedSessionCard"
import { PlanWeek } from "../../src/components/PlanWeek"
import { localDateOf, weekStats, weekSummary } from "../../src/components/planFormat"
import { selectedSession } from "../../src/components/planSelection"
import { nextUpcoming, upNextDate, upNextLines } from "../../src/components/planUpNext"
import { useLayoutMode } from "../../src/hooks/useLayoutMode"
import { type PlanWeekState, type PlanWeekView, usePlanWeek } from "../../src/hooks/usePlanWeek"
import {
  AppBar,
  Card,
  EmptyState,
  gutter,
  Page,
  rhythm,
  Skeleton,
  StatRow,
  sizes,
  space,
  Text,
} from "../../src/ui"

const PLAN_BAR = <AppBar title="Plan" />

/** Loading layout: a header block and five day rows; the container carries the accessible label. */
function PlanSkeleton() {
  return (
    <View
      accessible
      accessibilityLabel="Loading plan"
      style={{ gap: space.lg, paddingTop: space.md }}
    >
      <View style={{ gap: space.sm }}>
        <Skeleton width="60%" height={32} />
        <Skeleton width="40%" height={16} />
      </View>
      {[0, 1, 2, 3, 4].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: space.md }}>
          <Skeleton width={64} height={44} />
          <Skeleton width="100%" height={72} style={{ flexShrink: 1 }} />
        </View>
      ))}
    </View>
  )
}

/**
 * Desktop aside, under the week tiles: the next upcoming session (title, date, one line per
 * exercise with a tabular target). Nothing when the week has no upcoming session left.
 */
function UpNextCard({ view, today }: { readonly view: PlanWeekView; readonly today: LocalDate }) {
  return Option.match(nextUpcoming(view, today), {
    onNone: () => null,
    onSome: (next) => {
      const { lines, more } = upNextLines(next.session)
      return (
        <View style={{ gap: rhythm.labelToGroup }}>
          <Text variant="caption" tone="muted" accessibilityRole="header">
            Up next
          </Text>
          <Card
            style={{ minHeight: sizes.upNextCard, gap: space.xs }}
            accessibilityLabel={`Up next: ${next.session.plannedSession.name}, ${upNextDate(next)}`}
          >
            <Text variant="headline" numberOfLines={1}>
              {next.session.plannedSession.name}
            </Text>
            <Text variant="caption" tone="muted" style={{ paddingBottom: space.xs }}>
              {upNextDate(next)}
            </Text>
            {lines.map((line) => (
              <View
                key={line.key}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
              >
                <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }}>
                  {line.name}
                </Text>
                <Text variant="subhead" tone="muted" tabular numberOfLines={1}>
                  {line.target}
                </Text>
              </View>
            ))}
            {more === 0 ? null : (
              <Text variant="caption" tone="muted">
                {`+ ${more} more`}
              </Text>
            )}
          </Card>
        </View>
      )
    },
  })
}

interface PlanReadyProps {
  readonly view: PlanWeekView
}

/**
 * The week. Wide: cards are pressable and compact, and the aside shows the selected session's
 * blocks (default today's, else the next upcoming, else the first). Phone: cards show their blocks.
 */
function PlanReady({ view }: PlanReadyProps) {
  const today = localDateOf(new Date())
  const wide = useLayoutMode() === "two-column"
  const [selectedId, setSelectedId] = useState<Option.Option<PlannedSessionId>>(Option.none())
  const selected = selectedSession(view, today, selectedId)
  const aside = Option.match(selected, {
    onNone: () => <EmptyState title="No sessions" body="This week has no planned sessions yet." />,
    onSome: (item) => (
      <ScrollView
        contentContainerStyle={{ padding: gutter.desktop, paddingTop: space.lg, gap: space.lg }}
      >
        <PlannedSessionCard item={item} />
        {/* Desktop only: the phone shows the same numbers under the week header (PlanWeek). */}
        <View style={{ gap: rhythm.labelToGroup }}>
          <Text variant="caption" tone="muted" accessibilityRole="header">
            This week
          </Text>
          <StatRow variant="tile" direction="column" items={weekStats(weekSummary(view))} />
        </View>
        <UpNextCard view={view} today={today} />
      </ScrollView>
    ),
  })
  if (!wide) {
    return (
      <Page scroll header={PLAN_BAR}>
        <PlanWeek view={view} today={today} />
      </Page>
    )
  }
  return (
    <Page scroll header={PLAN_BAR} aside={aside}>
      <PlanWeek
        view={view}
        today={today}
        showBlocks={false}
        onSelectSession={(id) => setSelectedId(Option.some(id))}
        {...Option.match(selected, {
          onNone: () => ({}),
          onSome: (item) => ({ selectedSessionId: item.plannedSession.id }),
        })}
      />
    </Page>
  )
}

const renderState = Match.type<PlanWeekState>().pipe(
  Match.tagsExhaustive({
    Loading: () => (
      <Page header={PLAN_BAR}>
        <PlanSkeleton />
      </Page>
    ),
    Empty: () => (
      <Page header={PLAN_BAR}>
        <EmptyState
          title="No plan this week"
          body="Ask Claude to write your plan. It shows up here."
        />
      </Page>
    ),
    Failed: ({ message }) => (
      <Page header={PLAN_BAR}>
        <EmptyState icon="warning" title="Could not load the plan" body={message} />
      </Page>
    ),
    Ready: ({ view }) => <PlanReady view={view} />,
  }),
)

export default function PlanScreen() {
  const { state } = usePlanWeek()
  return renderState(state)
}
