import { type CatalogId, findCatalogExercise } from "@tanren/shared"
import { Option } from "effect"
import { useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { useCatalogSearch } from "../../src/hooks/useCatalogSearch"
import { CatalogDetail } from "../../src/library/CatalogDetail"
import { CatalogFilterBar } from "../../src/library/CatalogFilterBar"
import { CatalogList } from "../../src/library/CatalogList"
import { AppBar, EmptyState, gutter, Page, useBreakpoint, useColumns } from "../../src/ui"

/** Inner aside width at which the illustration, map and meta column sit side by side. */
const INLINE_HERO_MIN_WIDTH = 584

/** Library: offline catalog search; detail pushes on phone, sits in the aside at desktop. */
export default function LibraryScreen() {
  const router = useRouter()
  const breakpoint = useBreakpoint()
  const wide = breakpoint === "desktop"
  // The inline hero needs 584 px inside the aside: true at 1280 (648 - 2 * 32), false at 900.
  const inline = useColumns("5/7").side - 2 * gutter.desktop >= INLINE_HERO_MIN_WIDTH
  const { state, dispatch, results, location } = useCatalogSearch()
  const [selected, setSelected] = useState<Option.Option<CatalogId>>(Option.none())
  const onSelect = (id: CatalogId) => {
    if (wide) {
      setSelected(Option.some(id))
      return
    }
    // biome-ignore lint/plugin/noMutation: expo-router push
    router.push({ pathname: "/library/[catalogId]", params: { catalogId: id } })
  }
  const aside = Option.match(Option.flatMap(selected, findCatalogExercise), {
    onNone: () => (
      <EmptyState
        icon="dumbbell"
        title="Pick an exercise"
        body="Its illustration and instructions show here."
      />
    ),
    onSome: (entry) => (
      <View style={{ flex: 1, paddingHorizontal: gutter.desktop }}>
        <CatalogDetail key={entry.catalogId} entry={entry} inline={inline} />
      </View>
    ),
  })
  return (
    <Page header={<AppBar title="Library" />} aside={aside} split="5/7">
      <CatalogList
        entries={results}
        selected={wide ? selected : Option.none()}
        onSelect={onSelect}
        header={
          <CatalogFilterBar
            state={state}
            dispatch={dispatch}
            count={results.length}
            location={location}
          />
        }
      />
    </Page>
  )
}
