import { describe, expect, it } from "@effect/vitest"
import { type ConsentView, consentPage } from "./pages"

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
    expect(page).toContain("Verified app · claude.ai")
    expect(page).not.toContain("Unknown app")
    expect(page).toContain('value="approve">Approve</button>')
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

  it("an unknown CIMD client also names the host of its document", () => {
    const page = consentPage(
      { ...unknown, clientDomain: "example.com", trust: { _tag: "Unknown" } },
      "h-3",
    )
    expect(page).toContain("Unknown app")
    expect(page).toContain("Its identity document is hosted on example.com.")
  })
})
