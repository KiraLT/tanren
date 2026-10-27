import type { CatalogEquipment } from "@tanren/shared"
import { Option } from "effect"
import type { ConfirmRequest, IconName, ThemePreference } from "../../ui"

/** Why a sign-out did not happen (the `SignOutFailed` reasons), as the copy the screen shows. */
export const signOutFailureTitle = (reason: "offline" | "server"): string =>
  reason === "offline" ? "Sign-out needs a connection" : "Sign-out failed"

export const signOutFailureBody = (reason: "offline" | "server"): string =>
  reason === "offline"
    ? "Connect to the internet and try again. Nothing on this device changed."
    : "The server did not sign you out. Try again in a moment."

export const DISCONNECT_AI_TITLE = "Disconnect AI clients"

export const DISCONNECT_AI_NOTE = "Signs Claude and other apps out of your Tanren data."

export const DISCONNECT_AI_DONE_TITLE = "Claude and other apps must reconnect"

export const DISCONNECT_AI_DONE_BODY = "You stay signed in here."

/** Why "Disconnect AI clients" did not happen (the `DisconnectFailed` reasons). */
export const disconnectFailureTitle = (reason: "offline" | "server"): string =>
  reason === "offline" ? "Disconnecting needs a connection" : "Could not disconnect AI clients"

export const disconnectFailureBody = (reason: "offline" | "server"): string =>
  reason === "offline"
    ? "Connect to the internet and try again. Claude and other apps are still connected."
    : "The server did not revoke their access. Try again in a moment."

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

/**
 * Preset row subtitle: "Preset · Bodyweight only", "Preset · 1 item", "Preset · 36 items". The
 * prefix keeps an "Add gym" row from reading as a duplicate of the saved "Gym · 36 items".
 */
export const presetItemsLabel = (count: number): string =>
  `Preset · ${count === 0 ? "Bodyweight only" : `${count} ${count === 1 ? "item" : "items"}`}`

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

/** Settings → Data → Delete account (LEGAL-2, ADR-0024, legal.md §1.7). */
export const DELETE_ACCOUNT_TITLE = "Delete account"
export const DELETE_ACCOUNT_NOTE = "Remove your account and every record"
export const DELETE_ACCOUNT_WORKING = "Deleting…"

/** The confirm dialog (confirm-dialogs.md §3 row 1); the short label fits a 157 px button. */
export const DELETE_ACCOUNT_REQUEST: ConfirmRequest = {
  title: "Delete your account?",
  message:
    "Every workout, program and food entry is erased on this device and the server. This cannot be undone.",
  confirmLabel: "Delete all",
}

/** The confirm dialog (confirm-dialogs.md §3 row 3). */
export const DISCONNECT_AI_REQUEST: ConfirmRequest = {
  title: "Disconnect AI clients?",
  message: "Every connected Claude or ChatGPT loses access until you authorise it again.",
  confirmLabel: "Disconnect",
}

/** The confirm dialog (confirm-dialogs.md §3 row 9). */
export const deleteLocationRequest = (name: string): ConfirmRequest => ({
  title: `Delete ${name}?`,
  message:
    "Its equipment list is removed. If it is active, the Library switches to your first location.",
  confirmLabel: "Delete",
})

/** One line per failure reason; the account is untouched unless the reason is `local`. */
export const deleteAccountFailure = (reason: "offline" | "server" | "local"): string =>
  ({
    offline: "You are offline. Nothing was deleted. Try again when connected.",
    server: "The server could not delete the account. Nothing was deleted. Try again.",
    local:
      "Your account is deleted. Clear this site's data or reinstall the app to remove the copy on this device.",
  })[reason]
