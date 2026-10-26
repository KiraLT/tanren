import { describe, expect, it } from "@effect/vitest"
import { isAllowedIntegrationReturnTo, isNativeReturnTo, MAX_RETURN_TO } from "./returnTo"

const PROJECT = "11111111-2222-4333-8444-555555555555"
const config = {
  allowedOrigins: ["https://tanren.me", "http://localhost:8790"],
  nativeReturnPrefixes: ["exp://localhost:", `exps://u.expo.dev/${PROJECT}/`],
}
const allowed = (raw: string) => isAllowedIntegrationReturnTo(raw, config)

describe("isAllowedIntegrationReturnTo", () => {
  it("accepts each configured good form", () => {
    expect(allowed("https://tanren.me/settings/integrations")).toBe(true)
    expect(allowed("http://localhost:8790/settings/integrations")).toBe(true)
    expect(allowed("exp://localhost:8081/--/settings/integrations")).toBe(true)
    expect(allowed(`exps://u.expo.dev/${PROJECT}/--/settings/integrations`)).toBe(true)
  })

  it.each([
    "https://tanren.me/settings/integrations/../x",
    "https://tanren.me/settings/%2e%2e/settings/integrations",
    "https://tanren.me/settings/integrations/%2e%2e",
    "exp://localhost:8081/a/../--/settings/integrations",
    "exp://localhost:8081/%2e%2e/--/settings/integrations",
    "https://tanren.me.evil/settings/integrations",
    "https://evil/settings/integrations",
    "exps://u.expo.dev/99999999-2222-4333-8444-555555555555/--/settings/integrations",
    "https://tanren.me:1x/settings/integrations",
    "https://tanren.me/settings/integrations?x=1",
    "https://tanren.me/settings/integrations?",
    "https://tanren.me/settings/integrations#x",
    "https://tanren.me/settings/integrations#",
    "exp://localhost:8081/--/settings/integrations?x=1",
    "exp://localhost:8081/--/settings/integrations#x",
    "https://a@tanren.me/settings/integrations",
    "https://a:b@tanren.me/settings/integrations",
    "exp://a@localhost:8081/--/settings/integrations",
    "https://tanren.me/settings/integrations/",
    "https://tanren.me//settings/integrations",
    "exp://localhost:8081//--/settings/integrations",
    "exp://localhost:8081/--/settings/integrations/",
    "HTTPS://tanren.me/settings/integrations",
    "https://TANREN.me/settings/integrations",
    "EXP://localhost:8081/--/settings/integrations",
    "https://tanren.me:443/settings/integrations",
    "https://tanren.me/settings/integrations\n",
    " https://tanren.me/settings/integrations",
    "javascript:alert(1)//settings/integrations",
    "tanren://settings/integrations",
    "exp://evil.com/--/settings/integrations",
    "exp://localhost:8081/--/auth/callback",
    "https://tanren.me/settings",
    "",
    "not a url",
  ])("rejects %j", (raw) => {
    expect(allowed(raw)).toBe(false)
  })

  const ofLength = (n: number) =>
    `exp://localhost:8081/${"a".repeat(n - "exp://localhost:8081/".length - "/--/settings/integrations".length)}/--/settings/integrations`

  it("rejects 513 and 301 characters that would otherwise pass the prefix rule; accepts 300", () => {
    expect(ofLength(513).length).toBe(513)
    expect(allowed(ofLength(513))).toBe(false)
    expect(allowed(ofLength(MAX_RETURN_TO + 1))).toBe(false)
    expect(ofLength(MAX_RETURN_TO).length).toBe(300)
    expect(allowed(ofLength(MAX_RETURN_TO))).toBe(true)
  })

  it("rejects everything when nothing is configured", () => {
    const empty = { allowedOrigins: [""], nativeReturnPrefixes: [""] }
    expect(isAllowedIntegrationReturnTo("https://tanren.me/settings/integrations", empty)).toBe(
      false,
    )
    expect(
      isAllowedIntegrationReturnTo("exp://localhost:8081/--/settings/integrations", empty),
    ).toBe(false)
  })
})

describe("isNativeReturnTo", () => {
  it("is true only for exp:// and exps://", () => {
    expect(isNativeReturnTo("exp://localhost:8081/--/settings/integrations")).toBe(true)
    expect(isNativeReturnTo(`exps://u.expo.dev/${PROJECT}/--/settings/integrations`)).toBe(true)
    expect(isNativeReturnTo("https://tanren.me/settings/integrations")).toBe(false)
  })
})
