import { describe, expect, it } from "@effect/vitest"
import { Array as Arr } from "effect"
import { type ConsentView, consentPage, PAGE_CSP } from "./pages"

const base: ConsentView = {
  clientId: "https://claude.ai/oauth/claude-code-client-metadata",
  clientName: "Claude Code",
  clientDomain: "claude.ai",
  redirectUri: "http://localhost:53123/callback",
  redirectHost: "localhost:53123",
  redirectIsLoopback: true,
  scope: ["tanren:read", "tanren:write"],
  trust: { _tag: "Known", name: "Claude", domain: "claude.ai" },
}

const unknown: ConsentView = {
  clientId: "dcr-client-1",
  clientName: 'Claude"><script>alert(1)</script>',
  redirectUri: "https://evil.example/<cb>",
  redirectHost: "evil.example<b>",
  redirectIsLoopback: false,
  scope: ["tanren:read"],
  trust: { _tag: "Unknown" },
}

describe("consentPage", () => {
  it("a known app shows its name, the verified line and no warning", () => {
    const page = consentPage(base, "h-1")
    expect(page).toContain("Allow <span>Claude</span>")
    expect(page).toContain(
      "Verified app · claude.ai. Only continue if you just started this in Claude.",
    )
    expect(page).not.toContain("Unknown app")
    expect(page).toContain('value="approve">Allow</button>')
    expect(page).not.toContain("<script")
  })

  it("an unknown app shows the warning with its escaped name and redirect host", () => {
    const page = consentPage(unknown, "h-2")
    expect(page).toContain("<h2>Unknown app</h2>")
    expect(page).toContain("Tanren can't verify who built this app.")
    expect(page).toContain(
      'It calls itself "Claude&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;" and will return you to evil.example&lt;b&gt;.',
    )
    expect(page).toContain('value="approve">Allow anyway</button>')
    expect(page).not.toContain("Verified app")
    expect(page).not.toContain("<script")
    expect(page).not.toContain("<b>")
  })

  it("wears the Forge frame: wordmark, legal footer, no third-party host (OAUTH-UI)", () => {
    const page = consentPage(base, "h-4")
    expect(page).toContain('class="wordmark" href="https://tanren.me"')
    expect(page).toContain('<a href="https://tanren.me/privacy">Privacy</a>')
    expect(page).toContain('<a href="https://tanren.me/terms">Terms</a>')
    expect(page).toContain("prefers-color-scheme:dark")
    const hosts = Arr.dedupe(
      Arr.fromIterable(page.matchAll(/https?:\/\/([^/"' ]+)/g)).map((m) => m[1]),
    )
    expect(hosts).toEqual(["tanren.me"])
  })

  it("Deny stays a submit button with the frozen name/value", () => {
    expect(consentPage(base, "h-5")).toContain(
      'type="submit" name="decision" value="deny">Deny</button>',
    )
  })

  it("the CSP allows inline styles, the data: wordmark and same-origin fonts only", () => {
    expect(PAGE_CSP).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    )
    expect(consentPage(base, "h-6")).not.toContain("<script")
  })

  it("the h1 uses the display face from this Worker, no third-party font host", () => {
    const page = consentPage(base, "h-7")
    expect(page).toContain(
      '@font-face{font-family:"Barlow Condensed";font-style:normal;font-weight:800;font-display:swap;src:url("/oauth/assets/barlow-condensed-800.woff2") format("woff2")}',
    )
    expect(page).toContain('h1{margin:0;font-family:"Barlow Condensed",')
    expect(page).toContain("font-size:28px;line-height:30px")
    expect(page).toContain("@media (min-width:900px){h1{font-size:34px;line-height:38px}}")
    expect(page).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })

  it("an unknown CIMD client also names the host of its document", () => {
    const page = consentPage(
      { ...unknown, clientDomain: "example.com", trust: { _tag: "Unknown" } },
      "h-3",
    )
    expect(page).toContain("Unknown app")
    expect(page).toContain("Its identity document is hosted on example.com.")
  })
})
