import { describe, expect, it } from "@effect/vitest"
import { mcpLandingPage, mcpLandingResponse } from "./McpLanding"

describe("McpLanding", () => {
  it("names the connector URL and links the web app, with no script", () => {
    const page = mcpLandingPage("https://mcp.tanren.me/mcp")
    expect(page).toContain("<code>https://mcp.tanren.me/mcp</code>")
    expect(page).toContain('href="https://tanren.me"')
    expect(page).not.toContain("<script")
  })

  it("escapes the configured URL", () => {
    expect(mcpLandingPage('https://x.test/mcp"<b>')).toContain("https://x.test/mcp&quot;&lt;b&gt;")
  })

  it("HEAD has the headers and no body", async () => {
    const response = mcpLandingResponse(
      new Request("https://mcp.tanren.me/", { method: "HEAD" }),
      "https://mcp.tanren.me/mcp",
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600")
    expect(await response.text()).toBe("")
  })
})
