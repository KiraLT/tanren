import { describe, expect, it } from "@effect/vitest"
import { magicLinkEmail } from "./magicLinkEmail"

const url = 'https://api.tanren.me/api/auth/magic-link/verify?token=a"b&callbackURL=%2F'
const escaped =
  "https://api.tanren.me/api/auth/magic-link/verify?token=a&quot;b&amp;callbackURL=%2F"
const base = { url, expiresInMinutes: 5, appName: "Tanren" }

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1

describe("magicLinkEmail", () => {
  const { subject, text, html } = magicLinkEmail(base)

  it("has the subject", () => {
    expect(subject).toBe("Sign in to Tanren")
  })

  it("puts the escaped url in the button href and once as visible text, never raw", () => {
    expect(count(html, escaped)).toBe(2)
    expect(html).toContain(`<a href="${escaped}"`)
    expect(html).toContain(`>${escaped}</td>`)
    expect(html).not.toContain('token=a"b')
  })

  it("text carries the raw url on its own line and the expiry", () => {
    expect(text.split("\n")).toContain(url)
    expect(text).toContain("expires in 5 minutes")
  })

  it("html states the expiry, singular for one minute", () => {
    expect(html).toContain("expires in 5 minutes")
    expect(magicLinkEmail({ ...base, expiresInMinutes: 1 }).html).toContain("expires in 1 minute.")
  })

  it("is a table layout with inline styles and no scripts or external sources", () => {
    expect(html).toContain("<table")
    expect(html).toContain('role="presentation"')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain("max-width:480px")
    expect(html).toContain("border-radius:999px")
    expect(html).toContain("#c2410c")
    expect(html).not.toContain("<script")
    expect(html).not.toMatch(/\ssrc=/)
    expect(html).not.toContain("<link")
    expect(html).not.toContain("@import")
    expect(html).not.toContain("#000000")
  })

  it("hides a preheader and shows the footer", () => {
    expect(html).toContain("display:none")
    expect(html).toContain("If you didn&#39;t, ignore this email.")
    expect(text).toContain("If you didn't, ignore this email.")
  })

  it("shows the legal footer line in both parts", () => {
    const line = "Tanren · tanren.me/privacy · tanren.me/terms · hello@tanren.me"
    expect(text).toContain(line)
    expect(html).toContain(`<br>${line}`)
  })

  it("escapes the app name and an optional support hint", () => {
    const out = magicLinkEmail({
      ...base,
      appName: "<b>T</b>",
      supportHint: 'Write to "me" <a@b.c>',
    })
    expect(out.html).not.toContain("<b>T</b>")
    expect(out.html).toContain("&lt;b&gt;T&lt;/b&gt;")
    expect(out.html).toContain("Write to &quot;me&quot; &lt;a@b.c&gt;")
    expect(out.text).toContain('Write to "me" <a@b.c>')
  })
})
