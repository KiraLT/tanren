import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Ref, Schema } from "effect"
import {
  Headers,
  HttpClient,
  HttpClientError,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/http"
import { WorkerConfig } from "../Config"
import type { EnvVars } from "../Env"
import { EmailSender } from "./EmailSender"
import { MAGIC_LINK_SUBJECT } from "./magicLinkEmail"
import { RESEND_EMAILS_URL, resendBody } from "./ResendEmailSender"

const API_KEY = "re_test_only_secret_value"
const providerEnv: EnvVars = {
  ENVIRONMENT: "production",
  BETTER_AUTH_URL: "https://api.tanren.me",
  BETTER_AUTH_SECRET: "test-only-not-a-secret-000000000000000000000",
  ALLOWED_ORIGINS: "https://tanren.me",
  EMAIL_MODE: "provider",
  EMAIL_FROM: "Tanren <login@tanren.me>",
  RESEND_API_KEY: API_KEY,
  MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp",
  STRAVA_MODE: "provider",
  STRAVA_CLIENT_ID: "test-strava-client",
  STRAVA_CLIENT_SECRET: "test-only-strava-secret",
  INTEGRATION_TOKEN_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", // 32 x 0x01, test only
}
const magicLink = {
  email: "lukas@example.com",
  url: "https://api.tanren.me/api/auth/magic-link/verify?token=abc&callbackURL=%2F",
}

/** The JSON body Resend expects (https://resend.com/docs/api-reference/emails/send-email). */
const ResendRequest = Schema.Struct({
  from: Schema.String,
  to: Schema.Array(Schema.String),
  subject: Schema.String,
  text: Schema.String,
  html: Schema.String,
})
const decodeBody = (request: HttpClientRequest.HttpClientRequest) =>
  Schema.decodeUnknownSync(Schema.fromJsonString(ResendRequest))(
    request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "",
  )

type Reply =
  | { readonly _tag: "Status"; readonly status: number; readonly body: string }
  | { readonly _tag: "Transport" }

/** A fake `HttpClient` that records every request and answers with `reply`. */
const sendWith = (reply: Reply) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<HttpClientRequest.HttpClientRequest>>([])
    const client = HttpClient.make((request) =>
      Ref.update(seen, (all) => [...all, request]).pipe(
        Effect.andThen(
          reply._tag === "Transport"
            ? Effect.fail(
                new HttpClientError.HttpClientError({
                  reason: new HttpClientError.TransportError({
                    request,
                    description: "connection reset",
                  }),
                }),
              )
            : Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response(reply.body, { status: reply.status }),
                ),
              ),
        ),
      ),
    )
    const send = Effect.gen(function* () {
      return yield* (yield* EmailSender).send(magicLink)
    }).pipe(
      Effect.provide(
        EmailSender.layerResend.pipe(
          Layer.provide(
            Layer.merge(
              Layer.orDie(WorkerConfig.layerFromEnv(providerEnv)),
              Layer.succeed(HttpClient.HttpClient, client),
            ),
          ),
        ),
      ),
    )
    return { send, requests: Ref.get(seen) }
  })

describe("ResendEmailSender", () => {
  it.effect("posts one email per magic link with the bearer key, sender and link", () =>
    Effect.gen(function* () {
      const { send, requests } = yield* sendWith({
        _tag: "Status",
        status: 200,
        body: '{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}',
      })
      yield* send
      const sent = yield* requests
      expect(sent).toHaveLength(1)
      const [request] = sent
      expect(request?.method).toBe("POST")
      expect(request?.url).toBe(RESEND_EMAILS_URL)
      expect(
        Option.fromNullishOr(request).pipe(
          Option.flatMap((r) => Headers.get(r.headers, "authorization")),
        ),
      ).toEqual(Option.some(`Bearer ${API_KEY}`))
      const body = Option.fromNullishOr(request).pipe(Option.map(decodeBody))
      expect(Option.map(body, ({ from, to, subject }) => ({ from, to, subject }))).toEqual(
        Option.some({
          from: "Tanren <login@tanren.me>",
          to: ["lukas@example.com"],
          subject: MAGIC_LINK_SUBJECT,
        }),
      )
      expect(Option.map(body, ({ text }) => text.includes(magicLink.url))).toEqual(
        Option.some(true),
      )
      expect(Option.map(body, ({ html }) => html.includes("token=abc&amp;callbackURL"))).toEqual(
        Option.some(true),
      )
    }),
  )

  it.effect("fails with EmailSendFailed carrying a 4xx status", () =>
    Effect.gen(function* () {
      const { send } = yield* sendWith({
        _tag: "Status",
        status: 422,
        body: '{"statusCode":422,"name":"validation_error","message":"domain not verified"}',
      })
      const error = yield* Effect.flip(send)
      expect(error._tag).toBe("EmailSendFailed")
      expect(error.status).toEqual(Option.some(422))
      expect({ provider: error.provider, reason: error.reason }).toEqual({
        provider: "resend",
        reason: "rejected",
      })
      expect(error.message).toContain("422")
      expect(error.message).toContain("domain not verified")
      expect(JSON.stringify(error)).not.toContain(API_KEY)
    }),
  )

  it.effect("fails with EmailSendFailed carrying a 5xx status", () =>
    Effect.gen(function* () {
      const { send } = yield* sendWith({ _tag: "Status", status: 503, body: "" })
      const error = yield* Effect.flip(send)
      expect(error.status).toEqual(Option.some(503))
      expect(error.reason).toBe("provider_error")
      expect(error.message).toContain("503")
      expect(error.message).not.toContain(API_KEY)
    }),
  )

  it.effect("fails with EmailSendFailed on a transport failure", () =>
    Effect.gen(function* () {
      const { send, requests } = yield* sendWith({ _tag: "Transport" })
      const error = yield* Effect.flip(send)
      expect(yield* requests).toHaveLength(1)
      expect(error._tag).toBe("EmailSendFailed")
      expect(error.status).toEqual(Option.none())
      expect(error.reason).toBe("transport")
      expect(error.message).toContain("TransportError")
      expect(`${error.message} ${String(error)} ${JSON.stringify(error)}`).not.toContain(API_KEY)
    }),
  )
})

describe("ResendEmailSender error bodies", () => {
  it.effect("a non-JSON (HTML) error body still fails typed, with the status", () =>
    Effect.gen(function* () {
      const { send } = yield* sendWith({
        _tag: "Status",
        status: 502,
        body: "<html><body>Bad Gateway</body></html>",
      })
      const error = yield* Effect.flip(send)
      expect(error._tag).toBe("EmailSendFailed")
      expect(error.status).toEqual(Option.some(502))
      expect(error.message).toContain("Bad Gateway")
    }),
  )

  it.effect("truncates a huge error body to 500 characters", () =>
    Effect.gen(function* () {
      const { send } = yield* sendWith({ _tag: "Status", status: 500, body: "x".repeat(5000) })
      const error = yield* Effect.flip(send)
      expect(error.message.length).toBeLessThan(600)
    }),
  )

  it("escapes quotes and angle brackets of the url in the html body, not in the text body", () => {
    const body = resendBody("a@b.c", { email: "x@y.z", url: 'https://h/?a="1"&b=<2>' })
    expect(body.html).toContain("a=&quot;1&quot;&amp;b=&lt;2&gt;")
    expect(body.html).not.toContain('"1"')
    expect(body.text).toContain('a="1"&b=<2>')
  })
})
