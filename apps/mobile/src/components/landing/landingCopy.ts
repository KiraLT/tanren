import type { IconName } from "../../ui/iconPaths"
import type { LandingImageId } from "./landingImages"

/** One feature card on the landing (design `landing.md` §2): icon, title, body and its image slot. */
export interface LandingFeatureCopy {
  readonly image: Exclude<LandingImageId, "hero">
  readonly icon: IconName
  readonly title: string
  readonly body: string
}

/** Every string the signed-out web landing shows, verbatim from design `landing.md` §2. */
export const LANDING = {
  eyebrow: "鍛錬 · TANREN",
  meaning: "tanren: forging. Disciplined training, repeated until it holds.",
  headline: "Log the set. Forge the habit.",
  promise:
    "A gym logger built for the floor: prefilled weight and reps, big ± steppers, one tap per set, fully offline. Your own Claude reads the history and writes next week's plan.",
  cta: "Sign in",
  ctaNote: "Magic link by email. No password.",
  features: [
    {
      image: "log",
      icon: "zap",
      title: "Two taps per set",
      body: "Weight and reps come prefilled from last time. Tap ±, tap Log set. The rest timer starts itself, online or not.",
    },
    {
      image: "program",
      icon: "timer",
      title: "Programs that run themselves",
      body: "Guided days like Core 30: seven exercises, fifteen minutes, timed holds and counted reps, rest built in.",
    },
    {
      image: "feed",
      icon: "list",
      title: "A feed of what you did",
      body: "Every session as a card: duration, volume, sets, PRs and the muscles you hit, newest first.",
    },
    {
      image: "plan",
      icon: "calendar",
      title: "Claude plans the week",
      body: "Connect your own Claude through MCP. It reads your history and writes the plan into the app. The app itself never calls an AI.",
    },
  ],
  closing: "Ready to train?",
  footer: {
    name: "鍛錬 Tanren",
    domain: "tanren.me",
    operator: "© 2026 Tanren · Vilnius, Lithuania",
    contact: "hello@tanren.me",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
} as const satisfies {
  readonly eyebrow: string
  readonly meaning: string
  readonly headline: string
  readonly promise: string
  readonly cta: string
  readonly ctaNote: string
  readonly features: ReadonlyArray<LandingFeatureCopy>
  readonly closing: string
  readonly footer: {
    readonly name: string
    readonly domain: string
    readonly operator: string
    readonly contact: string
    readonly links: ReadonlyArray<{ readonly label: string; readonly href: "/privacy" | "/terms" }>
  }
}
