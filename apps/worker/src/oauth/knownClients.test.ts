import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { CLAUDE_CODE_DOCUMENT, type ClientTrustInput, clientTrust } from "./knownClients"

const CHATGPT_DOCUMENT = "https://chatgpt.com/oauth/client.json"

/** A verified CIMD client: `clientDomain` is the document URL's hostname, as the provider sets it. */
const cimd = (
  clientId: string,
  redirectHost: string,
  redirectIsLoopback = false,
): ClientTrustInput => ({
  clientId,
  clientDomain: Option.some(new URL(clientId).hostname),
  redirectHost,
  redirectIsLoopback,
})

describe("clientTrust", () => {
  it("Claude Code's document with its loopback callback is Known as Claude", () => {
    expect(clientTrust(cimd(CLAUDE_CODE_DOCUMENT, "localhost", true))).toEqual({
      _tag: "Known",
      name: "Claude",
      domain: "claude.ai",
    })
  })

  it("ChatGPT's document with its connector redirect is Known as ChatGPT", () => {
    expect(clientTrust(cimd(CHATGPT_DOCUMENT, "chatgpt.com"))).toEqual({
      _tag: "Known",
      name: "ChatGPT",
      domain: "chatgpt.com",
    })
  })

  it("a per-connection ChatGPT document is Known", () => {
    expect(
      clientTrust(cimd("https://chatgpt.com/oauth/cb-123/client.json", "chatgpt.com")),
    ).toEqual({ _tag: "Known", name: "ChatGPT", domain: "chatgpt.com" })
  })

  it("a claude.ai web document returning to claude.ai is Known", () => {
    expect(clientTrust(cimd("https://claude.ai/oauth/mcp-client.json", "claude.ai"))._tag).toBe(
      "Known",
    )
  })

  it.each<readonly [string, ClientTrustInput]>([
    ["a trusted document with a foreign redirect", cimd(CHATGPT_DOCUMENT, "evil.example")],
    [
      "a trusted host's document redirecting to a subdomain",
      cimd(CHATGPT_DOCUMENT, "x.chatgpt.com"),
    ],
    [
      "a subdomain of a trusted host",
      cimd("https://www.claude.ai/oauth/client.json", "www.claude.ai"),
    ],
    ["a path outside /oauth/", cimd("https://claude.ai/uploads/client.json", "claude.ai")],
    ["a look-alike host", cimd("https://claude.ai.evil.com/oauth/c.json", "claude.ai.evil.com")],
    ["a non-default port", cimd("https://claude.ai:8443/oauth/c.json", "claude.ai")],
    [
      "another trusted document with a loopback redirect",
      cimd(CHATGPT_DOCUMENT, "localhost", true),
    ],
    ["Claude Code's document with a foreign redirect", cimd(CLAUDE_CODE_DOCUMENT, "evil.example")],
    [
      "a registered client (no clientDomain) with a trusted-looking id",
      { ...cimd(CLAUDE_CODE_DOCUMENT, "localhost", true), clientDomain: Option.none() },
    ],
    [
      "a clientDomain that disagrees with the id",
      { ...cimd(CHATGPT_DOCUMENT, "chatgpt.com"), clientDomain: Option.some("evil.com") },
    ],
    [
      "a client id that is not a URL",
      { ...cimd(CHATGPT_DOCUMENT, "chatgpt.com"), clientId: "dcr-1" },
    ],
  ])("%s is Unknown", (_, input) => {
    expect(clientTrust(input)).toEqual({ _tag: "Unknown" })
  })
})
