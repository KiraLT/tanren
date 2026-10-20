import { describe, expect, it } from "vitest"
import { resolveApiBaseUrl } from "./apiBaseUrl"

const native = (hostUri: string | undefined) =>
  resolveApiBaseUrl({ envUrl: undefined, hostUri, isWeb: false })

describe("resolveApiBaseUrl edges", () => {
  it("strips several trailing slashes and surrounding whitespace", () => {
    expect(
      resolveApiBaseUrl({
        envUrl: "  https://api.tanren.me///  ",
        hostUri: undefined,
        isWeb: true,
      }),
    ).toBe("https://api.tanren.me")
  })

  it("production web with no env URL points at localhost (no prod default)", () => {
    // Observed, not endorsed: a production web build missing EXPO_PUBLIC_API_URL calls localhost.
    expect(resolveApiBaseUrl({ envUrl: "", hostUri: undefined, isWeb: true })).toBe(
      "http://localhost:8787",
    )
  })

  it("accepts a host URI without a port", () => {
    expect(native("192.168.1.5")).toBe("http://192.168.1.5:8787")
  })

  it("empty host URI falls back to localhost", () => {
    expect(native("")).toBe("http://localhost:8787")
    expect(native(":8081")).toBe("http://localhost:8787")
  })

  // DEFECT (minor, dev only): hostUri is split on ":" so an IPv6 literal "[::1]:8081" becomes
  // "http://[:8787". Fix: parse with `new URL(`http://${hostUri}`).hostname`.
  it.fails("handles an IPv6 host URI", () => {
    expect(native("[::1]:8081")).toBe("http://[::1]:8787")
  })

  // DEFECT (minor, dev only): an Expo tunnel host URI ("xyz.exp.direct:80") yields a dev API port
  // that is not tunnelled; documented here as the observed result.
  it("tunnel host URIs get the dev API port appended", () => {
    expect(native("abc-anon-8081.exp.direct:80")).toBe("http://abc-anon-8081.exp.direct:8787")
  })
})
