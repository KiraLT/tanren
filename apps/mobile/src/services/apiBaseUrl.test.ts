import { describe, expect, it } from "vitest"
import { resolveApiBaseUrl } from "./apiBaseUrl"

describe("resolveApiBaseUrl", () => {
  it("prefers EXPO_PUBLIC_API_URL and drops a trailing slash", () => {
    expect(
      resolveApiBaseUrl({
        envUrl: "https://api.tanren.me/",
        hostUri: "10.0.0.2:8081",
        isWeb: false,
      }),
    ).toBe("https://api.tanren.me")
  })

  it("uses Metro's host with the dev API port on native", () => {
    expect(
      resolveApiBaseUrl({ envUrl: undefined, hostUri: "192.168.1.5:8081", isWeb: false }),
    ).toBe("http://192.168.1.5:8787")
  })

  it("ignores an empty env URL", () => {
    expect(resolveApiBaseUrl({ envUrl: " ", hostUri: "192.168.1.5:8081", isWeb: false })).toBe(
      "http://192.168.1.5:8787",
    )
  })

  it("uses localhost on web even when a host URI exists", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, hostUri: "192.168.1.5:8081", isWeb: true })).toBe(
      "http://localhost:8787",
    )
  })

  it("falls back to localhost on native without a host URI", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, hostUri: undefined, isWeb: false })).toBe(
      "http://localhost:8787",
    )
  })
})
