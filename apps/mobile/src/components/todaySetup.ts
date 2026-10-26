import type { Profile } from "@tanren/shared"
import { Match, Option } from "effect"
import type { ProfileState } from "../hooks/useProfile"

export const SETUP_TITLE = "Set up your equipment"
export const SETUP_BODY = "Tell Tanren what your gym has"

/**
 * Today shows the setup card until the profile names at least one location (none yet → shown).
 * While the profile loads it stays hidden, so users with locations never see it flash.
 */
export const needsEquipmentSetup = (state: ProfileState<Pick<Profile, "locations">>): boolean =>
  Match.valueTags(state, {
    Loading: () => false,
    Loaded: ({ profile }) =>
      Option.match(profile, {
        onNone: () => true,
        onSome: ({ locations }) => locations.length === 0,
      }),
  })
