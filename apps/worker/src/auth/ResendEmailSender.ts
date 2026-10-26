import { Effect, Option } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { WorkerConfig } from "../Config"
import { type EmailSenderShape, EmailSendFailed, type MagicLinkEmail } from "./Email"
import { MAGIC_LINK_EXPIRES_IN_MINUTES, magicLinkEmail } from "./magicLinkEmail"

const PROVIDER = "resend"

/** https://resend.com/docs/api-reference/emails/send-email */
export const RESEND_EMAILS_URL = "https://api.resend.com/emails"

/** The Resend `POST /emails` body for one magic link. */
export const resendBody = (from: string, { email, url }: MagicLinkEmail) => {
  const { subject, text, html } = magicLinkEmail({
    url,
    expiresInMinutes: MAGIC_LINK_EXPIRES_IN_MINUTES,
    appName: "Tanren",
  })
  return { from, to: [email], subject, text, html }
}

/**
 * `EMAIL_MODE=provider`: one `POST /emails` per magic link. `EmailSender.layerResend` wraps it in a
 * layer; this module never imports `EmailSender`, so the two files have no import cycle.
 */
export const makeResendSender: Effect.Effect<
  EmailSenderShape,
  never,
  WorkerConfig | HttpClient.HttpClient
> = Effect.gen(function* () {
  const config = yield* WorkerConfig
  const client = yield* HttpClient.HttpClient
  const send = Effect.fn("ResendEmailSender.send")(function* (magicLink: MagicLinkEmail) {
    // `WorkerConfig` refuses `EMAIL_MODE=provider` without a key, so None here is a wiring bug.
    const apiKey = yield* Option.match(config.resendApiKey, {
      onNone: () =>
        Effect.fail(
          new EmailSendFailed({
            provider: PROVIDER,
            reason: "not_configured",
            message: "RESEND_API_KEY is not configured",
            status: Option.none(),
          }),
        ),
      onSome: Effect.succeed,
    })
    const request = HttpClientRequest.post(RESEND_EMAILS_URL).pipe(
      HttpClientRequest.bearerToken(apiKey),
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyJsonUnsafe(resendBody(config.emailFrom, magicLink)),
    )
    const response = yield* client.execute(request).pipe(
      Effect.mapError(
        (error) =>
          new EmailSendFailed({
            provider: PROVIDER,
            reason: "transport",
            message: `Resend request failed: ${error.reason._tag}`,
            status: Option.none(),
          }),
      ),
    )
    if (response.status < 200 || response.status >= 300) {
      const detail = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
      return yield* new EmailSendFailed({
        provider: PROVIDER,
        reason: response.status >= 400 && response.status < 500 ? "rejected" : "provider_error",
        message: `Resend responded ${response.status}: ${detail.slice(0, 500)}`,
        status: Option.some(response.status),
      })
    }
  })
  return { send }
})
