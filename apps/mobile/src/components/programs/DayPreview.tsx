import type { Program, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { useBreakpoint } from "../../hooks/useLayoutMode"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { exerciseName } from "../../player/cues"
import { dayTrailing } from "../../player/programDays"
import { continueLabel, continueLine, type DayProgress } from "../../services/ProgramRepo"
import {
  Button,
  Card,
  Columns,
  ListGroup,
  ListRow,
  rhythm,
  StatRow,
  sizes,
  space,
  Text,
} from "../../ui"
import { itemLine, positionLabel } from "./dayPreviewLines"

interface DayPreviewProps {
  readonly program: Program
  readonly day: ProgramDay
  /** Shows "Start this day" (the current day of an active enrollment, `startable`). */
  readonly canStart: boolean
  readonly onStart: () => void
  /** The current day is unfinished: "Day n · k of m done" + "Continue day n" (PROG-2). */
  readonly inProgress?: Option.Option<DayProgress>
}

function PositionCard({
  program,
  day,
  canStart,
  onStart,
  inProgress = Option.none(),
}: DayPreviewProps) {
  return (
    <Card>
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="title2" headingLevel={2}>
            {program.name}
          </Text>
          <Text variant="subhead" tone="muted">
            {positionLabel(day, program.days.length)}
          </Text>
        </View>
        {canStart && Option.isSome(inProgress) ? (
          <View style={{ gap: space.sm }}>
            <Text variant="subhead" tone="muted">
              {continueLine(day.dayNumber, inProgress.value)}
            </Text>
            <Button
              label={continueLabel(day.dayNumber)}
              accessibilityLabel={`${continueLabel(day.dayNumber)} of ${program.name}`}
              icon="play"
              variant="primary"
              size="lg"
              onPress={onStart}
            />
          </View>
        ) : canStart ? (
          <Button
            label="Start this day"
            accessibilityLabel={`Start day ${day.dayNumber} of ${program.name}`}
            icon="zap"
            variant="primary"
            size="lg"
            onPress={onStart}
          />
        ) : null}
      </View>
    </Card>
  )
}

function PreviewStats({ day, tile }: { readonly day: ProgramDay; readonly tile: boolean }) {
  return (
    <StatRow
      variant={tile ? "tile" : "plain"}
      items={[
        { label: "Length", value: dayTrailing(day) },
        { label: "Exercises", value: String(day.items.length) },
        { label: "Rounds", value: String(day.rounds) },
      ]}
    />
  )
}

function PreviewItems({ day }: { readonly day: ProgramDay }) {
  const heading =
    day.rounds > 1 ? `Exercises · ${day.rounds} rounds` : `Day ${day.dayNumber} exercises`
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <Text variant="caption" tone="muted" headingLevel={2} style={{ paddingLeft: space.lg }}>
        {heading}
      </Text>
      <ListGroup>
        {Arr.map(day.items, (item, index) => (
          <ListRow
            key={`${item.catalogId}-${index}`}
            thumb
            leading={
              <ExerciseIllustration catalogId={item.catalogId} size={sizes.illustrationSm} />
            }
            title={exerciseName(item.catalogId)}
            subtitle={itemLine(item)}
            accessibilityLabel={`${exerciseName(item.catalogId)}, ${itemLine(item)}`}
          />
        ))}
      </ListGroup>
    </View>
  )
}

/**
 * Read-only preview of one program day: position card (with "Start this day" only when
 * `canStart`), the day's stats and its exercises. Desktop: exercises left, card + stats right;
 * phone and tablet: card, stats, exercises.
 */
export function DayPreview(props: DayPreviewProps) {
  const desktop = useBreakpoint() === "desktop"
  const side = (
    <View style={{ gap: space.lg }}>
      <PositionCard {...props} />
      <PreviewStats day={props.day} tile={desktop} />
    </View>
  )
  return <Columns main={<PreviewItems day={props.day} />} side={side} stack="side-then-main" />
}
