import { useEffect, useRef, useState } from "react"
import { Platform, Pressable, TextInput, type TextInputInstance, View } from "react-native"
import { IconButton, radius, sizes, space, Text, type, useTheme } from "../../ui"
import { useInlineEdit } from "../../ui/inlineEdit"

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
  /** The bare number the typed entry starts from: 30 for "30 s rest". */
  readonly value: number
  /** Tap-to-type: Enter, blur or Done hand over the raw text (the caller fits it to its range). */
  readonly onCommit: (raw: string) => void
  readonly onDecrement: () => void
  readonly onIncrement: () => void
  readonly canDecrement: boolean
  readonly canIncrement: boolean
}

/** The entry field's height inside the 44 px row. */
const ENTRY_HEIGHT = 36

/** Native only: the number pad has no return key, so + turns into Done while editing (web keeps Enter). */
const NATIVE_DONE = Platform.OS !== "web"

/**
 * A 44 px − value + row for the editor's forms. The player's `Stepper` is a 72 px numeral built to
 * be read at arm's length; two of them do not fit a 157 px column. Tapping the value turns it into
 * a number field in place (weight-entry.md §1); a ± press commits the draft first, then steps.
 */
export function CompactStepper({
  label,
  valueText,
  value,
  onCommit,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
}: CompactStepperProps) {
  const { colors } = useTheme()
  const edit = useInlineEdit(String(value), onCommit)
  const inputRef = useRef<TextInputInstance>(null)
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: sizes.tap }}>
      <IconButton
        icon="minus"
        accessibilityLabel={`Decrease ${label}`}
        disabled={!canDecrement}
        onPress={() => {
          edit.commit()
          onDecrement()
        }}
      />
      {edit.editing ? (
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          defaultValue={String(value)}
          onChangeText={edit.type}
          autoFocus
          selectTextOnFocus
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="done"
          onSubmitEditing={edit.commit}
          onBlur={edit.commit}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Escape") {
              edit.cancel()
            }
          }}
          style={[
            type.subhead,
            {
              flex: 1,
              minWidth: 0,
              height: ENTRY_HEIGHT,
              paddingHorizontal: space.xs,
              paddingVertical: 0,
              borderWidth: 1,
              borderColor: colors.accent,
              borderRadius: radius.sm,
              borderCurve: "continuous",
              backgroundColor: colors.surfaceRaised,
              color: colors.text,
              textAlign: "center",
              fontVariant: ["tabular-nums"],
            },
          ]}
        />
      ) : (
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}: ${valueText}`}
          accessibilityHint="Double tap to type a value"
          onPress={edit.start}
          style={{ flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}
        >
          <Text variant="subhead" tabular numberOfLines={1}>
            {valueText}
          </Text>
        </Pressable>
      )}
      {edit.editing && NATIVE_DONE ? (
        // The number pad has no return key on iOS: while editing, + is the Done that commits.
        <IconButton
          icon="check"
          accessibilityLabel={`Done editing ${label}`}
          onPress={() => inputRef.current?.blur()}
        />
      ) : (
        <IconButton
          icon="plus"
          accessibilityLabel={`Increase ${label}`}
          disabled={!canIncrement}
          onPress={() => {
            edit.commit()
            onIncrement()
          }}
        />
      )}
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
