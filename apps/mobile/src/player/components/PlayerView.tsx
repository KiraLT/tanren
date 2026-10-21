import type { ProgramDay, ProgramItem } from "@tanren/shared"
import { Match, Option } from "effect"
import { View } from "react-native"
import type { CompletionState } from "../../hooks/usePlayer"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { Banner, Button, Card, IconButton, sizes, space, Text, TimerRing } from "../../ui"
import { clock, exerciseName, itemAmount } from "../cues"
import { currentItem, type PlayerEventTag, type PlayerState, upNext } from "../playerMachine"

/** The work screen's illustration (ui-direction-final §7: 120 px, no tile of its own to compete with the ring). */
const WORK_ILLUSTRATION = 120

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

/**
 * The running player body (the app bar with the day progress is the route's): the work screen is
 * a 120 px illustration beside the name, the rest screen a 56 px one beside "Next"; both carry the
 * big ring, the transport row and `Finish workout`.
 */
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

  return (
    <View style={{ gap: space.xl }}>
      {resting ? (
        <View accessible accessibilityRole="header" style={{ gap: space.md }}>
          <Text variant="caption" tone="success">
            {phaseLabel(paused, resting)}
          </Text>
          <Text variant="title">Rest</Text>
          {Option.match(next, {
            onNone: () => null,
            onSome: (upcoming) => (
              <Card padding={space.md}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <ExerciseIllustration
                    catalogId={upcoming.catalogId}
                    size={sizes.illustrationSm}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" tone="muted">
                      Next
                    </Text>
                    <Text variant="headline">{exerciseName(upcoming.catalogId)}</Text>
                    <Text variant="subhead" tone="muted">
                      {itemAmount(upcoming)}
                    </Text>
                  </View>
                </View>
              </Card>
            ),
          })}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
          <ExerciseIllustration
            catalogId={Option.map(item, (i) => i.catalogId)}
            size={WORK_ILLUSTRATION}
          />
          <View accessible accessibilityRole="header" style={{ flex: 1, gap: space.xs }}>
            <Text variant="caption" tone={paused ? "muted" : "accent"}>
              {phaseLabel(paused, resting)}
            </Text>
            <Text variant="title" numberOfLines={3}>
              {name}
            </Text>
            {Option.match(item, {
              onNone: () => null,
              onSome: (i) => (
                <Text variant="subhead" tone="muted">
                  {itemAmount(i)}
                </Text>
              ),
            })}
          </View>
        </View>
      )}

      <View style={{ alignItems: "center" }}>
        {Option.match(seconds, {
          onNone: () => (
            <Button
              label="Done"
              accessibilityLabel={`Done with ${name}`}
              icon="check"
              variant="primary"
              size="lg"
              onPress={() => send("next")}
              style={{ alignSelf: "stretch" }}
            />
          ),
          onSome: (s) => (
            <TimerRing
              progress={fraction}
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
      <View style={{ gap: space.sm }}>
        {resting ? (
          <Button
            label="Skip rest"
            accessibilityLabel="Skip rest"
            variant="text"
            size="lg"
            onPress={() => send("next")}
          />
        ) : null}
        <Button
          label="Finish workout"
          accessibilityLabel="Finish workout"
          variant="secondary"
          size="lg"
          onPress={() => send("finish")}
        />
      </View>
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
