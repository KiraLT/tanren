import type { CatalogExercise, CatalogId } from "@tanren/shared"
import { Option } from "effect"
import { View } from "react-native"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { Icon, ListGroup, ListRow, sizes, space, useTheme } from "../../ui"
import { swapSubtitle } from "./swapRows"

interface SwapListProps {
  /** The exercise as the program writes it (the swap key). */
  readonly original: CatalogExercise
  /** `swapCandidates`: up to 8, best first. */
  readonly candidates: ReadonlyArray<CatalogExercise>
  /** What the original is swapped to now; its row is marked. */
  readonly current: Option.Option<CatalogId>
  readonly busy: boolean
  readonly onChoose: (entry: CatalogExercise) => void
  readonly onRevert: () => void
}

/**
 * The swap sheet's list: one `ListRow` per candidate (title = name, subtitle = shared primary
 * muscles · equipment), and "Revert to original" below only while the original is swapped.
 */
export function SwapList({
  original,
  candidates,
  current,
  busy,
  onChoose,
  onRevert,
}: SwapListProps) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: space.lg }}>
      <ListGroup inset="thumb">
        {candidates.map((entry) => {
          const chosen = Option.exists(current, (id) => id === entry.catalogId)
          return (
            <ListRow
              key={entry.catalogId}
              thumb
              leading={
                <ExerciseIllustration catalogId={entry.catalogId} size={sizes.illustrationSm} />
              }
              title={entry.name}
              subtitle={swapSubtitle(original, entry)}
              trailing={
                chosen ? <Icon name="check" size={sizes.iconSm} color={colors.accent} /> : null
              }
              accessibilityLabel={`Swap to ${entry.name}`}
              selected={chosen}
              disabled={busy}
              onPress={() => onChoose(entry)}
            />
          )
        })}
      </ListGroup>
      {Option.isSome(current) ? (
        <ListGroup>
          <ListRow
            icon="repeat"
            title="Revert to original"
            subtitle={original.name}
            accessibilityLabel={`Revert to ${original.name}`}
            disabled={busy}
            onPress={onRevert}
          />
        </ListGroup>
      ) : null}
    </View>
  )
}
