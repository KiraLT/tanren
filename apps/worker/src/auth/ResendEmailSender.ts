import { Effect, Layer, Option } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { WorkerConfig } from "../Config"
import { EmailSender, EmailSendFailed, type MagicLinkEmail } from "./EmailSender"

/** https://resend.com/docs/api-reference/emails/send-email */
export const RESEND_EMAILS_URL = "https://api.resend.com/emails"
export const MAGIC_LINK_SUBJECT = "Sign in to Tanren"

const escapeHtml = (raw: string): string =>
  raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

/** The Resend `POST /emails` body for one magic link. */
export const resendBody = (from: string, { email, url }: MagicLinkEmail) => ({
  from,
  to: [email],
  subject: MAGIC_LINK_SUBJECT,
  text: `Sign in to Tanren: ${url}\n\nThe link expires soon. If you did not ask for it, ignore this email.`,
  html: `<p><a href="${escapeHtml(url)}">Sign in to Tanren</a></p><p>The link expires soon. If you did not ask for it, ignore this email.</p>`,
})

const make = Effect.gen(function* () {
  const config = yield* WorkerConfig
  const client = yield* HttpClient.HttpClient
  const send = Effect.fn("ResendEmailSender.send")(function* (magicLink: MagicLinkEmail) {
    // `WorkerConfig` refuses `EMAIL_MODE=provider` without a key, so None here is a wiring bug.
    const apiKey = yield* Option.match(config.resendApiKey, {
      onNone: () =>
        Effect.fail(
          new EmailSendFailed({
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
            message: `Resend request failed: ${error.reason._tag}`,
            status: Option.none(),
          }),
      ),
    )
    if (response.status < 200 || response.status >= 300) {
      const detail = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
      return yield* new EmailSendFailed({
        message: `Resend responded ${response.status}: ${detail.slice(0, 500)}`,
        status: Option.some(response.status),
      })
    }
  })
  return EmailSender.of({ send })
})

export const ResendEmailSender = {
  /**
   * `EMAIL_MODE=provider`: one `POST /emails` per magic link. `Layer.suspend` because
   * `EmailSender.ts` imports this module: `EmailSender` is not initialised yet when this file is
   * evaluated through that cycle, so it may only be read once the layer is built.
   */
  layer: Layer.suspend(() => Layer.effect(EmailSender, make)) satisfies Layer.Layer<
    EmailSender,
    never,
    WorkerConfig | HttpClient.HttpClient
  >,
}
