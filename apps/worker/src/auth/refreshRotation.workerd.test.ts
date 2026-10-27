import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import { AppTokenPair, UserId } from "@tanren/shared"
import { Effect, Schema } from "effect"
import { WorkerConfig } from "../Config"
import worker from "../index"
import { Tokens } from "./Tokens"

// STLS-F5 (ADR-0022 amendment): app refresh-token rotation with reuse detection, through the real
// default export on a migrated D1 (migration 0010 `refresh_token_burn`).
const BASE = "http://localhost:8787"
const USER = UserId.make("00000000-0000-4000-8000-0000000000f5")

const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`${BASE}${path}`, init), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

const refresh = (refreshToken: string) =>
  call("/api/token/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })

/** Signed with the default export's own config (`wrangler.test.jsonc` vars), not `envVars`. */
const issuePair = (gen = 0) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* (yield* Tokens).issueAppPair(USER, gen)
    }).pipe(Effect.provide(Tokens.layer), Effect.provide(WorkerConfig.layerFromEnv(env))),
  )

const decodePair = async (response: Response) =>
  Schema.decodeUnknownSync(AppTokenPair)(await response.json())

const appGen = async () =>
  (
    await env.DB.prepare(`SELECT "appTokenGen" AS gen FROM "user" WHERE id = ?`)
      .bind(USER)
      .first<{ readonly gen: number }>()
  )?.gen

const burnedJtis = async () =>
  (
    await env.DB.prepare(`SELECT jti FROM refresh_token_burn ORDER BY jti`).all<{
      readonly jti: string
    }>()
  ).results.map((row) => row.jti)

/** Moves every ledger row's `burnedAt` `seconds` into the past (the handler runs on the real clock). */
const ageBurns = (seconds: number) =>
  env.DB.prepare(`UPDATE refresh_token_burn SET "burnedAt" = "burnedAt" - ?`)
    .bind(seconds * 1000)
    .run()

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, 'R', 'rotation@tanren.test', 1, '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z')`,
  )
    .bind(USER)
    .run()
})

describe("POST /api/token/refresh rotation (workerd)", () => {
  it("refresh → a new pair, and the presented refresh token's jti is burned in D1", async () => {
    const before = (await burnedJtis()).length
    const pair = await issuePair()
    const response = await refresh(pair.refreshToken)
    expect(response.status).toBe(200)
    const next = await decodePair(response)
    expect(next.refreshToken).not.toBe(pair.refreshToken)
    expect(await burnedJtis()).toHaveLength(before + 1)
  })

  it("the old refresh token re-sent at once → 200; 31 s later → 401 revoked, gen bumped, rotated dies", async () => {
    const pair = await issuePair()
    const gen = await appGen()
    // The pair was issued at gen 0; run this only while the user is still at gen 0.
    expect(gen).toBe(0)
    const rotated = await decodePair(await refresh(pair.refreshToken))
    // Within the 30 s grace a re-send is a lost response, not a thief: a fresh pair, no bump.
    expect((await refresh(pair.refreshToken)).status).toBe(200)
    expect(await appGen()).toBe(0)
    await ageBurns(31)
    const reuse = await refresh(pair.refreshToken)
    expect(reuse.status).toBe(401)
    expect(await reuse.json()).toEqual({ _tag: "TokenRejected", reason: "revoked" })
    expect(await appGen()).toBe(1)
    const afterBump = await refresh(rotated.refreshToken)
    expect(afterBump.status).toBe(401)
    expect(await afterBump.json()).toEqual({ _tag: "TokenRejected", reason: "revoked" })
  })

  it("a refresh purges ledger rows whose expiry has passed and keeps live ones", async () => {
    await env.DB.prepare(
      `INSERT INTO refresh_token_burn (jti, userId, expiresAt, burnedAt) VALUES ('zz-expired', ?, 1, 1), ('zz-live', ?, 99999999999999, 1)`,
    )
      .bind(USER, USER)
      .run()
    // Gen 1 after the reuse test (shared D1 per file); a fresh pair at the current generation.
    const pair = await issuePair((await appGen()) ?? 0)
    expect((await refresh(pair.refreshToken)).status).toBe(200)
    const jtis = await burnedJtis()
    expect(jtis).not.toContain("zz-expired")
    expect(jtis).toContain("zz-live")
  })
})
