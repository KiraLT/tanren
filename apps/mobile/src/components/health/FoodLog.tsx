import type { FoodEntry, FoodEntryId } from "@tanren/shared"
import { Option } from "effect"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { Banner, IconButton, ListGroup, ListRow, space } from "../../ui"
import { type PendingUndo, rowSubtitle, rowTitle, sortNewestFirst, stepUndo } from "./foodLogRows"

export interface FoodLogProps {
  readonly entries: ReadonlyArray<FoodEntry>
  readonly onDelete: (id: FoodEntryId) => void
  readonly onRestore: (id: FoodEntryId) => void
}

/**
 * The day's food entries, newest first (nutrition.md §6). Delete calls `onDelete` at once and shows
 * "Entry deleted" with Undo for 15 s; a second delete replaces the pending Undo. Empty: nothing.
 */
export function FoodLog({ entries, onDelete, onRestore }: FoodLogProps) {
  const [pending, setPending] = useState<Option.Option<PendingUndo>>(Option.none())

  // One timer per pending deletion, cleared when it changes or the list unmounts.
  useEffect(() => {
    if (Option.isNone(pending)) {
      return undefined
    }
    const timer = setTimeout(
      () => setPending((current) => stepUndo(current, { _tag: "Tick", now: Date.now() }).pending),
      Math.max(0, pending.value.until - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [pending])

  const remove = (id: FoodEntryId) => {
    onDelete(id)
    setPending((current) => stepUndo(current, { _tag: "Delete", id, now: Date.now() }).pending)
  }
  const undo = () => {
    const step = stepUndo(pending, { _tag: "Undo" })
    setPending(step.pending)
    Option.map(step.restore, onRestore)
  }

  if (entries.length === 0 && Option.isNone(pending)) {
    return null
  }
  return (
    <View style={{ gap: space.md }}>
      {Option.match(pending, {
        onNone: () => null,
        onSome: () => (
          <Banner tone="info" title="Entry deleted" action={{ label: "Undo", onPress: undo }} />
        ),
      })}
      {entries.length === 0 ? null : (
        <ListGroup>
          {sortNewestFirst(entries).map((entry) => {
            const title = rowTitle(entry)
            return (
              <ListRow
                key={entry.id}
                title={title}
                subtitle={rowSubtitle(entry)}
                trailing={
                  <IconButton
                    icon="trash"
                    accessibilityLabel={`Delete ${title}`}
                    onPress={() => remove(entry.id)}
                  />
                }
              />
            )
          })}
        </ListGroup>
      )}
    </View>
  )
}
