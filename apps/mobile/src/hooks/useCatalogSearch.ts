import { activeLocation, type CatalogExercise, type Location, searchCatalog } from "@tanren/shared"
import { Option } from "effect"
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
import { useProfile } from "./useProfile"

/**
 * Library search over the bundled catalog (offline, pure). Typing updates `state.input` at once;
 * the list follows `SEARCH_DEBOUNCE_MS` after the last keystroke. Facet changes apply at once.
 * With an active location (`location`) and `state.atLocation` on, only entries doable there show.
 */
export const useCatalogSearch = (): {
  readonly state: SearchState
  readonly dispatch: (action: SearchAction) => void
  readonly results: ReadonlyArray<CatalogExercise>
  readonly location: Option.Option<Location>
} => {
  const [state, dispatch] = useReducer(reduceSearch, initialSearch)
  const profile = useProfile()
  const location = useMemo(() => Option.flatMap(profile, activeLocation), [profile])
  const settling = isSettling(state)
  useEffect(() => {
    if (!settling) {
      return undefined
    }
    const timer = setTimeout(() => dispatch({ _tag: "Settled" }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [settling, state.input])
  const filter = useMemo(() => toFilter(state, location), [state, location])
  const results = useMemo(() => searchCatalog(filter), [filter])
  return { state, dispatch, results, location }
}
