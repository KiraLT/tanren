import { Option } from "effect"
import { View } from "react-native"
import type { ExerciseSummary, SessionSummary } from "../../hooks/useHistory"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { Icon, ListRow, radius, StatusPill, sizes, Text, useTheme } from "../../ui"
import { formatE1Rm, formatLoggedDate, formatSetText, formatVolume } from "./progressFormat"

interface ExerciseThumbProps {
  readonly catalogId: ExerciseSummary["exercise"]["catalogId"]
  readonly size: number
  /** The tile sits on `surface` (a grouped row): the fallback uses `surfaceRaised`, else `surface`. */
  readonly onSurface?: boolean
}

/** The catalog illustration; a custom exercise (no catalog entry) gets a neutral dumbbell tile. */
export function ExerciseThumb({ catalogId, size, onSurface = false }: ExerciseThumbProps) {
  const { colors } = useTheme()
  return Option.match(catalogId, {
    onSome: (id) => <ExerciseIllustration catalogId={id} size={size} />,
    onNone: () => (
      <View
        accessibilityElementsHidden
        style={{
          width: size,
          height: size,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: onSurface ? colors.surfaceRaised : colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="dumbbell" size={sizes.iconMd} color={colors.textMuted} />
      </View>
    ),
  })
}

interface ExerciseRowProps {
  readonly summary: ExerciseSummary
  readonly selected: boolean
  readonly onPress: () => void
}

/** 56 px illustration, name (headline), `best set · e1RM` (subhead) and the last-logged day. */
export function ExerciseRow({ summary, selected, onPress }: ExerciseRowProps) {
  const best = formatSetText(summary.best.weightKg, summary.best.reps)
  const e1Rm = formatE1Rm(summary.bestE1Rm)
  const last = formatLoggedDate(summary.lastLoggedAt)
  return (
    <ListRow
      leading={
        <ExerciseThumb
          catalogId={summary.exercise.catalogId}
          size={sizes.illustrationSm}
          onSurface
        />
      }
      title={summary.exercise.name}
      subtitle={`${best} · ${e1Rm}`}
      trailing={
        <Text variant="caption" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
          {last}
        </Text>
      }
      selected={selected}
      onPress={onPress}
      accessibilityLabel={`${summary.exercise.name}, best set ${best}, ${e1Rm}, last logged ${last}`}
    />
  )
}

interface SessionRowProps {
  readonly summary: SessionSummary
}

/** Title, then `date · duration · sets · exercises · volume`, and a `PR ×n` pill when it set records. */
export function SessionRow({ summary }: SessionRowProps) {
  const date = formatLoggedDate(summary.session.startedAt)
  const parts = [
    date,
    ...Option.match(summary.durationMinutes, {
      onNone: () => [],
      onSome: (minutes) => [`${minutes} min`],
    }),
    `${summary.sets} ${summary.sets === 1 ? "set" : "sets"}`,
    `${summary.exercises} ${summary.exercises === 1 ? "exercise" : "exercises"}`,
    ...(summary.volumeKg > 0 ? [formatVolume(summary.volumeKg)] : []),
  ]
  const detail = parts.join(" · ")
  return (
    <ListRow
      title={summary.title}
      subtitle={detail}
      trailing={
        summary.prs > 0 ? <StatusPill label={`PR ×${summary.prs}`} tone="accent" /> : undefined
      }
      accessibilityLabel={`${summary.title}, ${detail}${summary.prs > 0 ? `, ${summary.prs} personal records` : ""}`}
    />
  )
}
