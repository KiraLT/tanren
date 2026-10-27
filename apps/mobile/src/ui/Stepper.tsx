import * as Haptics from "expo-haptics"
import { useRef, useState } from "react"
import {
  Platform,
  Pressable,
  type StyleProp,
  TextInput,
  type TextInputInstance,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native"
import { Button } from "./Button"
import {
  numeralScale,
  STEPPER_GLYPH_STROKE,
  type StepperSize,
  stepButtonStyle,
  stepGlyphColor,
  stepperCaption,
  stepperNumeral,
  stepperSizes,
} from "./controls"
import { Icon, type IconName } from "./Icon"
import { usePressableInteraction } from "./interaction"
import { Text } from "./Text"
import { ToggleChip } from "./ToggleChip"
import { useTheme } from "./theme"
import { glowRadius, space, type } from "./tokens"

export type { StepperSize } from "./controls"

/** The weight step control under the caption (weight-entry.md §2). */
export interface StepperStep {
  readonly stepKg: number
  readonly isOverride: boolean
  readonly options: ReadonlyArray<number>
  readonly onPick: (stepKg: number) => void
}

export interface StepperProps {
  readonly label: string
  /** Already formatted, e.g. "82.5". */
  readonly valueText: string
  readonly unit: string
  readonly onDecrement: () => void
  readonly onIncrement: () => void
  /**
   * Direct entry (weight-entry.md §1): when set, the numeral is a button that turns into a field;
   * Enter, blur or native Done commit the raw text (the caller parses), Escape cancels.
   */
  readonly onCommit?: (raw: string) => void
  /** The field's keyboard: `decimal` (default) for kg, `numeric` for reps and seconds. */
  readonly inputMode?: "decimal" | "numeric"
  /** Long unit for the spoken label ("kilograms"); defaults to `unit`. */
  readonly spokenUnit?: string
  /** False while the draft would clamp or fall back: the field turns `danger` (§4 Invalid draft). */
  readonly isDraftExact?: (raw: string) => boolean
  readonly step?: StepperStep
  readonly disabled?: boolean
  readonly size?: StepperSize
  readonly style?: StyleProp<ViewStyle>
}

interface StepButtonProps {
  readonly icon: IconName
  readonly accessibilityLabel: string
  readonly onPress: () => void
  readonly disabled: boolean
  readonly size: StepperSize
}

/**
 * Shrink-to-fit on native only. On web RNW ignores `adjustsFontSizeToFit` and turns `numberOfLines`
 * into `overflow: hidden`, which would clip the dark-theme glow to the glyph box; there the numeral
 * scales with the window below `NUMERAL_FULL_WIDTH` instead (`webNumeralSize`).
 */
const numeralFit =
  Platform.OS === "web" ? {} : ({ adjustsFontSizeToFit: true, numberOfLines: 1 } as const)

/** Web only: the numeral ramp entry scaled by `numeralScale`; native keeps the ramp (fit handles it). */
const webNumeralSize = (windowWidth: number): TextStyle => {
  const scale = numeralScale(windowWidth)
  const { fontSize, lineHeight } = type.numeral
  return Platform.OS !== "web" || scale === 1 || fontSize === undefined || lineHeight === undefined
    ? {}
    : { fontSize: Math.floor(fontSize * scale), lineHeight: Math.floor(lineHeight * scale) }
}

/** A light selection tick on native; web has no haptics. */
const tick = (): void => {
  if (Platform.OS !== "web") {
    Haptics.selectionAsync().catch(() => undefined)
  }
}

/** Width of one step chip (weight-entry.md §2). */
const STEP_CHIP_MIN_WIDTH = 50

/** "2.5", "1.25": the chip and button text of a step. */
const stepText = (stepKg: number): string => String(stepKg)

/** Borderless icon-only ± (§5, owner 11:55): 64 px invisible hit area, `surface` circle when pressed. */
function StepButton({ icon, accessibilityLabel, onPress, disabled, size }: StepButtonProps) {
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={tick}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [
        stepButtonStyle(size, { pressed, hovered, disabled }, colors),
        focusStyle,
      ]}
    >
      <Icon
        name={icon}
        size={stepperSizes[size].glyph}
        strokeWidth={STEPPER_GLYPH_STROKE}
        color={stepGlyphColor(disabled, colors)}
      />
    </Pressable>
  )
}

