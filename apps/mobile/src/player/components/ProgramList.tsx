import type { ProgramSummary } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import type { ActiveProgram } from "../../services/ProgramRepo"
import { Card, ListGroup, ListRow, rhythm, StatusPill, space, Text } from "../../ui"
import { summaryBadge, summaryLabel, summarySubtitle } from "../programList"
import { DayCard, ProgramFinished } from "./ProgramHome"

/** A level-2 section label, same inset as the Settings and Today groups. */
function SectionLabel({ children }: { readonly children: string }) {
  return (
    <Text variant="caption" tone="muted" headingLevel={2} style={{ paddingLeft: space.lg }}>
      {children}
    </Text>
  )
}

interface ActiveSectionProps {
  readonly active: ReadonlyArray<ActiveProgram>
  readonly onStart: (enrollmentId: string) => void
  readonly onResume: (entry: ActiveProgram) => void
  /** The card's name area: open the read-only preview of the enrollment's current day. */
  readonly onOpenDay: (entry: ActiveProgram) => void
}

/** "Active": one `DayCard` per running (active or paused) enrollment; nothing when none run. */
export function ActiveSection({ active, onStart, onResume, onOpenDay }: ActiveSectionProps) {
  if (Arr.isReadonlyArrayEmpty(active)) {
    return null
  }
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <SectionLabel>Active</SectionLabel>
      <View style={{ gap: space.lg }}>
        {Arr.map(active, (entry) =>
          Option.match(entry.day, {
            onNone: () => <ProgramFinished key={entry.enrollment.id} program={entry.program} />,
            onSome: (day) => (
              <DayCard
                key={entry.enrollment.id}
                program={entry.program}
                day={day}
                paused={entry.enrollment.status === "paused"}
                onStart={() => onStart(entry.enrollment.id)}
                onResume={() => onResume(entry)}
                onOpenDay={() => onOpenDay(entry)}
                resumeVariant="raised"
              />
            ),
          }),
        )}
      </View>
    </View>
  )
}

/**
 * Desktop, nothing running: the left column holds this card so the page keeps its two columns.
 * The phone omits it (the list is the whole page).
 */
export function NoActiveCard() {
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <SectionLabel>Active</SectionLabel>
      <Card>
        <View style={{ gap: space.xs }}>
          <Text variant="headline">No active program</Text>
          <Text variant="subhead" tone="muted">
            Start one from the list and it shows up here
          </Text>
        </View>
      </Card>
    </View>
  )
}

interface ProgramsSectionProps {
  readonly summaries: ReadonlyArray<ProgramSummary>
  readonly onOpen: (summary: ProgramSummary) => void
}

/** "Programs": every built-in and custom program, one row each, the badge in the one trailing slot. */
export function ProgramsSection({ summaries, onOpen }: ProgramsSectionProps) {
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <SectionLabel>Programs</SectionLabel>
      <ListGroup inset="icon">
        {Arr.map(summaries, (summary) => (
          <ListRow
            key={summary.programId}
            icon="calendar"
            title={summary.title}
            subtitle={summarySubtitle(summary)}
            accessibilityLabel={summaryLabel(summary)}
            trailing={Option.match(summaryBadge(summary), {
              onNone: () => null,
              onSome: ({ label, tone }) => <StatusPill label={label} tone={tone} align="center" />,
            })}
            chevron
            onPress={() => onOpen(summary)}
          />
        ))}
      </ListGroup>
    </View>
  )
}
