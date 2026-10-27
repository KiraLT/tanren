import { env } from "cloudflare:workers"
import { describe, expect, it, onTestFinished } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Array as Arr, Effect, Layer, MutableRef, Option } from "effect"
import { d1Persistence, makeApp } from "../app"
import { WorkerConfig } from "../Config"
import { envVars } from "../testing/fixtures"
import { BetterAuth } from "./BetterAuth"
import type { MagicLinkEmail } from "./Email"
import { EmailSender } from "./EmailSender"
import { Tokens } from "./Tokens"

// STLS-F3 (ADR-0022 amendment): a deleted user's still-valid tokens (app JWT 15 min, Better Auth
// cookie cache 900 s) keep reading, but every write needs the `user` row, so a push can never
// re-create rows under an erased id. Real `makeApp` in BetterAuth mode on the migrated D1.
const BASE = "http://localhost:8787"
const ORIGIN = "http://localhost:8081"
const T0 = "2026-10-19T08:00:00.000Z"

const sessionChange = (sessionId: string, userId: string) => ({
  table: "session",
  row: {
    id: sessionId,
    userId,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    startedAt: T0,
    finishedAt: null,
    plannedSessionId: null,
    notes: null,
  },
})

const sessionRows = (sessionId: string) =>
  env.DB.prepare("SELECT COUNT(*) AS n FROM workout_session WHERE id = ?")
    .bind(sessionId)
    .first("n")

/** The app as `index.ts` builds it, with a mail sender that records magic links for the test. */
const liveApp = () => {
  const sent = MutableRef.make<ReadonlyArray<MagicLinkEmail>>([])
  const recorder = Layer.succeed(
    EmailSender,
    EmailSender.of({
      send: (mail) => Effect.sync(() => MutableRef.update(sent, (all) => Arr.append(all, mail))),
    }),
  )
  const app = makeApp(envVars, {
    auth: {
      _tag: "BetterAuth",
      betterAuth: BetterAuth.layer(env.DB).pipe(Layer.provide(recorder)),
    },
    persistence: d1Persistence(env.DB),
  })
  onTestFinished(() => app.dispose())
  return { app, sent }
}

const send = (
  app: ReturnType<typeof liveApp>["app"],
  path: string,
  auth: Record<string, string>,
  body?: unknown,
) =>
  app.handler(
    new Request(`${BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...auth },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )

const deleteUser = (userId: string) =>
  env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run()

describe("a deleted user cannot write within the token window (STLS-F3)", () => {
  it("app access JWT: push 200 before, 401 after the user row is gone; GET stays 200", async () => {
    const userId = UserId.make("00000000-0000-4000-8000-0000000f3a01")
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, 'F3', 'f3-jwt@tanren.test', 1, ?, ?)`,
    )
      .bind(userId, T0, T0)
      .run()
    const { app } = liveApp()
    const pair = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Tokens).issueAppPair(userId, 0)
      }).pipe(Effect.provide(Tokens.layer), Effect.provide(WorkerConfig.layerFromEnv(envVars))),
    )
    const bearer = { authorization: `Bearer ${pair.accessToken}` }
    const before = "00000000-0000-4000-8000-0000000f3b01"
    const after = "00000000-0000-4000-8000-0000000f3b02"

    const control = await send(app, "/sync/push", bearer, {
      changes: [sessionChange(before, userId)],
    })
    expect(control.status).toBe(200)
    expect(await sessionRows(before)).toBe(1)

    await deleteUser(userId)
    const push = await send(app, "/sync/push", bearer, { changes: [sessionChange(after, userId)] })
    const read = await send(app, "/exercises", bearer)
    console.log("STLS-F3 app JWT after delete: push", push.status, "GET /exercises", read.status)
    expect(push.status).toBe(401)
    expect(await sessionRows(after)).toBe(0) // nothing re-created under the erased id
    expect(read.status).toBe(200) // reads stay stateless (0 user reads)
  })

  it("web cookie-cache session: push 401 and GET 200 after the user row is gone", async () => {
    const { app, sent } = liveApp()
    const email = "f3-cookie@tanren.test"
    const requested = await send(
      app,
      "/api/auth/sign-in/magic-link",
      {},
      { email, callbackURL: "/" },
    )
    expect(requested.status).toBe(200)
    const link = Option.getOrThrow(
      Option.map(
        Arr.findFirst(MutableRef.get(sent), (mail) => mail.email === email),
        (mail) => mail.url,
      ),
    )
    const verified = await app.handler(new Request(link, { redirect: "manual" }))
    expect(verified.status).toBe(302)
    const cookie = verified.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .join("; ")
    expect(cookie).toContain("session_data=") // the cookie cache (900 s) is what outlives the row
    const userId = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
      .bind(email)
      .first<string>("id")
    expect(userId).not.toBeNull()
    const owner = userId ?? ""
    const before = "00000000-0000-4000-8000-0000000f3c01"
    const after = "00000000-0000-4000-8000-0000000f3c02"

    const control = await send(
      app,
      "/sync/push",
      { cookie },
      {
        changes: [sessionChange(before, owner)],
      },
    )
    expect(control.status).toBe(200)
    expect(await sessionRows(before)).toBe(1)

    await deleteUser(owner)
    const push = await send(
      app,
      "/sync/push",
      { cookie },
      { changes: [sessionChange(after, owner)] },
    )
    const read = await send(app, "/exercises", { cookie })
    console.log("STLS-F3 cookie after delete: push", push.status, "GET /exercises", read.status)
    expect(push.status).toBe(401)
    expect(await sessionRows(after)).toBe(0)
    expect(read.status).toBe(200)
  })
})
