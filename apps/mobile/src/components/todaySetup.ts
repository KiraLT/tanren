import type { Profile } from "@tanren/shared"
import { Option } from "effect"

export const SETUP_TITLE = "Set up your equipment"
export const SETUP_BODY = "Tell Tanren what your gym has."

/** Today shows the setup card until the profile names at least one location (none yet → shown). */
export const needsEquipmentSetup = (profile: Option.Option<Pick<Profile, "locations">>): boolean =>
  Option.match(profile, {
    onNone: () => true,
    onSome: ({ locations }) => locations.length === 0,
  })
