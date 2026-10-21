import { Option } from "effect"
import type { ExerciseSummary, SessionSummary } from "../../hooks/useHistory"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { ListRow, StatusPill, sizes, Text } from "../../ui"
import { illustrationIdFor } from "../todayHeader"
import { formatE1Rm, formatLoggedDate, formatSetText, formatVolume } from "./progressFormat"

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
        <ExerciseIllustration
          catalogId={illustrationIdFor(summary.exercise)}
          size={sizes.illustrationSm}
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
