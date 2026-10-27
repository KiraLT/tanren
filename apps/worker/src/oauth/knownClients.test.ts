import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { clientTrust } from "./knownClients"

describe("clientTrust", () => {
  it.each([
    ["claude.ai", "Claude"],
    ["www.claude.ai", "Claude"],
    ["claude.com", "Claude"],
    ["chatgpt.com", "ChatGPT"],
  ])("%s is the known app %s", (domain, name) => {
    expect(clientTrust(Option.some(domain))).toEqual({ _tag: "Known", name, domain })
  })

  it.each([
    "claude.ai.evil.com",
    "evil.com",
    "evilclaude.ai",
    "chatgpt.com.attacker.example",
    "claude.ai.",
    "",
  ])("%s is unknown", (domain) => {
    expect(clientTrust(Option.some(domain))).toEqual({ _tag: "Unknown" })
  })

  it("no verified domain (a registered client) is unknown", () => {
    expect(clientTrust(Option.none())).toEqual({ _tag: "Unknown" })
  })
})
