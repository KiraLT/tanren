import { useEffect, useState } from "react"
import { TextInput, View } from "react-native"
import { IconButton, radius, sizes, space, Text, type, useTheme } from "../../ui"

export interface SectionLabelProps {
  readonly children: string
}

/** A level-2 section label (the AppBar owns the page's one `h1`). */
export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <Text variant="headline" headingLevel={2}>
      {children}
    </Text>
  )
}

export interface TextFieldProps {
  readonly value: string
  readonly label: string
  /** Called on blur or submit, with the trimmed text, when it differs from `value`. */
  readonly onCommit: (text: string) => void
  readonly multiline?: boolean
  readonly maxLength: number
  readonly placeholder?: string
}

/** Field height: a single line is `sizes.control` (48), the two-line summary 68. */
const SUMMARY_HEIGHT = 68

/**
 * A `surface` text field that writes on blur or submit, not per keystroke: every write is a saved
 * `program` row (version + 1), so typing must not create one version per letter. An empty text
 * reverts (a program needs a title and a summary).
 */
export function TextField({
  value,
  label,
  onCommit,
  multiline = false,
  maxLength,
  placeholder,
}: TextFieldProps) {
  const { colors } = useTheme()
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      setText(value)
    } else if (trimmed !== value) {
      onCommit(trimmed)
    }
  }
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      maxLength={maxLength}
      multiline={multiline}
      accessibilityLabel={label}
      placeholder={placeholder ?? label}
      placeholderTextColor={colors.textMuted}
      style={[
        type.body,
        {
          minHeight: multiline ? SUMMARY_HEIGHT : sizes.control,
          paddingHorizontal: space.lg,
          paddingVertical: multiline ? space.md : 0,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: colors.surface,
          color: colors.text,
        },
        multiline ? { height: SUMMARY_HEIGHT, textAlignVertical: "top" } : {},
      ]}
    />
  )
}

export interface CompactStepperProps {
  /** Names the value for assistive tech: "Rounds", "Rest after Plank". */
  readonly label: string
  /** Shown between the buttons, already formatted: "30 s", "10 reps". */
  readonly valueText: string
  readonly onDecrement: () => void
  readonly onIncrement: () => void
  readonly canDecrement: boolean
  readonly canIncrement: boolean
}

/**
 * A 44 px − value + row for the editor's forms. The player's `Stepper` is a 72 px numeral built to
 * be read at arm's length; two of them do not fit a 157 px column.
 */
export function CompactStepper({
  label,
  valueText,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
}: CompactStepperProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: sizes.tap }}>
      <IconButton
        icon="minus"
        accessibilityLabel={`Decrease ${label}`}
        disabled={!canDecrement}
        onPress={onDecrement}
      />
      <View
        style={{ flex: 1, alignItems: "center" }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}: ${valueText}`}
      >
        <Text variant="subhead" tabular numberOfLines={1}>
          {valueText}
        </Text>
      </View>
      <IconButton
        icon="plus"
        accessibilityLabel={`Increase ${label}`}
        disabled={!canIncrement}
        onPress={onIncrement}
      />
    </View>
  )
}

/** The glyph set has no "up" arrow: the down chevron turned half a circle (a disc, so it stays centred). */
const FLIP_UP = { transform: [{ rotate: "180deg" }] } as const

export interface MoveButtonProps {
  readonly direction: "up" | "down"
  /** "Move Plank up", "Move day 3 down". */
  readonly accessibilityLabel: string
  readonly disabled: boolean
  readonly onPress: () => void
}

export function MoveButton({ direction, accessibilityLabel, disabled, onPress }: MoveButtonProps) {
  return (
    <IconButton
      icon="chevronDown"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={direction === "up" ? FLIP_UP : {}}
    />
  )
}
