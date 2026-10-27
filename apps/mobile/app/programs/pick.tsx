import type { CatalogExercise, ProgramId } from "@tanren/shared"
import { Option } from "effect"
import { useLocalSearchParams } from "expo-router"
import { FlatList, TextInput, useWindowDimensions, View } from "react-native"
import {
  appendItem,
  itemFromCatalog,
  parsePickFor,
  updateDay,
} from "../../src/components/programs/programEdit"
import { useGoBack } from "../../src/components/programs/useGoBack"
import { useProgramUpdate } from "../../src/components/programs/useProgramEditor"
import { useCatalogSearch } from "../../src/hooks/useCatalogSearch"
import {
  atLocationLabel,
  clampSubtitle,
  entrySubtitle,
  subtitleMaxChars,
} from "../../src/library/catalogFormat"
import { ExerciseIllustration } from "../../src/library/ExerciseIllustration"
import {
  AppBar,
  Banner,
  EmptyState,
  IconButton,
  ListRow,
  Page,
  radius,
  sizes,
  space,
  ToggleChip,
  type,
  useBreakpoint,
  useTheme,
} from "../../src/ui"
import { listSeparatorStyle } from "../../src/ui/controls"

const NO_ROW_BORDER = { borderBottomWidth: 0 } as const

interface PickerProps {
  readonly programId: ProgramId
  readonly dayNumber: number
}

function Picker({ programId, dayNumber }: PickerProps) {
  const { colors } = useTheme()
  const back = useGoBack({ pathname: "/programs/edit/[programId]", params: { programId } })
  const { state, dispatch, results, location } = useCatalogSearch()
  const { updateAndLeave, busy, error } = useProgramUpdate()
  const phone = useBreakpoint() === "phone"
  const { width } = useWindowDimensions()
  const choose = (entry: CatalogExercise) =>
    // Leave: once saved the picker ignores every tap until it is gone (no second exercise).
    updateAndLeave(programId, (draft) => ({
      ...draft,
      days: updateDay(draft.days, dayNumber, (day) => appendItem(day, itemFromCatalog(entry))),
    })).then((saved) => {
      if (saved) {
        back()
      }
    })
  const header = (
    <View style={{ gap: space.sm, paddingBottom: space.sm }}>
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not add the exercise" body={message} />
        ),
      })}
      {Option.match(location, {
        onNone: () => null,
        onSome: (active) => (
          <ToggleChip
            variant="outline"
            compact
            style={{ alignSelf: "flex-start" }}
            icon="mapPin"
            label={atLocationLabel(active)}
            selected={state.atLocation}
            onPress={() => dispatch({ _tag: "AtLocation", value: !state.atLocation })}
          />
        ),
      })}
      <TextInput
        value={state.input}
        onChangeText={(text) => dispatch({ _tag: "Typed", text })}
        placeholder="Search exercises"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search exercises"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[
          type.body,
          {
            minHeight: sizes.control,
            paddingHorizontal: space.lg,
            borderRadius: radius.md,
            borderCurve: "continuous",
            backgroundColor: colors.surface,
            color: colors.text,
          },
        ]}
      />
    </View>
  )
  return (
    <Page
      header={
        <AppBar
          title="Add exercise"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      <FlatList
        data={results}
        keyExtractor={(entry) => entry.catalogId}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={listSeparatorStyle(colors, "thumb")} />}
        ListEmptyComponent={
          <EmptyState
            icon="search"
            headingLevel={2}
            title="No exercises found"
            body="Try another name or turn off the location filter."
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <ListRow
            thumb
            style={NO_ROW_BORDER}
            leading={
              <ExerciseIllustration catalogId={item.catalogId} size={sizes.illustrationSm} />
            }
            title={item.name}
            subtitle={
              phone
                ? clampSubtitle(entrySubtitle(item), subtitleMaxChars(width))
                : entrySubtitle(item)
            }
            accessibilityLabel={`Add ${item.name}`}
            disabled={busy}
            onPress={() => choose(item)}
          />
        )}
      />
    </Page>
  )
}

export default function PickExerciseScreen() {
  const back = useGoBack("/programs")
  const { pickFor } = useLocalSearchParams<{ pickFor: string }>()
  return Option.match(parsePickFor(pickFor), {
    onSome: ({ programId, dayNumber }) => <Picker programId={programId} dayNumber={dayNumber} />,
    onNone: () => (
      <Page
        header={
          <AppBar
            title="Add exercise"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        <EmptyState
          icon="warning"
          headingLevel={2}
          title="No day to add to"
          body="Open this from a day in the editor."
        />
      </Page>
    ),
  })
}
