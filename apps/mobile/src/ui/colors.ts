/**
 * The only file in `src/ui` (and the app) that holds colour literals (ui-direction-final §2, "Forge":
 * A-style editorial light, C-style graphite dark with an amber accent). Everything else reads colours
 * through `useTheme().colors`, so light and dark stay one source of truth.
 */
export interface ColorRoles {
  /** Page background. */
  readonly bg: string
  /** Cards, grouped lists, pressed stepper. */
  readonly surface: string
  /** Sheets, popovers, muscle-map body fill. */
  readonly surfaceRaised: string
  /** Hairlines (1 px), todo discs, ring and progress tracks. */
  readonly border: string
  /** Primary text and numerals. */
  readonly text: string
  /** Secondary text (>= 4.5:1 on `bg` and `surface`). */
  readonly textMuted: string
  /** Primary pill, active tab, now-marks, meta icons. */
  readonly accent: string
  /** Text and glyphs on `accent`. */
  readonly onAccent: string
  /** Accent tint for selected/today backgrounds. */
  readonly accentSoft: string
  readonly success: string
  readonly successSoft: string
  readonly danger: string
  readonly dangerSoft: string
  /** Web keyboard focus ring (2 px). */
  readonly focus: string
  /** Banner shadow, scrim. */
  readonly overlay: string
  /** Primary pill `boxShadow` and numeral `textShadow` (`elevation.glow`); `transparent` in light. */
  readonly glow: string
}

export const lightColors: ColorRoles = {
  bg: "#FFFFFF",
  surface: "#F6F6F7",
  surfaceRaised: "#FFFFFF",
  border: "#E6E6E8",
  text: "#141416",
  textMuted: "#5F5F66",
  accent: "#C2410C",
  onAccent: "#FFFFFF",
  accentSoft: "#FCE9E0",
  success: "#1E7F3C",
  successSoft: "#E3F3E8",
  danger: "#B3261E",
  dangerSoft: "#FBE7E5",
  focus: "#1D4ED8",
  overlay: "rgba(0,0,0,0.18)",
  glow: "transparent",
}

export const darkColors: ColorRoles = {
  bg: "#0F1113",
  surface: "#181B1F",
  surfaceRaised: "#23272D",
  border: "#2C3137",
  text: "#F2F3F5",
  textMuted: "#A3A8B0",
  accent: "#FFB020",
  onAccent: "#141210",
  accentSoft: "#3A2A10",
  success: "#4ADE80",
  successSoft: "#15301F",
  danger: "#FF6B6B",
  dangerSoft: "#3A1A19",
  focus: "#93C5FD",
  overlay: "rgba(0,0,0,0.6)",
  glow: "rgba(255,176,32,0.35)",
}
