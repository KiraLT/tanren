import { type CatalogId, findCatalogExercise } from "@tanren/shared"
import { Option } from "effect"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
import { View } from "react-native"
import { useCatalogSearch } from "../../hooks/useCatalogSearch"
import { LIBRARY_ROLE } from "../../library/addToToday"
import { CatalogDetail } from "../../library/CatalogDetail"
import { CatalogFilterBar } from "../../library/CatalogFilterBar"
import { CatalogList } from "../../library/CatalogList"
import { EmptyState, gutter, Page, useBreakpoint, useColumns } from "../../ui"

/** Inner aside width at which the illustration, map and meta column sit side by side. */
const INLINE_HERO_MIN_WIDTH = 584

/**
 * Train's Library segment (the former Library tab, ADR-0029): offline catalog search; detail
 * pushes on phone, sits in the aside at desktop.
 */
export function LibraryView({ header }: { readonly header: ReactNode }) {
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
      <EmptyState icon="dumbbell" headingLevel={2} title="Pick an exercise" body={LIBRARY_ROLE} />
    ),
    onSome: (entry) => (
      <View style={{ flex: 1 }}>
        <CatalogDetail key={entry.catalogId} entry={entry} inline={inline} />
      </View>
    ),
  })
  return (
    <Page header={header} aside={aside} split="5/7">
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
