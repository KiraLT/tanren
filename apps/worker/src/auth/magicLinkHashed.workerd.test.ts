import { env } from "cloudflare:workers"
import { describe, expect, it, onTestFinished } from "@effect/vitest"
import { Effect, Layer, MutableRef, Option, Schema } from "effect"
import { d1Persistence, makeApp } from "../app"
import { envVars } from "../testing/fixtures"
import { BetterAuth } from "./BetterAuth"
import { EmailSender } from "./EmailSender"

// SEC-A2 (A2): the magic-link token lives 5 minutes and signs in whoever holds it, so D1 must not
// hold it in cleartext (`magicLink({ storeToken: "hashed" })`). Real D1 in workerd, real Better
// Auth, a sender that keeps the mailed URL in memory.
const BASE = envVars.BETTER_AUTH_URL
const ORIGIN = "http://localhost:8081" // `envVars.ALLOWED_ORIGINS`
const EMAIL = "hashed-link@example.com"

const VerificationRows = Schema.Array(
  Schema.Struct({ identifier: Schema.String, value: Schema.String }),
)

describe("magic-link token at rest (workerd, D1)", () => {
  it("verification rows never contain the mailed token, and the mailed link still signs in", async () => {
    const mailed = MutableRef.make(Option.none<string>())
    const sender = Layer.succeed(
      EmailSender,
      EmailSender.of({
        send: ({ url }) => Effect.sync(() => MutableRef.set(mailed, Option.some(url))),
      }),
    )
    const app = makeApp(envVars, {
      auth: {
        _tag: "BetterAuth",
        betterAuth: BetterAuth.layer(env.DB).pipe(Layer.provide(sender)),
      },
      persistence: d1Persistence(env.DB),
    })
    onTestFinished(() => app.dispose())

    const requested = await app.handler(
      new Request(`${BASE}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: EMAIL, callbackURL: "/" }),
      }),
    )
    expect(requested.status).toBe(200)
    const link = new URL(Option.getOrElse(MutableRef.get(mailed), () => ""))
    const token = link.searchParams.get("token") ?? ""
    expect(token.length).toBeGreaterThan(0)

    const { results } = await env.DB.prepare("SELECT identifier, value FROM verification").all()
    const rows = Schema.decodeUnknownSync(VerificationRows)(results)
    expect(rows.some((row) => row.identifier.startsWith("magic-link:"))).toBe(true)
    expect(
      rows.filter((row) => row.identifier.includes(token) || row.value.includes(token)),
    ).toEqual([])

    const verified = await app.handler(new Request(link, { redirect: "manual" }))
    expect(verified.status).toBe(302)
    expect(
      verified.headers.getSetCookie().some((cookie) => cookie.includes("session_token=")),
    ).toBe(true)
    const sessions = await env.DB.prepare(
      "SELECT count(*) AS n FROM session WHERE userId = (SELECT id FROM user WHERE email = ?)",
    )
      .bind(EMAIL)
      .first<{ readonly n: number }>()
    expect(sessions?.n).toBe(1)
  })
})
