import { type CatalogId, formatInt, type ProgramDay, type ProgramItem } from "@tanren/shared"
import { Match, Option } from "effect"
import { ScrollView, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  equipmentOf,
  formatKg,
  isExactReps,
  isExactWeight,
  parseReps,
  parseWeight,
  STEP_OPTIONS_KG,
  stepReps,
  stepWeight,
} from "../../components/stepMath"
import type { CompletionState } from "../../hooks/usePlayer"
import { useStep } from "../../hooks/useStep"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import type { SetEntry } from "../../services/ProgramRepo"
import {
  Banner,
  Button,
  Card,
  IconButton,
  Stepper,
  sizes,
  space,
  stroke,
  Text,
  TimerRing,
  useBreakpoint,
} from "../../ui"
import { clock, exerciseName, isWeighted, itemAmount, nextCaption, repsOf } from "../cues"
import { currentItem, type PlayerEventTag, type PlayerState, upNext } from "../playerMachine"
import { ringSpec } from "../playerRing"

/** The work screen's illustration (ui-direction-final §7: 120 px, no tile of its own to compete with the ring). */
const WORK_ILLUSTRATION = 120

/** `TimerRing`'s default diameter: the reps block is at least this tall (`ring.size` when set). */
const DEFAULT_RING_SIZE = 220

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

interface WeightedEntryProps {
  readonly catalogId: CatalogId
  readonly entry: SetEntry
  readonly disabled: boolean
  readonly onAdjust: (entry: SetEntry) => void
}

/**
 * kg × reps steppers on the draft (§2.2) with direct entry and the per-exercise step
 * (weight-entry.md §3): the key is the item's catalog id, which `mergeDay` already swapped.
 */
function WeightedEntry({ catalogId, entry, disabled, onAdjust }: WeightedEntryProps) {
  const step = useStep(`catalog:${catalogId}`, equipmentOf(Option.some(catalogId)))
  return (
    <>
      <Stepper
        label="Weight"
        size="lg"
        valueText={formatKg(entry.weightKg)}
        unit="kg"
        spokenUnit="kilograms"
        disabled={disabled}
        onDecrement={() =>
          onAdjust({ ...entry, weightKg: stepWeight(entry.weightKg, -1, step.stepKg) })
        }
        onIncrement={() =>
          onAdjust({ ...entry, weightKg: stepWeight(entry.weightKg, 1, step.stepKg) })
        }
        onCommit={(raw) => onAdjust({ ...entry, weightKg: parseWeight(raw, entry.weightKg) })}
        isDraftExact={isExactWeight}
        step={{
          stepKg: step.stepKg,
          isOverride: step.isOverride,
          options: STEP_OPTIONS_KG,
          onPick: step.setStep,
        }}
      />
      <Stepper
        label="Reps"
        size="lg"
        valueText={String(entry.reps)}
        unit="reps"
        inputMode="numeric"
        disabled={disabled}
        onDecrement={() => onAdjust({ ...entry, reps: Math.max(1, stepReps(entry.reps, -1)) })}
        onIncrement={() => onAdjust({ ...entry, reps: stepReps(entry.reps, 1) })}
        onCommit={(raw) => onAdjust({ ...entry, reps: parseReps(raw, entry.reps) })}
        isDraftExact={isExactReps}
      />
    </>
  )
}

interface PlayerViewProps {
  readonly day: ProgramDay
  readonly state: PlayerState
  readonly remainingMs: Option.Option<number>
  readonly send: (tag: PlayerEventTag) => void
  /** Opens the swap sheet for the current exercise; the button shows on an exercise screen only. */
  readonly onSwap?: () => void
  /** `run.draft`: Some on a weighted reps item (kg × reps steppers); None shows the rep numeral. */
  readonly draft: Option.Option<SetEntry>
  readonly onAdjust: (entry: SetEntry) => void
}

/**
 * The running player body (the app bar with the day progress is the route's): the work screen is
 * a 120 px illustration beside the name, the rest screen a 56 px one beside "Next"; both carry the
 * big ring (a reps item: count numeral + Done, ADR-0020), the transport row and `Finish workout`.
 */
