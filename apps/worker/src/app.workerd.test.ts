import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { d1Persistence, makeApp } from "./app"
import { Sessions } from "./auth/Sessions"
import type { EnvVars } from "./Env"

const vars: EnvVars = {
  ENVIRONMENT: "local",
  BETTER_AUTH_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "test-secret-0000000000000000000000000000",
  ALLOWED_ORIGINS: "http://localhost:8081",
  EMAIL_MODE: "console",
}

// Runs in workerd on a migrated local D1 (`vitest.workerd.config.ts`), the runtime Node tests skip.
describe("makeApp in workerd", () => {
  it("serves /health with D1 persistence", async () => {
    const app = makeApp(vars, {
      auth: { _tag: "Fixed", sessions: Sessions.layerFixed(Option.none()) },
      persistence: d1Persistence(env.DB),
    })
    const response = await app.handler(new Request("http://localhost/health"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    await app.dispose()
  })
})
