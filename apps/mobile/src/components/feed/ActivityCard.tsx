import { type Activity, type ActivityExercise, findCatalogExercise } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { MuscleMap } from "../../illustrations/muscleMap/MuscleMap"
import { MuscleMapImage } from "../../library/MuscleMapImage"
import { Card, radius, StatusPill, space, Text, useTheme } from "../../ui"
import { ActivityStats } from "./ActivityStats"
import { activityLabel, formatStamp, inLocalZone } from "./feedGroups"

/** At most this many exercise maps in the strip; the rest collapse into the "+N" disc. */
const STRIP_MAX = 4
const STRIP_SIZE = 48
const HEAD_MAP_SIZE = 56

export interface ActivityCardProps {
  readonly activity: Activity
  readonly onPress: () => void
  readonly selected?: boolean
}

function ExerciseMap({ exercise }: { readonly exercise: ActivityExercise }) {
  return Option.match(exercise.catalogId, {
    onNone: () => <MuscleMap primary={[]} secondary={[]} size={STRIP_SIZE} />,
    onSome: (catalogId) => {
      const entry = findCatalogExercise(catalogId)
      return (
        <MuscleMapImage
          catalogId={catalogId}
          size={STRIP_SIZE}
          primary={Option.match(entry, { onNone: () => [], onSome: (e) => e.primaryMuscles })}
          secondary={Option.match(entry, { onNone: () => [], onSome: (e) => e.secondaryMuscles })}
        />
      )
    },
  })
}

function OverflowDisc({ count }: { readonly count: number }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: STRIP_SIZE,
        height: STRIP_SIZE,
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="caption" tabular>
        {`+${count}`}
      </Text>
    </View>
  )
}

/** Pills of the card, in design order; empty when the activity has none of them. */
export function Pills({ activity }: { readonly activity: Activity }) {
  const hasProgram = Option.isSome(activity.program)
  const inProgress = activity.status === "inProgress"
  if (activity.prs === 0 && !hasProgram && !inProgress) {
    return null
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {activity.prs > 0 ? (
        <StatusPill label={`PR ×${activity.prs}`} tone="accent" icon="flame" />
      ) : null}
      {hasProgram ? <StatusPill label={activity.title} tone="neutral" icon="grid" /> : null}
      {inProgress ? <StatusPill label="In progress" tone="accent" icon="zap" /> : null}
    </View>
  )
}

/**
 * One workout in the feed (docs/design/feed.md §3): title and date beside a 56 px muscle map, three
 * stat tiles, a strip of up to four exercise maps with a "+N" overflow disc, and a pills row.
 */
export function ActivityCard({ activity, onPress, selected = false }: ActivityCardProps) {
  const shown = Arr.take(activity.exercises, STRIP_MAX)
  const hidden = activity.exercises.length - shown.length
  return (
    <Card
      onPress={onPress}
      selected={selected}
      accessibilityLabel={activityLabel(activity)}
      padding={space.lg}
    >
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="headline" numberOfLines={1}>
              {activity.title}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {formatStamp(inLocalZone(activity.startedAt))}
            </Text>
          </View>
          <MuscleMap
            primary={activity.muscles.primary}
            secondary={activity.muscles.secondary}
            size={HEAD_MAP_SIZE}
            view="both"
          />
        </View>
        <ActivityStats activity={activity} />
        {shown.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {Arr.map(shown, (exercise) => (
              <ExerciseMap key={exercise.exerciseId} exercise={exercise} />
            ))}
            {hidden > 0 ? <OverflowDisc count={hidden} /> : null}
          </View>
        ) : null}
        <Pills activity={activity} />
      </View>
    </Card>
  )
}
