import type { CatalogEquipment, CatalogFilter, ExerciseKind, MuscleGroup } from "@tanren/shared"
import { Match, Option } from "effect"

/** How long typing must pause before the list re-filters (v2-catalog.md §7). */
export const SEARCH_DEBOUNCE_MS = 150

/**
 * Library search state. `input` is what the field shows; `query` is the text the list is
 * filtered by, which catches up with `input` once typing pauses (`Settled`). Facets apply at once.
 */
export interface SearchState {
  readonly input: string
  readonly query: string
  readonly muscle: Option.Option<MuscleGroup>
  readonly equipment: Option.Option<CatalogEquipment>
  readonly kind: Option.Option<ExerciseKind>
}

export type SearchAction =
  | { readonly _tag: "Typed"; readonly text: string }
  | { readonly _tag: "Settled" }
  | { readonly _tag: "Muscle"; readonly value: Option.Option<MuscleGroup> }
  | { readonly _tag: "Equipment"; readonly value: Option.Option<CatalogEquipment> }
  | { readonly _tag: "Kind"; readonly value: Option.Option<ExerciseKind> }
  | { readonly _tag: "Cleared" }

export const initialSearch: SearchState = {
  input: "",
  query: "",
  muscle: Option.none(),
  equipment: Option.none(),
  kind: Option.none(),
}

export const reduceSearch = (state: SearchState, action: SearchAction): SearchState =>
  Match.valueTags(action, {
    Typed: ({ text }) => ({ ...state, input: text }),
    Settled: () => ({ ...state, query: state.input }),
    Muscle: ({ value }) => ({ ...state, muscle: value }),
    Equipment: ({ value }) => ({ ...state, equipment: value }),
    Kind: ({ value }) => ({ ...state, kind: value }),
    Cleared: () => initialSearch,
  })

/** True while the typed text has not been searched yet (a debounce is due). */
export const isSettling = (state: SearchState): boolean => state.input !== state.query

/** The `searchCatalog` filter: only the keys that are set (exactOptionalPropertyTypes). */
export const toFilter = (state: SearchState): CatalogFilter => {
  const query = state.query.trim()
  return {
    ...(query.length === 0 ? {} : { query }),
    ...Option.match(state.muscle, { onNone: () => ({}), onSome: (muscle) => ({ muscle }) }),
    ...Option.match(state.equipment, {
      onNone: () => ({}),
      onSome: (equipment) => ({ equipment }),
    }),
    ...Option.match(state.kind, { onNone: () => ({}), onSome: (kind) => ({ kind }) }),
  }
}

/** Whether anything narrows the list (shows the "Clear filters" action). */
export const hasFilter = (state: SearchState): boolean =>
  state.input.trim().length > 0 ||
  Option.isSome(state.muscle) ||
  Option.isSome(state.equipment) ||
  Option.isSome(state.kind)
