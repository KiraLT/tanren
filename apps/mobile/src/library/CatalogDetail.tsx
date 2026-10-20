import type { CatalogExercise } from "@tanren/shared"
import { Match, Option } from "effect"
import { View } from "react-native"
import { Banner, Button, space, Text } from "../ui"
import { NO_SESSION_TITLE } from "./addToToday"
import { equipmentLabel, humanize, musclesLine } from "./catalogFormat"
import { ExerciseIllustration } from "./ExerciseIllustration"
import { useAddToToday } from "./useAddToToday"

/** v2-catalog.md §7: the illustration is 240 px. */
const ILLUSTRATION_SIZE = 240

export interface CatalogDetailProps {
  readonly entry: CatalogExercise
}

/** Illustration, name, muscles, equipment, the numbered instructions and "Add to today's session". */
export function CatalogDetail({ entry }: CatalogDetailProps) {
  const { add, pending, outcome, dismiss } = useAddToToday()
  return (
    <View style={{ gap: space.lg, paddingVertical: space.lg }}>
      <ExerciseIllustration id={entry.illustrationId} size={ILLUSTRATION_SIZE} />
      <View style={{ gap: space.xs }}>
        <Text variant="title" accessibilityRole="header">
          {entry.name}
        </Text>
        <Text tone="muted">{musclesLine(entry)}</Text>
        <Text variant="subhead" tone="muted">
          {`${equipmentLabel(entry.equipment)} · ${humanize(entry.kind)}`}
        </Text>
      </View>
      <View style={{ gap: space.sm }} accessibilityLabel="Instructions">
        <Text variant="headline">How to</Text>
        {entry.instructions.map((line, index) => (
          <View key={line} style={{ flexDirection: "row", gap: space.sm }}>
            <Text variant="subhead" tone="muted">{`${index + 1}.`}</Text>
            <Text style={{ flex: 1 }}>{line}</Text>
          </View>
        ))}
      </View>
      {Option.match(outcome, {
        onNone: () => null,
        onSome: (shown) =>
          Match.valueTags(shown, {
            Added: () => null,
            NoSession: () => (
              <Banner
                title={NO_SESSION_TITLE}
                body="Plan a session for today, then add exercises to it."
                onDismiss={dismiss}
              />
            ),
            Failed: ({ message }) => (
              <Banner tone="danger" title="Could not add it" body={message} onDismiss={dismiss} />
            ),
          }),
      })}
      <Button
        label="Add to today's session"
        variant="primary"
        size="lg"
        icon="plus"
        loading={pending}
        onPress={() => add(entry.catalogId)}
      />
    </View>
  )
}
