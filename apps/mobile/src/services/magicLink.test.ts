import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Ref, Result } from "effect"
import { FetchHttpClient } from "effect/http"
import {
  MagicLinkFailed,
  magicLinkBody,
  magicLinkFailureMessage,
  nativeCallbackUrl,
  normalizeEmail,
  sendMagicLink,
  signInSupported,
  todayCallbackUrl,
} from "./magicLink"

describe("normalizeEmail", () => {
  it("trims a plausible address", () => {
    expect(normalizeEmail("  dev@tanren.local ")).toEqual(Option.some("dev@tanren.local"))
  })

  it("rejects text that is not an email", () => {
    const results = ["", "   ", "dev", "dev@", "dev@tanren", "a b@c.d"].map(normalizeEmail)
    expect(results.every(Option.isNone)).toBe(true)
  })
})

describe("signInSupported", () => {
  it("is true on web, ios and android only", () => {
    expect(["web", "ios", "android"].every(signInSupported)).toBe(true)
    expect(["windows", "macos", ""].some(signInSupported)).toBe(false)
  })
})

describe("nativeCallbackUrl", () => {
  it("is the worker's complete page with the challenge and the encoded deep link", () => {
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const returnTo = "exp://192.168.1.5:8081/--/auth/callback"
    const url = nativeCallbackUrl(challenge, returnTo)
    expect(url.startsWith("/auth/native/complete?")).toBe(true)
    const params = new URL(url, "http://api.test").searchParams
    expect(params.get("challenge")).toBe(challenge)
    expect(params.get("returnTo")).toBe(returnTo)
    expect(url).toContain("returnTo=exp%3A%2F%2F192.168.1.5%3A8081%2F--%2Fauth%2Fcallback")
  })
})

describe("todayCallbackUrl", () => {
  it("is the page origin plus /today", () => {
    expect(todayCallbackUrl("http://localhost:8790")).toBe("http://localhost:8790/today")
  })

  it("ignores a trailing slash on the origin", () => {
    expect(todayCallbackUrl("http://localhost:8790/")).toBe("http://localhost:8790/today")
  })

  it("never yields an exp:// callback", () => {
    expect(todayCallbackUrl("http://192.168.1.5:8081").startsWith("exp://")).toBe(false)
  })
})

describe("magicLinkBody", () => {
  it("carries exactly email and callbackURL", () => {
    expect(magicLinkBody("dev@tanren.local", "http://localhost:8790/today")).toEqual({
      email: "dev@tanren.local",
      callbackURL: "http://localhost:8790/today",
    })
  })
})

describe("magicLinkFailureMessage", () => {
  it("explains each failure reason", () => {
    expect(
      magicLinkFailureMessage(
        new MagicLinkFailed({ reason: "invalid-email", status: Option.none() }),
      ),
    ).toBe("Enter a valid email address.")
    expect(
      magicLinkFailureMessage(
        new MagicLinkFailed({ reason: "unreachable", status: Option.none() }),
      ),
    ).toContain("Could not reach the server")
    expect(
      magicLinkFailureMessage(
        new MagicLinkFailed({ reason: "rejected", status: Option.some(403) }),
      ),
    ).toBe("The server refused the request (403). Try again.")
  })
})

interface SeenRequest {
  readonly url: string
  readonly method: string
  readonly body: string
  readonly credentials: string
}

/** Stands in for `fetch`: records each request it receives, then answers with `respond`. */
const recordingFetch =
  (
    seen: Ref.Ref<ReadonlyArray<SeenRequest>>,
    respond: () => Promise<Response>,
  ): typeof globalThis.fetch =>
  async (input, init) => {
    const request = new Request(input, init)
    const body = await request.text()
    Effect.runSync(
      Ref.update(
        seen,
        Arr.append({
          url: request.url,
          method: request.method,
          body,
          credentials: request.credentials,
        }),
      ),
    )
    return respond()
  }

const callbackURL = "http://localhost:8790/today"

const sendWith = (rawEmail: string, respond: () => Promise<Response>) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<SeenRequest>>([])
    const result = yield* Effect.result(
      sendMagicLink(rawEmail, callbackURL).pipe(
        Effect.provideService(FetchHttpClient.Fetch, recordingFetch(seen, respond)),
      ),
    )
    return { result, seen: yield* Ref.get(seen) }
  })

describe("sendMagicLink", () => {
  it.effect("posts the JSON body to the magic-link endpoint with credentials", () =>
    Effect.gen(function* () {
      const { result, seen } = yield* sendWith("  dev@tanren.local ", () =>
        Promise.resolve(new Response("{}", { status: 200 })),
      )
      expect(Result.isSuccess(result)).toBe(true)
      expect(seen).toEqual([
        {
          url: "http://localhost:8787/api/auth/sign-in/magic-link",
          method: "POST",
          body: JSON.stringify(magicLinkBody("dev@tanren.local", callbackURL)),
          credentials: "include",
        },
      ])
    }),
  )

  it.effect("fails as rejected with the status when the server answers 403", () =>
    Effect.gen(function* () {
      const { result } = yield* sendWith("dev@tanren.local", () =>
        Promise.resolve(new Response("", { status: 403 })),
      )
      expect(Result.isFailure(result) ? result.failure : undefined).toEqual(
        new MagicLinkFailed({ reason: "rejected", status: Option.some(403) }),
      )
    }),
  )

  it.effect("fails as unreachable when fetch itself fails", () =>
    Effect.gen(function* () {
      const { result } = yield* sendWith("dev@tanren.local", () =>
        Promise.reject(new TypeError("fetch failed")),
      )
      expect(Result.isFailure(result) ? result.failure : undefined).toEqual(
        new MagicLinkFailed({ reason: "unreachable", status: Option.none() }),
      )
    }),
  )

  it.effect("sends no request for an invalid email", () =>
    Effect.gen(function* () {
      const { result, seen } = yield* sendWith("not-an-email", () =>
        Promise.resolve(new Response("{}", { status: 200 })),
      )
      expect(Result.isFailure(result) ? result.failure : undefined).toEqual(
        new MagicLinkFailed({ reason: "invalid-email", status: Option.none() }),
      )
      expect(seen).toEqual([])
    }),
  )
})

describe("normalizeEmail edge cases", () => {
  it("trims tabs and newlines, keeps case, rejects inner whitespace, empty and multiple @", () => {
    expect(normalizeEmail("\t Dev@Tanren.Local \n")).toEqual(Option.some("Dev@Tanren.Local"))
    expect(Option.isNone(normalizeEmail(""))).toBe(true)
    expect(Option.isNone(normalizeEmail("   "))).toBe(true)
    expect(Option.isNone(normalizeEmail("a b@c.de"))).toBe(true)
    expect(Option.isNone(normalizeEmail("a@@c.de"))).toBe(true)
    expect(Option.isNone(normalizeEmail("a@c"))).toBe(true)
    expect(Option.isNone(normalizeEmail("@c.de"))).toBe(true)
  })
})
