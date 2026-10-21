import { Option } from "effect"
import type { Location, Profile } from "../user"
import type { CatalogExercise } from "./CatalogExercise"
import type { CatalogEquipment } from "./taxonomy"

type NeedsEquipment = Pick<CatalogExercise, "equipment">

/** Available when every implement the entry needs is at hand; `[]` (bodyweight) always is. */
export const isAvailableWith =
  (available: ReadonlyArray<CatalogEquipment>) =>
  (entry: NeedsEquipment): boolean =>
    entry.equipment.every((tag) => available.includes(tag))

/** What the location lacks for this entry, in the entry's tag order; `[]` when available. */
export const missingEquipment = (
  entry: NeedsEquipment,
  location: Location,
): ReadonlyArray<CatalogEquipment> =>
  entry.equipment.filter((tag) => !location.equipment.includes(tag))

/** The profile's active location; `None` when none is set (everything is available). */
export const activeLocation = (
  profile: Pick<Profile, "locations" | "activeLocationId">,
): Option.Option<Location> =>
  Option.flatMap(profile.activeLocationId, (id) =>
    Option.fromNullishOr(profile.locations.find((location) => location.id === id)),
  )
