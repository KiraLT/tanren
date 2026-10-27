import { describe, expect, it } from "@effect/vitest"
import { LANDING } from "./landingCopy"

describe("LANDING copy", () => {
  it("has exactly the design §2 keys, in reading order", () => {
    expect(Object.keys(LANDING)).toEqual([
      "eyebrow",
      "meaning",
      "headline",
      "promise",
      "cta",
      "ctaNote",
      "features",
      "closing",
      "footer",
    ])
  })

  it("keeps the §2 texts verbatim", () => {
    expect(LANDING.eyebrow).toBe("鍛錬 · TANREN")
    expect(LANDING.meaning).toBe("tanren: forging. Disciplined training, repeated until it holds.")
    expect(LANDING.headline).toBe("Log the set. Forge the habit.")
    expect(LANDING.promise).toBe(
      "A gym logger built for the floor: prefilled weight and reps, big ± steppers, one tap per set, fully offline. Your own Claude reads the history and writes next week's plan.",
    )
    expect(LANDING.cta).toBe("Sign in")
    expect(LANDING.ctaNote).toBe("Magic link by email. No password.")
    expect(LANDING.closing).toBe("Ready to train?")
    expect(LANDING.footer).toEqual({
      name: "鍛錬 Tanren",
      domain: "tanren.me",
      operator: "© 2026 Tanren · Vilnius, Lithuania",
      contact: "hello@tanren.me",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
    })
  })

  it("lists four features with the §2 icons, titles and one distinct image slot each", () => {
    expect(LANDING.features).toHaveLength(4)
    expect(LANDING.features.map((feature) => feature.icon)).toEqual([
      "zap",
      "timer",
      "list",
      "calendar",
    ])
    expect(LANDING.features.map((feature) => feature.title)).toEqual([
      "Two taps per set",
      "Programs that run themselves",
      "A feed of what you did",
      "Claude plans the week",
    ])
    expect(LANDING.features.map((feature) => feature.image)).toEqual([
      "log",
      "program",
      "feed",
      "plan",
    ])
  })

  it("has no empty string anywhere", () => {
    const strings = [
      LANDING.eyebrow,
      LANDING.meaning,
      LANDING.headline,
      LANDING.promise,
      LANDING.cta,
      LANDING.ctaNote,
      LANDING.closing,
      LANDING.footer.name,
      LANDING.footer.domain,
      ...LANDING.features.flatMap((feature) => [feature.title, feature.body]),
    ]
    expect(strings).toHaveLength(17)
    expect(strings.filter((text) => text.trim().length === 0)).toEqual([])
  })
})
