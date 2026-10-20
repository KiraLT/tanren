/** Gym palette: near-black, white text, one ember accent. Contrast is >= 7:1 for text on bg. */
export const colors = {
  background: "#0C0C0D",
  surface: "#1A1A1D",
  surfaceRaised: "#26262B",
  border: "#3A3A41",
  text: "#FFFFFF",
  textMuted: "#B4B4BC",
  accent: "#FF7A1A",
  onAccent: "#0C0C0D",
  success: "#5CE08A",
  danger: "#FF6B6B",
} as const

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const

/** Minimum tap target; the primary controls use the larger sizes. */
export const sizes = {
  tap: 56,
  stepperButton: 84,
  logButton: 96,
  contentMaxWidth: 560,
} as const

export const radius = { md: 16, lg: 24 } as const
