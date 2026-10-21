import { activeLocation, type CatalogExercise } from "@tanren/shared"
import { Match, Option } from "effect"
import { ScrollView, View } from "react-native"
import { useAddToToday } from "../hooks/useAddToToday"
import { useProfile } from "../hooks/useProfile"
import { MuscleMap } from "../illustrations/muscleMap/MuscleMap"
import {
  Banner,
  Button,
  Icon,
  type IconName,
  ListGroup,
  ListRow,
  StatusPill,
  sizes,
  space,
  Text,
  useTheme,
} from "../ui"
import { type AddOutcome, NO_SESSION_TITLE, noticeCopy } from "./addToToday"
import { equipmentLabel, humanize, needsLine } from "./catalogFormat"
import { ExerciseIllustration } from "./ExerciseIllustration"

/** ui-direction-final §7: the hero reserves 72×168 on the right for the muscle map. */
const MAP_SLOT = { width: 72, height: 168 } as const

export interface CatalogDetailProps {
  readonly entry: CatalogExercise
  /** `false` when the hero and meta render elsewhere (the desktop aside, `CatalogHero`). */
  readonly hero?: boolean
}

/** The muted, self-dismissing line after an add ("Added" / "Already in today's session"). */
function Notice({ outcome }: { readonly outcome: AddOutcome }) {
  return Option.match(noticeCopy(outcome), {
    onNone: () => null,
    onSome: (copy) => (
      <Text
        tone="muted"
        accessibilityLabel={copy}
        accessibilityLiveRegion="polite"
        style={{ textAlign: "center" }}
      >
        {copy}
      </Text>
    ),
  })
}

function Meta({ icon, label }: { readonly icon: IconName; readonly label: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <Icon name={icon} size={sizes.iconSm} color={colors.accent} />
      <Text variant="subhead" tone="muted">
        {label}
      </Text>
    </View>
  )
}

/** Background-free 176 px illustration, the muscle-map slot on the right, then the meta row. */
export function CatalogHero({ entry }: { readonly entry: CatalogExercise }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <ExerciseIllustration
          catalogId={entry.catalogId}
          size={sizes.illustrationLg}
          framed={false}
        />
        <View style={{ ...MAP_SLOT, alignItems: "center", justifyContent: "center" }}>
          <MuscleMap
            primary={entry.primaryMuscles}
            secondary={entry.secondaryMuscles}
            size={MAP_SLOT.width}
          />
        </View>
      </View>
      <View
        accessibilityLabel="Details"
        style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.xs }}
      >
        <Meta icon="target" label={entry.primaryMuscles.map(humanize).join(", ")} />
        <Meta icon="dumbbell" label={equipmentLabel(entry.equipment)} />
        <Meta icon="repeat" label={humanize(entry.kind)} />
      </View>
    </View>
  )
}

/**
 * Name first, the hero (unless it sits in the desktop aside), numbered-disc steps, availability at
 * the active location, and a sticky "Add to today's session" below the scrolling content.
 */
export function CatalogDetail({ entry, hero = true }: CatalogDetailProps) {
  const { add, pending, outcome, dismiss } = useAddToToday()
  const location = Option.flatMap(useProfile(), activeLocation)
  const needs = needsLine(entry, location)
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: space.lg, paddingVertical: space.lg }}
      >
        <Text variant="title" accessibilityRole="header">
          {entry.name}
        </Text>
        {hero ? <CatalogHero entry={entry} /> : null}
        <ListGroup>
          {entry.instructions.map((line, index) => (
            <ListRow
              key={line}
              title={line}
              disc={{ state: "todo", index: index + 1 }}
              accessibilityLabel={`Step ${index + 1}: ${line}`}
            />
          ))}
        </ListGroup>
        {Option.match(location, {
          onNone: () => null,
          onSome: (active) => (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: space.sm,
              }}
            >
              {Option.isNone(needs) ? (
                <StatusPill tone="success" icon="check" label={`Available at ${active.name}`} />
              ) : (
                <StatusPill tone="neutral" icon="mapPin" label={`Not at ${active.name}`} />
              )}
              {Option.match(needs, {
                onNone: () => null,
                onSome: (line) => (
                  <Text variant="subhead" tone="muted" accessibilityLabel={line}>
                    {line}
                  </Text>
                ),
              })}
            </View>
          ),
        })}
      </ScrollView>
      <View style={{ gap: space.sm, paddingTop: space.sm, paddingBottom: space.md }}>
        {Option.match(outcome, {
          onNone: () => null,
          onSome: (shown) =>
            Match.valueTags(shown, {
              Added: () => <Notice outcome={shown} />,
              AlreadyPlanned: () => <Notice outcome={shown} />,
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
    </View>
  )
}
