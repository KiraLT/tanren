import { describe, expect, it } from "@effect/vitest"
import {
  ActivityExportRepo,
  SealedToken as DbSealedToken,
  IntegrationRepo,
  type IntegrationRow,
} from "@tanren/db"
import { ActivityExportId, IdGenerator, SessionId, UserId, Uuid } from "@tanren/shared"
import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema,
} from "effect"
import { type App, makeApp, memoryPersistence } from "../app"
import { Sessions } from "../auth/Sessions"
import { ExportQueue } from "../integrations/ExportQueue"
import { StravaApi, StravaRequestFailed } from "../integrations/StravaApi"
import { makeTokenSeal, TokenSeal } from "../integrations/TokenSeal"
import { MemoryStore } from "../repos"
import { envVars as env } from "../testing/fixtures"

const owner = UserId.make("00000000-0000-4000-8000-0000000000a3")
const t = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 26, 8, minute))
const exportId = (n: number) =>
  ActivityExportId.make(`70000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
const sessionId = (n: number) =>
  SessionId.make(`71000000-0000-4000-8000-${String(n).padStart(12, "0")}`)

// Web Crypto is async: sealed once, at module load (top-level await).
const sealed = await Effect.runPromise(
  Effect.flatMap(makeTokenSeal(Redacted.make(env.INTEGRATION_TOKEN_KEY)), (seal) =>
    seal.seal(Redacted.make("access-token-1")),
  ),
)

const integrationRow = (status: IntegrationRow["status"]): IntegrationRow => ({
  id: Uuid.make("72000000-0000-4000-8000-000000000001"),
  userId: owner,
  provider: "strava",
  status,
  externalId: "12345",
  displayName: "Ada Lovelace",
  accessToken: DbSealedToken.make(sealed),
  refreshToken: DbSealedToken.make(sealed),
  expiresAt: t(59),
  scope: "read,activity:write",
  createdAt: t(0),
  updatedAt: t(0),
})

interface Harness {
  readonly app: App
  readonly integrations: IntegrationRepo["Service"]
  readonly exports: ActivityExportRepo["Service"]
  readonly revoked: Ref.Ref<ReadonlyArray<string>>
}

/** One memory store shared by the app, its export queue (console Strava) and the test. */
const harness = (revoke: "ok" | "fail" = "ok"): Harness => {
  const ctx = Effect.runSync(Effect.scoped(Layer.build(memoryPersistence(MemoryStore.layer))))
  const persistence = Layer.succeedContext(ctx)
  const revoked = Effect.runSync(Ref.make<ReadonlyArray<string>>([]))
  const strava = Layer.effect(
    StravaApi,
    Effect.gen(function* () {
      const consoleApi = yield* StravaApi
      return StravaApi.of({
        ...consoleApi,
        revoke: (token) =>
          Ref.update(revoked, Arr.append(Redacted.value(token))).pipe(
            Effect.andThen(
              revoke === "ok"
                ? Effect.void
                : Effect.fail(
                    new StravaRequestFailed({ reason: "transport", status: Option.none() }),
                  ),
            ),
          ),
      })
    }),
  ).pipe(Layer.provide(StravaApi.layerConsole))
  const exports = ExportQueue.layer.pipe(
    Layer.provide(
      Layer.mergeAll(persistence, StravaApi.layerConsole, TokenSeal.layer, IdGenerator.layer),
    ),
  )
  const app = makeApp(env, {
    auth: {
      _tag: "Fixed",
      sessions: Layer.succeed(
        Sessions,
        Sessions.of({
          current: (headers) =>
            Effect.succeed(Option.map(Option.fromNullishOr(headers.get("x-user")), UserId.make)),
        }),
      ),
    },
    persistence,
    exports,
    strava,
  })
  return {
    app,
    integrations: Context.get(ctx, IntegrationRepo),
    exports: Context.get(ctx, ActivityExportRepo),
    revoked,
  }
}

const call = (h: Harness, method: string, path: string, body?: unknown) =>
  h.app.handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", "x-user": owner },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

const Status = Schema.Struct({
  providers: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
})
const Row = Schema.Struct({ id: Schema.String, status: Schema.String, attempts: Schema.Number })

const enqueue = (h: Harness, n: number) =>
  h.exports.enqueue([
    {
      id: exportId(n),
      userId: owner,
      provider: "strava",
      sessionId: sessionId(n),
      nextAttemptAt: t(n),
      createdAt: t(n),
    },
  ])

describe("GET /integrations", () => {
  it("lists strava as disconnected with zero counts when nothing is stored", async () => {
    const response = await call(harness(), "GET", "/integrations")
    expect(response.status).toBe(200)
    expect(Schema.decodeUnknownSync(Status)(await response.json()).providers).toEqual([
      {
        provider: "strava",
        state: "disconnected",
        account: null,
        connectedAt: null,
        lastExportAt: null,
        pendingExports: 0,
        failedExports: 0,
        blockedExports: 0,
      },
    ])
  })

  it("does not list garmin until its connect endpoint exists", async () => {
    const response = await call(harness(), "GET", "/integrations")
    const providers = Schema.decodeUnknownSync(Status)(await response.json()).providers
    expect(providers.map((p) => p.provider)).not.toContain("garmin")
  })

  it("reports connected with the athlete, and the pending/failed/blocked/sent counts", async () => {
    const h = harness()
    await run(h.integrations.upsert(integrationRow("active")))
    await run(Effect.forEach([1, 2, 3, 4, 5], (n) => enqueue(h, n)))
    await run(h.exports.settle(exportId(2), { _tag: "Failed", reason: "rejected", now: t(10) }))
    await run(h.exports.settle(exportId(3), { _tag: "Dead", reason: "transport", now: t(11) }))
    await run(
      h.exports.settle(exportId(4), {
        _tag: "Blocked",
        reason: "app_inactive",
        nextAttemptAt: t(40),
        now: t(12),
      }),
    )
    await run(h.exports.settle(exportId(5), { _tag: "Sent", externalActivityId: "99", now: t(13) }))
    const body = Schema.decodeUnknownSync(Status)(
      await (await call(h, "GET", "/integrations")).json(),
    )
    expect(body.providers[0]).toEqual({
      provider: "strava",
      state: "connected",
      account: { displayName: "Ada Lovelace" },
      connectedAt: "2026-10-26T08:00:00.000Z",
      lastExportAt: "2026-10-26T08:13:00.000Z",
      pendingExports: 1,
      failedExports: 2,
      blockedExports: 1,
    })
  })

  it("reports revoked when the provider rejected the tokens", async () => {
    const h = harness()
    await run(h.integrations.upsert(integrationRow("revoked")))
    const body = Schema.decodeUnknownSync(Status)(
      await (await call(h, "GET", "/integrations")).json(),
    )
    expect(body.providers[0]).toMatchObject({ state: "revoked" })
  })
})

describe("POST /integrations/strava/connect", () => {
  it("answers the console callback URL for an allowed returnTo", async () => {
    const response = await call(harness(), "POST", "/integrations/strava/connect", {
      returnTo: "http://localhost:8081/settings/integrations",
    })
    expect(response.status).toBe(200)
    const { url } = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(
      await response.json(),
    )
    expect(url.startsWith("http://localhost:8787/integrations/strava/callback?state=")).toBe(true)
  })

  it("answers 400 ConnectRejected{return-to} for a foreign returnTo", async () => {
    const response = await call(harness(), "POST", "/integrations/strava/connect", {
      returnTo: "https://evil/settings/integrations",
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ _tag: "ConnectRejected", reason: "return-to" })
  })

  it("answers 429 NativeRateLimited after 10 connects a minute", async () => {
    const h = harness()
    const statuses = await Promise.all(
      Arr.map(Arr.range(1, 11), () =>
        call(h, "POST", "/integrations/strava/connect", {
          returnTo: "http://localhost:8081/settings/integrations",
        }).then((r) => r.status),
      ),
    )
    expect(Arr.filter(statuses, (s) => s === 429)).toEqual([429])
  })

  it("connects end to end: connect → console callback → status connected", async () => {
    const h = harness()
    const { url } = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(
      await (
        await call(h, "POST", "/integrations/strava/connect", {
          returnTo: "http://localhost:8081/settings/integrations",
        })
      ).json(),
    )
    const callback = await h.app.handler(new Request(url))
    expect(callback.status).toBe(303)
    expect(callback.headers.get("location")).toBe(
      "http://localhost:8081/settings/integrations?connected=strava",
    )
    const body = Schema.decodeUnknownSync(Status)(
      await (await call(h, "GET", "/integrations")).json(),
    )
    expect(body.providers[0]).toMatchObject({
      state: "connected",
      account: { displayName: "Console Athlete" },
    })
  })
})

describe("DELETE /integrations/strava", () => {
  it("revokes with the opened access token, removes the row and its exports, answers 204", async () => {
    const h = harness()
    await run(h.integrations.upsert(integrationRow("active")))
    await run(enqueue(h, 1))
    const response = await call(h, "DELETE", "/integrations/strava")
    expect(response.status).toBe(204)
    expect(await run(Ref.get(h.revoked))).toEqual(["access-token-1"])
    expect(Option.isNone(await run(h.integrations.get(owner, "strava")))).toBe(true)
    expect(await run(h.exports.list(owner, "strava", 10))).toEqual([])
  })

  it("still removes the row when the revoke call fails", async () => {
    const h = harness("fail")
    await run(h.integrations.upsert(integrationRow("active")))
    expect((await call(h, "DELETE", "/integrations/strava")).status).toBe(204)
    expect(Option.isNone(await run(h.integrations.get(owner, "strava")))).toBe(true)
  })

  it("answers 409 IntegrationNotConnected when nothing is connected", async () => {
    const response = await call(harness(), "DELETE", "/integrations/strava")
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      _tag: "IntegrationNotConnected",
      provider: "strava",
    })
  })
})

describe("GET /integrations/strava/exports", () => {
  it("lists newest first and honours limit", async () => {
    const h = harness()
    await run(Effect.forEach([1, 2, 3], (n) => enqueue(h, n)))
    const response = await call(h, "GET", "/integrations/strava/exports?limit=2")
    expect(response.status).toBe(200)
    const rows = Schema.decodeUnknownSync(Schema.Array(Row))(await response.json())
    expect(Arr.map(rows, (r) => r.id)).toEqual([exportId(3), exportId(2)])
  })

  it("answers the default page of 20 when the query has no limit", async () => {
    const h = harness()
    await run(Effect.forEach(Arr.range(1, 22), (n) => enqueue(h, n)))
    const bare = await call(h, "GET", "/integrations/strava/exports")
    expect(bare.status).toBe(200)
    const rows = Schema.decodeUnknownSync(Schema.Array(Row))(await bare.json())
    expect(rows).toHaveLength(20)
    expect(Arr.head(rows).pipe(Option.map((r) => r.id))).toEqual(Option.some(exportId(22)))
    const explicit = await call(h, "GET", "/integrations/strava/exports?limit=20")
    expect(Schema.decodeUnknownSync(Schema.Array(Row))(await explicit.json())).toEqual(rows)
  })

  it("answers 400 for limit 0", async () => {
    expect((await call(harness(), "GET", "/integrations/strava/exports?limit=0")).status).toBe(400)
  })
})

describe("POST /integrations/strava/exports/retry", () => {
  it("answers 409 when no integration is active", async () => {
    const response = await call(harness(), "POST", "/integrations/strava/exports/retry", {
      id: exportId(1),
    })
    expect(response.status).toBe(409)
  })

  it("answers 404 NotFound{activityExport} for a sent row", async () => {
    const h = harness()
    await run(h.integrations.upsert(integrationRow("active")))
    await run(enqueue(h, 1))
    await run(h.exports.settle(exportId(1), { _tag: "Sent", externalActivityId: "9", now: t(5) }))
    const response = await call(h, "POST", "/integrations/strava/exports/retry", {
      id: exportId(1),
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ _tag: "NotFound", entity: "activityExport" })
  })

  it("resets a failed row and drains it through console Strava to sent", async () => {
    const h = harness()
    await run(h.integrations.upsert(integrationRow("active")))
    const created = await call(h, "POST", "/sessions", {
      startedAt: "2026-10-26T07:00:00.000Z",
      finishedAt: "2026-10-26T07:45:00.000Z",
      plannedSessionId: null,
      notes: null,
    })
    expect(created.status).toBe(200)
    const session = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
      await created.json(),
    )
    await run(
      h.exports.enqueue([
        {
          id: exportId(9),
          userId: owner,
          provider: "strava",
          sessionId: SessionId.make(session.id),
          nextAttemptAt: t(1),
          createdAt: t(1),
        },
      ]),
    )
    await run(h.exports.settle(exportId(9), { _tag: "Failed", reason: "rejected", now: t(2) }))
    const response = await call(h, "POST", "/integrations/strava/exports/retry", {
      id: exportId(9),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: exportId(9), status: "sent", attempts: 1 })
  })
})
