import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import worker from "../index"
import { DISPLAY_FONT_PATH } from "./assets"

// The bundle that ships (`src/index.ts`) serves the pages' display font from the wrangler Data
// module (`rules` in wrangler.test.jsonc, mirrored from wrangler.jsonc). 23 668 = `wc -c` of
// `fonts/barlow-condensed-800.woff2`; a Text rule or a missing rule fails the length or the import.
const BASE = "http://localhost:8787"
const FONT_BYTES = 23668

const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`${BASE}${path}`, init), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe("GET /oauth/assets/*", () => {
  it("serves the woff2 with an immutable cache and its exact bytes", async () => {
    const response = await call(DISPLAY_FONT_PATH)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("font/woff2")
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    const body = new Uint8Array(await response.arrayBuffer())
    expect(body.byteLength).toBe(FONT_BYTES)
    // "wOF2" signature
    expect(Array.from(body.slice(0, 4))).toEqual([0x77, 0x4f, 0x46, 0x32])
  })

  it("HEAD answers the headers without a body", async () => {
    const response = await call(DISPLAY_FONT_PATH, { method: "HEAD" })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-length")).toBe(String(FONT_BYTES))
    expect(await response.text()).toBe("")
  })

  it("any other name under the asset path is 404", async () => {
    const paths = [
      "/oauth/assets/other.woff2",
      "/oauth/assets/",
      "/oauth/assets/barlow-condensed-800.woff2x",
      "/oauth/assets/%2e%2e/index.ts",
    ]
    const statuses = await Promise.all(paths.map(async (path) => (await call(path)).status))
    expect(statuses).toEqual([404, 404, 404, 404])
  })

  it("a dot-segment path normalises out of the asset path and is not served", async () => {
    const response = await call("/oauth/assets/../index.ts")
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).not.toBe("font/woff2")
  })

  it("POST to the font is 404", async () => {
    expect((await call(DISPLAY_FONT_PATH, { method: "POST" })).status).toBe(404)
  })
})
