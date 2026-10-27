import { env } from "cloudflare:workers"
import { describe, expect, it, onTestFinished } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Option } from "effect"
import { d1Persistence, makeApp } from "../app"
import { Sessions } from "../auth/Sessions"
import { envVars } from "../testing/fixtures"
import { readCursor } from "./GarminPull"
import { makeScheduled, scheduledLayer } from "./scheduled"

// Runs in workerd on a migrated local D1 with `GARMIN_MODE=console` (fixture: 2 activities, 7 days).
const owner = UserId.make("00000000-0000-4000-8000-0000000009a1")
const key = "console-personal-key-0123456789"

const app = () => {
  const built = makeApp(envVars, {
    auth: { _tag: "Fixed", sessions: Sessions.layerFixed(Option.some(owner)) },
    persistence: d1Persistence(env.DB),
  })
  onTestFinished(() => built.dispose())
  return built
}

const call = (
  handler: (r: Request) => Promise<Response>,
  method: string,
  path: string,
  body?: unknown,
) =>
  handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )

const count = async (sql: string) => {
  const row = await env.DB.prepare(sql).bind(owner).first<{ n: number }>()
  return row?.n ?? -1
}

describe("Garmin connect → cron → disconnect on D1", () => {
  it("imports 2 activities and 7 days, keeps one row on re-connect, soft-deletes on disconnect", async () => {
    const { handler } = app()

    const first = await call(handler, "POST", "/integrations/garmin/connect", { token: key })
    expect(first.status).toBe(200)
    const second = await call(handler, "POST", "/integrations/garmin/connect", { token: key })
    expect(second.status).toBe(200)
    expect(await count("SELECT count(*) AS n FROM integration WHERE user_id = ?")).toBe(1)

    const scheduled = makeScheduled(scheduledLayer(env))
    onTestFinished(() => scheduled.dispose())
    await scheduled.run()
    expect(
      await count(
        "SELECT count(*) AS n FROM imported_activity WHERE user_id = ? AND deleted_at IS NULL",
      ),
    ).toBe(2)
    expect(
      await count(
        "SELECT count(*) AS n FROM daily_health WHERE user_id = ? AND deleted_at IS NULL",
      ),
    ).toBe(7)
    const scope = await env.DB.prepare("SELECT scope FROM integration WHERE user_id = ?")
      .bind(owner)
      .first<{ scope: string }>()
    const cursor = readCursor(scope?.scope ?? "")
    expect(Option.flatMap(cursor, (c) => c.lastError)).toEqual(Option.none())
    expect(Option.isSome(Option.flatMap(cursor, (c) => c.lastPullAt))).toBe(true)

    // `as`: test-only read of the wire JSON; the shape is asserted right below.
    const status = (await (await call(handler, "GET", "/integrations")).json()) as {
      readonly providers: ReadonlyArray<Record<string, unknown>>
    }
    expect(status.providers.find((p) => p.provider === "garmin")).toMatchObject({
      state: "connected",
      imports: { activities: 2, days: 7, lastError: null },
    })

    const removed = await call(handler, "DELETE", "/integrations/garmin")
    expect(removed.status).toBe(204)
    expect(await count("SELECT count(*) AS n FROM integration WHERE user_id = ?")).toBe(0)
    expect(
      await count(
        "SELECT count(*) AS n FROM imported_activity WHERE user_id = ? AND deleted_at IS NOT NULL",
      ),
    ).toBe(2)
    expect(
      await count(
        "SELECT count(*) AS n FROM daily_health WHERE user_id = ? AND deleted_at IS NOT NULL",
      ),
    ).toBe(7)
    expect(
      await count(
        "SELECT (SELECT count(*) FROM imported_activity WHERE user_id = ?1 AND deleted_at IS NULL) + (SELECT count(*) FROM daily_health WHERE user_id = ?1 AND deleted_at IS NULL) AS n",
      ),
    ).toBe(0)
  })
})
