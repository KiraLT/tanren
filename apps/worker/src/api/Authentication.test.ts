import { describe, expect, it } from "@effect/vitest"
import { SessionStoreUnavailable } from "@tanren/shared"
import { Effect, Layer } from "effect"
import { makeApp } from "../app"
import { Sessions } from "../auth/Sessions"
import { envVars as env } from "../testing/fixtures"
import { isWriteMethod } from "./Authentication"

/** The session store is down: every lookup fails. */
const failingSessions = Layer.succeed(
  Sessions,
  Sessions.of({
    current: () => Effect.fail(new SessionStoreUnavailable({ message: "D1 unreachable" })),
  }),
)

describe("Authentication", () => {
  it("answers 503 SessionStoreUnavailable, not 500, when the session store fails", async () => {
    const app = makeApp(env, { auth: { _tag: "Fixed", sessions: failingSessions } })
    const response = await app.handler(new Request("http://localhost/exercises"))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      _tag: "SessionStoreUnavailable",
      message: "D1 unreachable",
    })
  })

  it("leaves public routes alone when the session store fails", async () => {
    const app = makeApp(env, { auth: { _tag: "Fixed", sessions: failingSessions } })
    const response = await app.handler(new Request("http://localhost/health"))
    expect(response.status).toBe(200)
  })
})

describe("isWriteMethod (STLS-F3: only writes read the user row)", () => {
  it("treats GET, HEAD and OPTIONS as reads, in any case", () => {
    expect(["GET", "head", "OPTIONS"].map(isWriteMethod)).toEqual([false, false, false])
  })

  it("treats POST, PUT, PATCH and DELETE as writes", () => {
    expect(["POST", "PUT", "patch", "DELETE"].map(isWriteMethod)).toEqual([true, true, true, true])
  })
})
