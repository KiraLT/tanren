import type { CatalogExercise, CatalogId } from "@tanren/shared"
import { Option } from "effect"
import type { ReactElement } from "react"
import { FlatList, useWindowDimensions, View } from "react-native"
import { EmptyState, ListRow, sizes, useBreakpoint, useTheme } from "../ui"
import { listSeparatorStyle } from "../ui/controls"
import { clampSubtitle, entrySubtitle, subtitleMaxChars } from "./catalogFormat"
import { ExerciseIllustration } from "./ExerciseIllustration"

export interface CatalogListProps {
  readonly entries: ReadonlyArray<CatalogExercise>
  readonly selected: Option.Option<CatalogId>
  readonly onSelect: (id: CatalogId) => void
  /** Scrolls away with the list (the filter bar). */
  readonly header: ReactElement
}

/** Thumb rows draw no border of their own: the separator below is inset to the text start (84). */
const NO_ROW_BORDER = { borderBottomWidth: 0 } as const

/** The search results, virtualised: the catalog holds a few hundred entries. */
export function CatalogList({ entries, selected, onSelect, header }: CatalogListProps) {
  const { colors } = useTheme()
  // phone rows hold one subtitle line (64 px); wider layouts have the room and stay as they were
  const phone = useBreakpoint() === "phone"
  const { width } = useWindowDimensions()
  const subtitleFor = (item: CatalogExercise): string =>
    phone ? clampSubtitle(entrySubtitle(item), subtitleMaxChars(width)) : entrySubtitle(item)
  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.catalogId}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={listSeparatorStyle(colors, "thumb")} />}
      ListEmptyComponent={
        <EmptyState
          icon="search"
          title="No exercises found"
          body="Try another name or clear the filters."
        />
      }
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => (
        <ListRow
          thumb
          style={NO_ROW_BORDER}
          leading={<ExerciseIllustration catalogId={item.catalogId} size={sizes.illustrationSm} />}
          title={item.name}
          subtitle={subtitleFor(item)}
          accessibilityLabel={item.name}
          selected={Option.exists(selected, (id) => id === item.catalogId)}
          onPress={() => onSelect(item.catalogId)}
        />
      )}
    />
  )
}
