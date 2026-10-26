import type { CatalogEquipment } from "@tanren/shared"
import { Option } from "effect"
import type { IconName, ThemePreference } from "../../ui"

/** Why a sign-out did not happen (the `SignOutFailed` reasons), as the copy the screen shows. */
export const signOutFailureTitle = (reason: "offline" | "server"): string =>
  reason === "offline" ? "Sign-out needs a connection" : "Sign-out failed"

export const signOutFailureBody = (reason: "offline" | "server"): string =>
  reason === "offline"
    ? "Connect to the internet and try again. Nothing on this device changed."
    : "The server did not sign you out. Try again in a moment."

export const SIGNED_OUT_NATIVE_TITLE = "Signed out. Reopen the app to finish."

export const KEPT_DATA_NOTE = "Data on this device is kept."

export const UNITS_NOTE = "Kilograms (kg). Pounds are not supported."

export const EXPORT_NATIVE_TITLE = "Export on the web app"

export const EXPORT_NATIVE_NOTE = "Open tanren.me in a browser to download your data as JSON."

export const APPEARANCE_OPTIONS: ReadonlyArray<{
  readonly value: ThemePreference
  readonly label: string
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

/** Preset row subtitle: "Bodyweight only", "1 item", "24 items". */
export const presetItemsLabel = (count: number): string =>
  count === 0 ? "Bodyweight only" : `${count} ${count === 1 ? "item" : "items"}`

/** Caption under the location name: "No items selected", "1 item selected", "5 items selected". */
export const itemsSelectedLabel = (count: number): string =>
  count === 0 ? "No items selected" : `${count} ${count === 1 ? "item" : "items"} selected`

/** The leading glyph of an equipment chip, where the icon set has one. */
export const equipmentGlyph = (equipment: CatalogEquipment): Option.Option<IconName> =>
  Option.fromNullishOr(EQUIPMENT_GLYPHS[equipment])

/** Keyed by the catalog's equipment literals (a misspelt key is a compile error); no entry = bare. */
const EQUIPMENT_GLYPHS: Readonly<Partial<Record<CatalogEquipment, IconName>>> = {
  barbell: "dumbbell",
  dumbbell: "dumbbell",
  kettlebell: "kettlebell",
  band: "band",
  pullUpBar: "bodyweight",
}

/** `Tanren 0.1.0`; just `Tanren` when the app config has no version. */
export const aboutTitle = (version: string | undefined): string =>
  version === undefined || version.length === 0 ? "Tanren" : `Tanren ${version}`
