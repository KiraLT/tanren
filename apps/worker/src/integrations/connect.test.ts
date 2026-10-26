import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Option, Redacted } from "effect"
import { Base64Url } from "effect/encoding"
import { TestClock } from "effect/testing"
import { WorkerConfig, type WorkerConfigShape } from "../Config"
import { envVars } from "../testing/fixtures"
import {
  authorizeUrl,
  MAX_STATE_LENGTH,
  STATE_TTL_MS,
  signState,
  startConnect,
  verifyState,
} from "./connect"
import { MAX_RETURN_TO } from "./returnTo"

const base = WorkerConfig.fromEnvSync({
  ...envVars,
  ALLOWED_ORIGINS: "http://localhost:8790",
})
const provider: WorkerConfigShape = {
  ...base,
  stravaMode: "provider",
  stravaClientSecret: Option.some(Redacted.make("secret")),
}
const user = UserId.make("00000000-0000-4000-8000-0000000000a1")
const WEB = "http://localhost:8790/settings/integrations"
const T0 = Date.UTC(2026, 9, 26, 12)

const stateOf = (url: string) => new URL(url).searchParams.get("state") ?? ""

describe("connect state", () => {
  it.effect("a fresh state verifies to the signed user and returnTo", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const raw = yield* signState(base, { userId: user, returnTo: WEB, expiresAt: T0 + 1000 })
      expect(yield* verifyState(base, raw)).toEqual({
        userId: user,
        returnTo: WEB,
        expiresAt: T0 + 1000,
      })
    }),
  )

  it.effect("rejects a payload swapped for another user's with the old signature", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const raw = yield* signState(base, { userId: user, returnTo: WEB, expiresAt: T0 + 1000 })
      const [, signature] = raw.split(".")
      const forged = Base64Url.encode(
        JSON.stringify({
          userId: "00000000-0000-4000-8000-0000000000b2",
          returnTo: WEB,
          expiresAt: T0 + 1000,
        }),
      )
      const error = yield* Effect.flip(verifyState(base, `${forged}.${signature}`))
      expect(error.reason).toBe("signature")
    }),
  )

  it.effect("rejects a flipped signature character, a missing part and an extra part", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const raw = yield* signState(base, { userId: user, returnTo: WEB, expiresAt: T0 + 1000 })
      // The first signature char (the last one carries unused padding bits).
      const [payload = "", signature = ""] = raw.split(".")
      const tampered = `${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`
      expect((yield* Effect.flip(verifyState(base, tampered))).reason).toBe("signature")
      expect((yield* Effect.flip(verifyState(base, raw.split(".")[0] ?? ""))).reason).toBe(
        "malformed",
      )
      expect((yield* Effect.flip(verifyState(base, `${raw}.x`))).reason).toBe("malformed")
      expect((yield* Effect.flip(verifyState(base, ""))).reason).toBe("malformed")
    }),
  )

  it.effect("rejects a state signed with another key", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const other = {
        ...base,
        integrationTokenKey: Redacted.make("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="),
      }
      const raw = yield* signState(other, { userId: user, returnTo: WEB, expiresAt: T0 + 1000 })
      expect((yield* Effect.flip(verifyState(base, raw))).reason).toBe("signature")
    }),
  )

  it.effect("is valid at exactly +10 min and expired 1 ms later", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const { url } = yield* startConnect(base, user, WEB)
      const raw = stateOf(url)
      yield* TestClock.setTime(T0 + STATE_TTL_MS)
      expect((yield* verifyState(base, raw)).userId).toBe(user)
      yield* TestClock.setTime(T0 + STATE_TTL_MS + 1)
      expect((yield* Effect.flip(verifyState(base, raw))).reason).toBe("expired")
    }),
  )

  it.effect("re-checks returnTo: a validly signed state for a foreign URL is rejected", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const raw = yield* signState(base, {
        userId: user,
        returnTo: "https://evil/settings/integrations",
        expiresAt: T0 + 1000,
      })
      expect((yield* Effect.flip(verifyState(base, raw))).reason).toBe("return-to")
    }),
  )
})

describe("startConnect", () => {
  it.effect("console mode points the browser at our own callback with code=console", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const { url } = yield* startConnect(base, user, WEB)
      const parsed = new URL(url)
      expect(`${parsed.origin}${parsed.pathname}`).toBe(
        "http://localhost:8787/integrations/strava/callback",
      )
      expect(parsed.searchParams.get("code")).toBe("console")
      expect(parsed.searchParams.get("scope")).toBe("read,activity:write")
      expect((yield* verifyState(base, stateOf(url))).returnTo).toBe(WEB)
    }),
  )

  it.effect("provider mode builds Strava's authorize URL with every parameter", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const { url } = yield* startConnect(provider, user, WEB)
      const parsed = new URL(url)
      expect(`${parsed.origin}${parsed.pathname}`).toBe("https://www.strava.com/oauth/authorize")
      expect(Object.fromEntries(parsed.searchParams)).toEqual({
        client_id: "local-strava-client",
        redirect_uri: "http://localhost:8787/integrations/strava/callback",
        response_type: "code",
        approval_prompt: "force",
        scope: "activity:write",
        state: stateOf(url),
      })
    }),
  )

  const prefix = "exp://localhost:8081/"
  const suffix = "/--/settings/integrations"
  const ofLength = (n: number) =>
    `${prefix}${"a".repeat(n - prefix.length - suffix.length)}${suffix}`

  it.effect("keeps the state under 600 chars for the longest allowed returnTo", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      const { url } = yield* startConnect(provider, user, ofLength(MAX_RETURN_TO))
      expect(stateOf(url).length).toBeLessThan(MAX_STATE_LENGTH)
      expect(authorizeUrl(provider, stateOf(url))).toBe(url)
    }),
  )

  it.effect("rejects a 512-char returnTo (schema-valid, but its state would exceed 600)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(startConnect(provider, user, ofLength(512)))
      expect(error).toMatchObject({ _tag: "ConnectRejected", reason: "return-to" })
    }),
  )

  it.effect("rejects a returnTo outside the allow-list with ConnectRejected{return-to}", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        startConnect(base, user, "https://evil/settings/integrations"),
      )
      expect(error).toMatchObject({ _tag: "ConnectRejected", reason: "return-to" })
    }),
  )

  it.effect(
    "rejects provider mode without a client secret with ConnectRejected{not-configured}",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          startConnect({ ...provider, stravaClientSecret: Option.none() }, user, WEB),
        )
        expect(error).toMatchObject({ _tag: "ConnectRejected", reason: "not-configured" })
      }),
  )
})

describe("startConnect in console mode (REV-2)", () => {
  it.effect("rejects console mode outside local with ConnectRejected{not-configured}", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        startConnect({ ...base, environment: "production" }, user, WEB),
      )
      expect(error).toMatchObject({ _tag: "ConnectRejected", reason: "not-configured" })
    }),
  )

  it.effect("accepts console mode when the environment is local", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T0)
      expect(base.environment).toBe("local")
      const { url } = yield* startConnect(base, user, WEB)
      expect(new URL(url).searchParams.get("code")).toBe("console")
    }),
  )
})
