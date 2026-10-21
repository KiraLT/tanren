import { Option } from "effect"
import type { ExerciseSummary, SessionSummary } from "../../hooks/useHistory"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { ListRow, StatusPill, sizes, Text } from "../../ui"
import { illustrationIdFor } from "../todayHeader"
import { e1RmText, formatLoggedDate, formatSetText, formatVolume } from "./progressFormat"

interface ExerciseRowProps {
  readonly summary: ExerciseSummary
  readonly selected: boolean
  readonly onPress: () => void
}

/** 56 px illustration, name (headline), `best set · e1RM` (subhead; best set only when bodyweight), last-logged day. */
export function ExerciseRow({ summary, selected, onPress }: ExerciseRowProps) {
  const best = formatSetText(summary.best.weightKg, summary.best.reps)
  const e1Rm = e1RmText(summary.best.weightKg, summary.bestE1Rm)
  const last = formatLoggedDate(summary.lastLoggedAt)
  const detail = Option.match(e1Rm, { onNone: () => best, onSome: (text) => `${best} · ${text}` })
  const spoken = Option.match(e1Rm, {
    onNone: () => `best set ${best}`,
    onSome: (text) => `best set ${best}, ${text}`,
  })
  return (
    <ListRow
      leading={
        <ExerciseIllustration
          catalogId={illustrationIdFor(summary.exercise)}
          size={sizes.illustrationSm}
        />
      }
      title={summary.exercise.name}
      subtitle={detail}
      trailing={
        <Text variant="caption" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
          {last}
        </Text>
      }
      selected={selected}
      onPress={onPress}
      accessibilityLabel={`${summary.exercise.name}, ${spoken}, last logged ${last}`}
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
