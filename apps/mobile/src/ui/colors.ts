/**
 * The only file in `src/ui` (and the app) that holds colour literals (design §2.1). Everything else
 * reads colours through `useTheme().colors`, so light and dark stay one source of truth.
 */
export interface ColorRoles {
  /** Page background. */
  readonly bg: string
  /** Cards, rows, inputs. */
  readonly surface: string
  /** Stepper buttons, selected row, tab bar. */
  readonly surfaceRaised: string
  /** Hairlines (1 px) and outlines. */
  readonly border: string
  /** Primary text and numerals. */
  readonly text: string
  /** Secondary text (>= 4.5:1 on `bg` and `surface`). */
  readonly textMuted: string
  /** Primary button, next set, today. */
  readonly accent: string
  /** Text on `accent`. */
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
}

export const lightColors: ColorRoles = {
  bg: "#FFFFFF",
  surface: "#F4F4F5",
  surfaceRaised: "#FFFFFF",
  border: "#E4E4E7",
  text: "#18181B",
  textMuted: "#52525B",
  accent: "#C2410C",
  onAccent: "#FFFFFF",
  accentSoft: "#FCE9E0",
  success: "#1E7F3C",
  successSoft: "#E3F3E8",
  danger: "#B3261E",
  dangerSoft: "#FBE7E5",
  focus: "#1D4ED8",
  overlay: "rgba(0,0,0,0.18)",
}

export const darkColors: ColorRoles = {
  bg: "#121214",
  surface: "#1C1C1F",
  surfaceRaised: "#26262B",
  border: "#34343A",
  text: "#F4F4F5",
  textMuted: "#A1A1AA",
  accent: "#FF7A1A",
  onAccent: "#121214",
  accentSoft: "#3A2316",
  success: "#4ADE80",
  successSoft: "#15301F",
  danger: "#FF6B6B",
  dangerSoft: "#3A1A19",
  focus: "#93C5FD",
  overlay: "rgba(0,0,0,0.6)",
}

/** Static illustration colours, the same in both schemes (design §7). */
export const illustration = { figure: "#71717A", accent: "#F0632A" } as const
