import type { CatalogExercise, CatalogId } from "@tanren/shared"
import { Option } from "effect"
import type { ReactElement } from "react"
import { FlatList } from "react-native"
import { EmptyState, ListRow } from "../ui"
import { entrySubtitle } from "./catalogFormat"

export interface CatalogListProps {
  readonly entries: ReadonlyArray<CatalogExercise>
  readonly selected: Option.Option<CatalogId>
  readonly onSelect: (id: CatalogId) => void
  /** Scrolls away with the list (the filter bar). */
  readonly header: ReactElement
}

/** The search results, virtualised: the catalog holds a few hundred entries. */
export function CatalogList({ entries, selected, onSelect, header }: CatalogListProps) {
  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.catalogId}
      ListHeaderComponent={header}
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
          title={item.name}
          subtitle={entrySubtitle(item)}
          accessibilityLabel={item.name}
          selected={Option.exists(selected, (id) => id === item.catalogId)}
          onPress={() => onSelect(item.catalogId)}
        />
      )}
    />
  )
}
