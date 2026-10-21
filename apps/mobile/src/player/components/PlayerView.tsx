import { findCatalogExercise, type ProgramDay, type ProgramItem } from "@tanren/shared"
import { Match, Option } from "effect"
import { View } from "react-native"
import type { CompletionState } from "../../hooks/usePlayer"
import { MuscleMap } from "../../illustrations/muscleMap/MuscleMap"
import {
  Banner,
  Button,
  Card,
  IconButton,
  illustration,
  radius,
  space,
  Text,
  TimerRing,
  useTheme,
} from "../../ui"
import { clock, exerciseName, itemAmount } from "../cues"
import {
  currentItem,
  type PlayerEventTag,
  type PlayerState,
  progress,
  upNext,
} from "../playerMachine"

/** Side length of the muscle map shown while working. */
const MUSCLE_MAP_SIZE = 160

/** Fallback when the item has no catalog entry; placeholder until the catalog's `ExerciseIllustration` lands: a box with the name. */
function IllustrationBox({ name }: { readonly name: string }) {
  const { colors } = useTheme()
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name} illustration`}
      style={{
        height: 160,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: illustration.figure,
        alignItems: "center",
        justifyContent: "center",
        padding: space.lg,
      }}
    >
      <Text variant="headline" style={{ textAlign: "center" }}>
        {name}
      </Text>
    </View>
  )
}

/** Length of the running phase (for the ring); 1 when there is no countdown. */
const phaseTotalMs = (state: PlayerState): number => {
  const phase = state._tag === "Paused" ? state.inner : state
  const span = Match.value(phase).pipe(
    Match.tag("Working", (s) => Option.map(s.endsAtMs, (endsAt) => endsAt - s.phaseStartMs)),
    Match.tag("Resting", (s) => Option.some(s.endsAtMs - s.phaseStartMs)),
    Match.orElse(() => Option.none<number>()),
  )
  return Math.max(
    1,
    Option.getOrElse(span, () => 1),
  )
}

const phaseLabel = (paused: boolean, resting: boolean): string => {
  if (paused) {
    return "Paused"
  }
  return resting ? "Rest" : "Work"
}

interface PlayerViewProps {
  readonly day: ProgramDay
  readonly state: PlayerState
  readonly remainingMs: Option.Option<number>
  readonly send: (tag: PlayerEventTag) => void
}

/** The running player: phase, illustration, big countdown, progress and the controls. */
export function PlayerView({ day, state, remainingMs, send }: PlayerViewProps) {
  const item = currentItem(day, state)
  const inner = state._tag === "Paused" ? state.inner : state
  const resting = inner._tag === "Resting"
  const paused = state._tag === "Paused"
  const name = Option.match(item, {
    onNone: () => "",
    onSome: (i: ProgramItem) => exerciseName(i.catalogId),
  })
  const next = upNext(day, state)
  const seconds = Option.map(remainingMs, (ms) => Math.ceil(ms / 1000))
  const total = phaseTotalMs(state)
  const fraction = Option.match(remainingMs, { onNone: () => 0, onSome: (ms) => ms / total })
  const position = progress(day, state)

  return (
    <View style={{ gap: space.lg }}>
      <View accessible accessibilityRole="header" style={{ gap: space.xs }}>
        <Text variant="caption" tone={resting ? "success" : "accent"}>
          {phaseLabel(paused, resting)}
        </Text>
        <Text variant="title">{resting ? "Rest" : name}</Text>
        {Option.match(position, {
          onNone: () => null,
          onSome: (p) => (
            <Text
              tone="muted"
              accessibilityLabel={`Round ${p.round} of ${p.rounds}, exercise ${p.item} of ${p.items}`}
            >
              {`Round ${p.round}/${p.rounds} · Exercise ${p.item}/${p.items}`}
            </Text>
          ),
        })}
      </View>

      {resting
        ? Option.match(next, {
            onNone: () => null,
            onSome: (upcoming) => (
              <Card tone="accent">
                <Text variant="caption" tone="muted">
                  Up next
                </Text>
                <Text variant="headline">{`${exerciseName(upcoming.catalogId)} · ${itemAmount(upcoming)}`}</Text>
              </Card>
            ),
          })
        : Option.match(
            Option.flatMap(item, (i) => findCatalogExercise(i.catalogId)),
            {
              onNone: () => <IllustrationBox name={name} />,
              onSome: (entry) => (
                <MuscleMap
                  primary={entry.primaryMuscles}
                  secondary={entry.secondaryMuscles}
                  size={MUSCLE_MAP_SIZE}
                />
              ),
            },
          )}

      <View style={{ alignItems: "center" }}>
        {Option.match(seconds, {
          onNone: () => (
            <Button
              label="Done"
              accessibilityLabel={`Done with ${name}`}
              onPress={() => send("next")}
              size="xl"
            />
          ),
          onSome: (s) => (
            <TimerRing
              progress={fraction}
              size={220}
              tone={resting ? "success" : "accent"}
              accessibilityLabel={`${s} seconds left`}
            >
              <Text variant="numeral" accessibilityLabel={`Countdown ${s}`}>
                {clock(s)}
              </Text>
            </TimerRing>
          ),
        })}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: space.xl }}>
        <IconButton
          icon="chevronLeft"
          size="lg"
          accessibilityLabel="Previous"
          onPress={() => send("previous")}
        />
        <IconButton
          icon={paused ? "play" : "pause"}
          size="lg"
          variant="filled"
          accessibilityLabel={paused ? "Resume" : "Pause"}
          onPress={() => send(paused ? "resume" : "pause")}
        />
        <IconButton
          icon="chevronRight"
          size="lg"
          accessibilityLabel="Next"
          onPress={() => send("next")}
        />
      </View>
      <Button
        label="Finish workout"
        accessibilityLabel="Finish workout"
        variant="secondary"
        onPress={() => send("finish")}
      />
    </View>
  )
}

interface CompletionSheetProps {
  readonly completion: Exclude<CompletionState, { readonly _tag: "None" }>
  readonly onClose: () => void
  readonly onRetry: () => void
}

/** After Done: duration and "logged as session", or the save error with Retry. */
export function CompletionSheet({ completion, onClose, onRetry }: CompletionSheetProps) {
  return (
    <Card tone={completion._tag === "Failed" ? "danger" : "success"}>
      <View accessible accessibilityLabel="Workout complete" style={{ gap: space.md }}>
        <Text variant="title">Workout complete</Text>
        <Text
          variant="numeral"
          accessibilityLabel={`Duration ${clock(completion.durationSeconds)}`}
        >
          {clock(completion.durationSeconds)}
        </Text>
        {Match.value(completion).pipe(
          Match.tagsExhaustive({
            Saving: () => <Text tone="muted">Saving…</Text>,
            Saved: () => <Text tone="success">Logged as session</Text>,
            Failed: ({ message }) => (
              <View style={{ gap: space.sm }}>
                <Banner tone="danger" title="Not saved" body={message} />
                <Button
                  label="Retry"
                  accessibilityLabel="Retry saving workout"
                  onPress={onRetry}
                  size="lg"
                />
              </View>
            ),
          }),
        )}
      </View>
      <Button label="Close" accessibilityLabel="Close" onPress={onClose} size="lg" />
    </Card>
  )
}
