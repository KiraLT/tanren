import type { Profile } from "@tanren/shared"
import { Option } from "effect"

// The one rule for "the user's profile": a deleted profile is no profile. The Garmin pull and the
// MCP nutrition tools both read the stored row once and ask these two functions about it.

/** No profile (or a deleted one) means UTC. */
const UTC = "UTC"

/** The stored profile when it is live; a soft-deleted one counts as absent. */
export const liveProfile = (stored: Option.Option<Profile>): Option.Option<Profile> =>
  Option.filter(stored, (profile) => Option.isNone(profile.deletedAt))

/** The live profile's IANA zone; no profile, or a deleted one, → UTC. */
export const zoneOfProfile = (stored: Option.Option<Profile>): string =>
  Option.match(liveProfile(stored), { onNone: () => UTC, onSome: (profile) => profile.timezone })
