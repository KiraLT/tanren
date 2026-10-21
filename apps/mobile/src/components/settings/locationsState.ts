import {
  type CatalogEquipment,
  type IdGenerator,
  LOCATION_PRESETS,
  type Location,
  type LocationId,
  LocationId as LocationIdSchema,
  type LocationPreset,
  newId,
  type Profile,
} from "@tanren/shared"
import { Effect, Match, Option } from "effect"
import type { ProfileState } from "../../hooks/useProfile"
import { type ProfileInvalid, ProfileRepo } from "../../services/ProfileRepo"
import type { StoreError } from "../../services/SqlDriver"

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
/** Longest location name (shared `Location.name`); the editor's `maxLength` too. */
export const MAX_LOCATION_NAME = 80

export const emptyLocations: LocationsState = { locations: [], activeLocationId: Option.none() }

/** List subtitle: "Bodyweight only", "1 item", "36 items". */
export const equipmentCountLabel = (location: Location): string =>
  location.equipment.length === 0
    ? "Bodyweight only"
    : `${location.equipment.length} ${location.equipment.length === 1 ? "item" : "items"}`

/** "Home", then "Home 2", "Home 3", … so two locations from one preset stay distinguishable. */
const freshName = (base: string, taken: ReadonlyArray<Location>): string => {
  const names = new Set(taken.map((location) => location.name))
  const suffix = [1, ...Array.from({ length: MAX_LOCATIONS }, (_, n) => n + 2)].find(
    (n) => !names.has(n === 1 ? base : `${base} ${n}`),
  )
  return suffix === undefined || suffix === 1 ? base : `${base} ${suffix}`
}

/** Edits one location; an unknown id, or an `f` that returns its input, gives `state` itself. */
const mapLocation = (
  state: LocationsState,
  id: LocationId,
  f: (location: Location) => Location,
): LocationsState => {
  const target = state.locations.find((location) => location.id === id)
  if (target === undefined) return state
  const edited = f(target)
  return edited === target
    ? state
    : {
        ...state,
        locations: state.locations.map((location) => (location === target ? edited : location)),
      }
}

/**
 * Pure edits of the locations; the first added location becomes active, removing the active one
 * promotes the first remaining location (none left → no active one), and no-ops (unknown id, blank
 * or unchanged name, an 11th location) return the very same state object, so callers can skip
 * the write with `next === current`.
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
      const trimmed = name.trim().slice(0, MAX_LOCATION_NAME)
      return trimmed.length === 0
        ? state
        : mapLocation(state, id, (location) =>
            location.name === trimmed ? location : { ...location, name: trimmed },
          )
    },
    Toggle: ({ id, equipment }) =>
      mapLocation(state, id, (location) => ({
        ...location,
        equipment: location.equipment.includes(equipment)
          ? location.equipment.filter((tag) => tag !== equipment)
          : [...location.equipment, equipment],
      })),
    Remove: ({ id }) => {
      if (!state.locations.some((location) => location.id === id)) return state
      const locations = state.locations.filter((location) => location.id !== id)
      return {
        locations,
        activeLocationId: Option.contains(state.activeLocationId, id)
          ? Option.map(Option.fromNullishOr(locations[0]), (first) => first.id)
          : state.activeLocationId,
      }
    },
    SetActive: ({ id }) =>
      state.locations.some((location) => location.id === id)
        ? { ...state, activeLocationId: Option.some(id) }
        : state,
  })

/** What the location editor route shows. */
export type LocationLookup =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "NotFound" }
  | { readonly _tag: "Found"; readonly location: Location; readonly active: boolean }

/**
 * Finds the route's location. `id` is the raw search param: a repeated `?id=` gives an array,
 * which names no location.
 */
export const lookupLocation = (
  state: ProfileState<LocationsState>,
  id: string | ReadonlyArray<string> | undefined,
): LocationLookup =>
  Match.valueTags(state, {
    Loading: (): LocationLookup => ({ _tag: "Loading" }),
    Loaded: ({ profile }): LocationLookup => {
      const location = Option.flatMap(profile, (found) =>
        Option.fromNullishOr(
          typeof id === "string"
            ? found.locations.find((candidate) => candidate.id === id)
            : undefined,
        ),
      )
      return Option.match(location, {
        onNone: () => ({ _tag: "NotFound" }),
        onSome: (found) => ({
          _tag: "Found",
          location: found,
          active: Option.exists(profile, (p) => Option.contains(p.activeLocationId, found.id)),
        }),
      })
    },
  })

const sliceOf = (profile: Option.Option<Profile>): LocationsState =>
  Option.match(profile, {
    onNone: () => emptyLocations,
    onSome: ({ locations, activeLocationId }): LocationsState => ({ locations, activeLocationId }),
  })

/**
 * Applies the action to the stored profile under `ProfileRepo.modify`'s lock (fast taps never lose
 * an edit) and saves the whole row dirty, creating the profile on first use. A no-op action writes
 * nothing. Succeeds with the resulting slice.
 */
export const applyLocations = (
  action: LocationsAction,
): Effect.Effect<LocationsState, StoreError | ProfileInvalid, ProfileRepo> =>
  Effect.gen(function* () {
    const repo = yield* ProfileRepo
    const saved = yield* repo.modify((profile) => {
      const current = sliceOf(profile)
      const next = reduceLocations(current, action)
      return next === current
        ? Option.none()
        : Option.some({ locations: next.locations, activeLocationId: next.activeLocationId })
    })
    return sliceOf(saved)
  })

/** Adds a location from a preset with a fresh id (IdGenerator); succeeds with that id. */
export const addPresetLocation = (
  preset: LocationPreset,
): Effect.Effect<LocationId, StoreError | ProfileInvalid, ProfileRepo | IdGenerator> =>
  Effect.gen(function* () {
    const id = yield* newId(LocationIdSchema)
    yield* applyLocations({ _tag: "AddPreset", preset, id })
    return id
  })
