import { Option } from "effect"
import type { ExerciseSummary } from "../../hooks/useHistory"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { ListRow, sizes, Text } from "../../ui"
import { illustrationIdFor } from "../todayHeader"
import { e1RmText, formatLoggedDate, formatSetText } from "./progressFormat"

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
      thumb
      leading={
        <ExerciseIllustration
          catalogId={illustrationIdFor(summary.exercise)}
          size={sizes.illustrationSm}
        />
      }
      title={summary.exercise.name}
      subtitle={detail}
      trailing={
        <Text variant="caption" tone="muted" tabular>
          {last}
        </Text>
      }
      selected={selected}
      onPress={onPress}
      accessibilityLabel={`${summary.exercise.name}, ${spoken}, last logged ${last}`}
    />
  )
}