export function PlayerView({
  day,
  state,
  remainingMs,
  send,
  onSwap,
  draft,
  onAdjust,
}: PlayerViewProps) {
  const breakpoint = useBreakpoint()
  const phone = breakpoint === "phone"
  const ring = ringSpec(breakpoint, useWindowDimensions().width)
  const insets = useSafeAreaInsets()
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

  const headerBlock = resting ? (
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
              <ExerciseIllustration catalogId={upcoming.catalogId} size={sizes.illustrationSm} />
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
      {onSwap === undefined ? null : (
        <IconButton
          icon="swap"
          accessibilityLabel="Swap exercise"
          onPress={onSwap}
          style={{ alignSelf: "flex-start" }}
        />
      )}
    </View>
  )

  const doneButton = (
    <Button
      label="Done"
      accessibilityLabel={`Done with ${name}`}
      icon="check"
      variant="primary"
      size="xl"
      disabled={paused}
      onPress={() => send("next")}
      style={{ alignSelf: "stretch" }}
    />
  )

  const ringBlock = (
    <View style={{ alignItems: "center" }}>
      {Option.match(seconds, {
        // A reps item (ADR-0020): numeral + caption + Done, as tall as the ring so the transport
        // row does not move between a timed and a reps item (design v2-programs §9).
        onNone: () =>
          Option.match(Option.flatMap(item, repsOf), {
            onNone: () => doneButton,
            onSome: (count) =>
              // A weighted reps item (§2.2): kg × reps steppers on the draft, then Done.
              Option.isSome(item) && isWeighted(item.value) && Option.isSome(draft) ? (
                <View style={{ alignSelf: "stretch", gap: space.lg }}>
                  <WeightedEntry
                    catalogId={item.value.catalogId}
                    entry={draft.value}
                    disabled={paused}
                    onAdjust={onAdjust}
                  />
                  {doneButton}
                </View>
              ) : (
                <View
                  style={{
                    minHeight: ring.size ?? DEFAULT_RING_SIZE,
                    justifyContent: "center",
                    alignItems: "center",
                    alignSelf: "stretch",
                    gap: space.lg,
                  }}
                >
                  <View style={{ alignItems: "center", gap: space.xs }}>
                    <Text variant={ring.clock} accessibilityLabel={`${count} reps`}>
                      {count}
                    </Text>
                    <Text variant="caption" tone="muted">
                      reps
                    </Text>
                  </View>
                  {doneButton}
                </View>
              ),
          }),
        onSome: (s) => (
          <TimerRing
            progress={fraction}
            tone={resting ? "success" : "accent"}
            accessibilityLabel={`${s} seconds left`}
            {...(phone ? { strokeWidth: stroke.ring } : {})}
            {...(ring.size === undefined ? {} : { size: ring.size })}
          >
            <Text variant={ring.clock} accessibilityLabel={`Countdown ${s}`}>
              {clock(s)}
            </Text>
          </TimerRing>
        ),
      })}
    </View>
  )

  /** Phone: pause 64 on a `surface` disc, previous/next 48, gap 32 (ui-polish §3 Player 2). */
  const controlsBlock = phone ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.xxl,
      }}
    >
      <IconButton
        icon="chevronLeft"
        accessibilityLabel="Previous"
        onPress={() => send("previous")}
        style={{ width: sizes.control, height: sizes.control }}
      />
      <IconButton
        icon={paused ? "play" : "pause"}
        size="lg"
        variant="filled"
        accessibilityLabel={paused ? "Resume" : "Pause"}
        onPress={() => send(paused ? "resume" : "pause")}
        style={{ width: sizes.stepperButton, height: sizes.stepperButton }}
      />
      <IconButton
        icon="chevronRight"
        accessibilityLabel="Next"
        onPress={() => send("next")}
        style={{ width: sizes.control, height: sizes.control }}
      />
    </View>
  ) : (
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
  )

  /** "Next · Crunch 25 s" under the transport row: phone work screen only (rest has its Next card). */
  const nextLine = Option.match(phone && !resting ? nextCaption(day, state) : Option.none(), {
    onNone: () => null,
    onSome: (text) => (
      <Text variant="caption" tone="muted" style={{ textAlign: "center", minHeight: sizes.iconSm }}>
        {text}
      </Text>
    ),
  })

  const finishBlock = (
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
  )

  if (phone) {
    // Header at the top, ring centred in the remaining height, controls + Finish above the home
    // indicator (ui-polish §3 Player 1). The ScrollView grows to the viewport and still scrolls
    // when large text pushes the content past it.
    return (
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "space-between",
          gap: space.xl,
          paddingTop: space.lg,
          paddingBottom: space.lg + insets.bottom,
        }}
      >
        {headerBlock}
        <View style={{ flexGrow: 1, justifyContent: "center" }}>{ringBlock}</View>
        <View style={{ gap: space.xl }}>
          <View style={{ gap: space.md }}>
            {controlsBlock}
            {nextLine}
          </View>
          {finishBlock}
        </View>
      </ScrollView>
    )
  }
  return (
    <ScrollView
      contentContainerStyle={{ gap: space.xl, paddingVertical: space.lg }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {headerBlock}
      {ringBlock}
      {controlsBlock}
      {finishBlock}
    </ScrollView>
  )
}

interface SummaryTileProps {
  readonly label: string
  readonly value: string
  readonly unit?: string
  readonly muted?: boolean
  readonly spoken: string
}

/** One finish-sheet stat: headline numeral (tabular) + its unit, caption label under it. */
function SummaryTile({ label, value, unit, muted = false, spoken }: SummaryTileProps) {
  return (
    <Card padding={space.md} style={{ flex: 1 }}>
      <View accessible accessibilityLabel={spoken} style={{ gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
          <Text variant="headline" tabular {...(muted ? { tone: "muted" as const } : {})}>
            {value}
          </Text>
          {unit === undefined ? null : (
            <Text variant="subhead" tone="muted">
              {unit}
            </Text>
          )}
        </View>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      </View>
    </Card>
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
        {/* Two stat tiles side by side (§2.5, Strava's stats row), never a `·` text row. */}
        <View style={{ flexDirection: "row", gap: space.lg }}>
          <SummaryTile
            label="Duration"
            value={clock(completion.durationSeconds)}
            spoken={`Duration ${clock(completion.durationSeconds)}`}
          />
          {completion._tag === "Saved" ? (
            completion.volumeKg > 0 ? (
              <SummaryTile
                label="Volume"
                value={formatInt(completion.volumeKg)}
                unit="kg"
                spoken={`Volume ${formatInt(completion.volumeKg)} kilograms`}
              />
            ) : (
              <SummaryTile label="Volume" value="No load" muted spoken="Volume, no load" />
            )
          ) : null}
        </View>
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
