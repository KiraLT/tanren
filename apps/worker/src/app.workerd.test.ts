import { env } from "cloudflare:workers"
import { describe, expect, it, onTestFinished } from "@effect/vitest"
import { Option } from "effect"
import { d1Persistence, makeApp } from "./app"
import { Sessions } from "./auth/Sessions"
import { envVars } from "./testing/fixtures"

// Runs in workerd on a migrated local D1 (`vitest.workerd.config.ts`), the runtime Node tests skip.
describe("makeApp in workerd", () => {
  it("builds the app with D1 persistence and serves /health", async () => {
    const app = makeApp(envVars, {
      auth: { _tag: "Fixed", sessions: Sessions.layerFixed(Option.none()) },
      persistence: d1Persistence(env.DB),
    })
    onTestFinished(() => app.dispose())
    const response = await app.handler(new Request("http://localhost/health"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})
