import {
  type CatalogEquipment,
  LOCATION_PRESETS,
  type Location,
  type LocationId,
  type LocationPreset,
  type Profile,
} from "@tanren/shared"
import { Match, Option } from "effect"

/** The slice of the profile the equipment screens edit (equipment.md §6). */
export type LocationsState = Pick<Profile, "locations" | "activeLocationId">

export type LocationsAction =
  /** `id` comes from `IdGenerator` (the hook), so the reducer stays pure. */
  | { readonly _tag: "AddPreset"; readonly preset: LocationPreset; readonly id: LocationId }
  | { readonly _tag: "Rename"; readonly id: LocationId; readonly name: string }
  | { readonly _tag: "Toggle"; readonly id: LocationId; readonly equipment: CatalogEquipment }
  | { readonly _tag: "Remove"; readonly id: LocationId }
  | { readonly _tag: "SetActive"; readonly id: LocationId }

/** `Profile.locations` holds at most 10 (shared `Locations`). */
export const MAX_LOCATIONS = 10
const MAX_NAME = 80

export const emptyLocations: LocationsState = { locations: [], activeLocationId: Option.none() }

/** "Home", then "Home 2", "Home 3", … so two locations from one preset stay distinguishable. */
const freshName = (base: string, taken: ReadonlyArray<Location>): string => {
  const names = new Set(taken.map((location) => location.name))
  const suffix = [1, ...Array.from({ length: MAX_LOCATIONS }, (_, n) => n + 2)].find(
    (n) => !names.has(n === 1 ? base : `${base} ${n}`),
  )
  return suffix === undefined || suffix === 1 ? base : `${base} ${suffix}`
}

const mapLocation = (
  state: LocationsState,
  id: LocationId,
  f: (location: Location) => Location,
): LocationsState => ({
  ...state,
  locations: state.locations.map((location) => (location.id === id ? f(location) : location)),
})

/**
 * Pure edits of the locations; the first added location becomes active, removing the active one
 * clears it, and no-ops (unknown id, blank name, an 11th location) return the state unchanged.
 */
export const reduceLocations = (state: LocationsState, action: LocationsAction): LocationsState =>
  Match.valueTags(action, {
    AddPreset: ({ preset, id }) => {
      if (state.locations.length >= MAX_LOCATIONS) return state
      const { name, equipment } = LOCATION_PRESETS[preset]
      return {
        locations: [
          ...state.locations,
          { id, name: freshName(name, state.locations), equipment: [...equipment] },
        ],
        activeLocationId: Option.orElse(state.activeLocationId, () => Option.some(id)),
      }
    },
    Rename: ({ id, name }) => {
      const trimmed = name.trim().slice(0, MAX_NAME)
      return trimmed.length === 0
        ? state
        : mapLocation(state, id, (location) => ({ ...location, name: trimmed }))
    },
    Toggle: ({ id, equipment }) =>
      mapLocation(state, id, (location) => ({
        ...location,
        equipment: location.equipment.includes(equipment)
          ? location.equipment.filter((tag) => tag !== equipment)
          : [...location.equipment, equipment],
      })),
    Remove: ({ id }) => ({
      locations: state.locations.filter((location) => location.id !== id),
      activeLocationId: Option.filter(state.activeLocationId, (active) => active !== id),
    }),
    SetActive: ({ id }) =>
      state.locations.some((location) => location.id === id)
        ? { ...state, activeLocationId: Option.some(id) }
        : state,
  })
