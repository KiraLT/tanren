import type { Activity, ActivityExercise } from "@tanren/shared"
import { Array as Arr } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { MuscleMap } from "../../illustrations/muscleMap/MuscleMap"
import { MuscleMapImage } from "../../library/MuscleMapImage"
import { Card, ListGroup, ListRow, StatusPill, sizes, space, Text } from "../../ui"
import { Pills } from "./ActivityCard"
import { dateLine, detailTiles, exerciseSubtitle, musclesLabel, setLine } from "./detailText"
import { exerciseMapSource } from "./feedGroups"

const HERO_MAP_SIZE = 176
const THUMB_SIZE = sizes.illustrationSm
/** The set-line caption lines up with the row title: 16 gutter + 56 thumb + 12 gap = 84. */
const CAPTION_INSET = space.lg + THUMB_SIZE + space.md

export interface ActivityDetailProps {
  readonly activity: Activity
  readonly layout: "stacked" | "split"
}

function ExerciseThumb({ exercise }: { readonly exercise: ActivityExercise }) {
  const source = exerciseMapSource(exercise)
  return source._tag === "Custom" ? (
    <MuscleMap primary={source.primary} secondary={[]} size={THUMB_SIZE} />
  ) : (
    <MuscleMapImage
      catalogId={source.catalogId}
      size={THUMB_SIZE}
      primary={source.primary}
      secondary={source.secondary}
    />
  )
}

function ExerciseEntry({ exercise }: { readonly exercise: ActivityExercise }) {
  const router = useRouter()
  return (
    <View>
      <ListRow
        thumb
        title={exercise.name}
        subtitle={exerciseSubtitle(exercise)}
        leading={
          // Decorative: the row title names the exercise (a map's own label would pollute the row's name).
          <View aria-hidden>
            <ExerciseThumb exercise={exercise} />
          </View>
        }
        trailing={
          exercise.prs > 0 ? (
            <View style={{ alignSelf: "center" }}>
              <StatusPill label="PR" tone="accent" icon="flame" />
            </View>
          ) : null
        }
        chevron
        onPress={() =>
          router.navigate({
            pathname: "/progress/[exerciseId]",
            params: { exerciseId: exercise.exerciseId },
          })
        }
      />
      <Text
        variant="caption"
        tone="muted"
        style={{
          paddingLeft: CAPTION_INSET,
          paddingRight: space.lg,
          paddingBottom: space.md,
        }}
      >
        {setLine(exercise)}
      </Text>
    </View>
  )
}

interface ActivityPieceProps {
  readonly activity: Activity
}

/** Title and date line, with the pills row under it unless the caller places the pills itself. */
export function ActivityHead({
  activity,
  withPills = true,
}: ActivityPieceProps & { readonly withPills?: boolean }) {
  return (
    <View style={{ gap: space.sm }}>
      <View>
        <Text variant="display" accessibilityRole="header">
          {activity.title}
        </Text>
        <Text variant="caption" tone="muted">
          {dateLine(activity)}
        </Text>
      </View>
      {withPills ? <Pills activity={activity} /> : null}
    </View>
  )
}

/** The hero muscle map (front and back), one labelled image. */
export function ActivityMuscles({ activity }: ActivityPieceProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={musclesLabel(activity.muscles.primary, activity.muscles.secondary)}
      style={{ alignItems: "center" }}
    >
      <MuscleMap
        primary={activity.muscles.primary}
        secondary={activity.muscles.secondary}
        size={HERO_MAP_SIZE}
        view="both"
      />
    </View>
  )
}

/** Duration, Volume, Sets and PRs tiles, `perRow` to a row (2 x 2 stacked, 4 x 1 wide). */
export function ActivityTiles({
  activity,
  perRow,
}: ActivityPieceProps & { readonly perRow: 2 | 4 }) {
  const rows = Arr.chunksOf(detailTiles(activity), perRow)
  return (
    <View style={{ gap: space.md }}>
      {Arr.map(rows, (row) => (
        <View key={row[0].caption} style={{ flexDirection: "row", gap: space.md }}>
          {Arr.map(row, (tile) => (
            <Card key={tile.caption} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
              <Text variant="title2" tabular numberOfLines={1}>
                {tile.value}
              </Text>
              <Text variant="label" tone="muted" numberOfLines={1}>
                {tile.caption}
              </Text>
            </Card>
          ))}
        </View>
      ))}
    </View>
  )
}

/** The "Exercises" group: one row per exercise with its set line. */
export function ActivityExercises({ activity }: ActivityPieceProps) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="headline" accessibilityRole="header">
        Exercises
      </Text>
      <ListGroup inset="thumb">
        {Arr.map(activity.exercises, (exercise) => (
          <ExerciseEntry key={exercise.exerciseId} exercise={exercise} />
        ))}
      </ListGroup>
    </View>
  )
}

/**
 * One workout in full (docs/design/feed.md §4). `stacked`: head, muscle map, 2 x 2 stat tiles and
 * the exercises. `split` (the Feed aside, a 632 px column): the same pieces with the four tiles in
 * one row.
 */
export function ActivityDetail({ activity, layout }: ActivityDetailProps) {
  return (
    <View style={{ gap: space.lg }}>
      <ActivityHead activity={activity} />
      <ActivityMuscles activity={activity} />
      <ActivityTiles activity={activity} perRow={layout === "split" ? 4 : 2} />
      <ActivityExercises activity={activity} />
    </View>
  )
}
