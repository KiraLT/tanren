import type { ThemePreference } from "../../ui"

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

/** `Tanren 0.1.0`; just `Tanren` when the app config has no version. */
export const aboutTitle = (version: string | undefined): string =>
  version === undefined || version.length === 0 ? "Tanren" : `Tanren ${version}`