/** "Step 2.5 kg" (44 px text button) that opens the step chips; picking one collapses the row. */
function StepControl({
  step,
  disabled,
}: {
  readonly step: StepperStep
  readonly disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const text = `Step ${stepText(step.stepKg)} kg${step.isOverride ? " · custom" : ""}`
  return (
    <View style={{ alignItems: "center", gap: space.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${text}, change step`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={{ paddingVertical: 14, paddingHorizontal: space.md }}
      >
        <Text variant="label" tone="muted">
          {text}
        </Text>
      </Pressable>
      {open ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: space.sm,
          }}
        >
          {step.options.map((option) => (
            <ToggleChip
              key={option}
              label={stepText(option)}
              compact
              // A 50 px target around the natural pill ("1" alone is 32 px): 6 × 50 + 5 × 8 = 340 ≤ 358.
              style={{ minWidth: STEP_CHIP_MIN_WIDTH, alignItems: "center" }}
              selected={option === step.stepKg}
              onPress={() => {
                step.onPick(option)
                setOpen(false)
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** A value between a borderless minus and plus, readable at arm's length (API of the v1 Stepper). */
export function Stepper({
  label,
  valueText,
  unit,
  onDecrement,
  onIncrement,
  onCommit,
  inputMode = "decimal",
  spokenUnit = unit,
  isDraftExact,
  step,
  disabled = false,
  size = "xl",
  style,
}: StepperProps) {
  const { width } = useWindowDimensions()
  const { colors } = useTheme()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(valueText)
  const inputRef = useRef<TextInputInstance>(null)
  // Enter blurs the field on web, and blur also commits: the latch makes one edit commit once,
  // and lets Escape end the edit without the unmount blur committing the draft.
  const finished = useRef(true)
  const numeralStyle: ReadonlyArray<TextStyle> = [
    { fontVariant: ["tabular-nums"], flexShrink: 0 },
    size === "xxl" ? {} : webNumeralSize(width),
  ]
  const finish = (commit: boolean, raw: string) => {
    if (finished.current) {
      return
    }
    // biome-ignore lint/plugin/noMutation: React ref latch, not shared state
    finished.current = true
    setEditing(false)
    if (commit && onCommit !== undefined) {
      onCommit(raw)
    }
  }
  const startEditing = () => {
    // biome-ignore lint/plugin/noMutation: React ref latch, not shared state
    finished.current = false
    setDraft(valueText)
    setEditing(true)
  }
  const exact = isDraftExact === undefined || isDraftExact(draft)
  const numeral = (
    <Text variant={stepperNumeral(size)} glow {...numeralFit} style={numeralStyle}>
      {valueText}
    </Text>
  )
  const caption = (
    <Text variant="label" tone="muted">
      {stepperCaption(label, unit)}
    </Text>
  )
  const valueSlot =
    onCommit === undefined ? (
      <View
        style={{ flex: 1, alignItems: "center" }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}: ${valueText} ${unit}`}
      >
        {numeral}
        {caption}
      </View>
    ) : editing ? (
      <View style={{ flex: 1, alignItems: "center" }}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={`${label} in ${spokenUnit}`}
          defaultValue={valueText}
          onChangeText={setDraft}
          autoFocus
          selectTextOnFocus
          keyboardType={inputMode === "numeric" ? "number-pad" : "decimal-pad"}
          inputMode={inputMode}
          returnKeyType="done"
          onSubmitEditing={() => finish(true, draft)}
          onBlur={() => finish(true, draft)}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Escape") {
              finish(false, draft)
            }
          }}
          style={[
            type[stepperNumeral(size)],
            ...numeralStyle,
            {
              alignSelf: "stretch",
              textAlign: "center",
              padding: 0,
              borderWidth: 0,
              color: exact ? colors.text : colors.danger,
              textShadowColor: colors.glow,
              textShadowRadius: glowRadius,
            },
          ]}
        />
        {Platform.OS === "web" ? (
          caption
        ) : (
          <Button
            label="Done"
            accessibilityLabel={`Done editing ${label}`}
            size="sm"
            variant="text"
            onPress={() => inputRef.current?.blur()}
          />
        )}
      </View>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${valueText} ${spokenUnit}, tap to edit`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={startEditing}
        style={{ flex: 1, alignItems: "center" }}
      >
        {numeral}
        {caption}
      </Pressable>
    )
  return (
    <View style={[{ gap: space.xs }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <StepButton
          icon="minus"
          accessibilityLabel={`Decrease ${label}`}
          onPress={onDecrement}
          disabled={disabled}
          size={size}
        />
        {valueSlot}
        <StepButton
          icon="plus"
          accessibilityLabel={`Increase ${label}`}
          onPress={onIncrement}
          disabled={disabled}
          size={size}
        />
      </View>
      {step === undefined ? null : <StepControl step={step} disabled={disabled} />}
    </View>
  )
}
