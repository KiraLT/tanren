import { type CatalogExercise, searchCatalog } from "@tanren/shared"
import { useEffect, useMemo, useReducer } from "react"
import {
  initialSearch,
  isSettling,
  reduceSearch,
  SEARCH_DEBOUNCE_MS,
  type SearchAction,
  type SearchState,
  toFilter,
} from "../library/searchState"

/**
 * Library search over the bundled catalog (offline, pure). Typing updates `state.input` at once;
 * the list follows `SEARCH_DEBOUNCE_MS` after the last keystroke. Facet changes apply at once.
 */
export const useCatalogSearch = (): {
  readonly state: SearchState
  readonly dispatch: (action: SearchAction) => void
  readonly results: ReadonlyArray<CatalogExercise>
} => {
  const [state, dispatch] = useReducer(reduceSearch, initialSearch)
  const settling = isSettling(state)
  useEffect(() => {
    if (!settling) {
      return undefined
    }
    const timer = setTimeout(() => dispatch({ _tag: "Settled" }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [settling, state.input])
  const filter = useMemo(() => toFilter(state), [state])
  const results = useMemo(() => searchCatalog(filter), [filter])
  return { state, dispatch, results }
}
