import { Context, Data, Effect, Layer, Match, type Option, Ref, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { WorkerConfig } from "../Config"
import { ResendEmailSender } from "./ResendEmailSender"

/** One magic-link email: the recipient and the sign-in URL Better Auth generated. */
export const MagicLinkEmail = Schema.Struct({ email: Schema.String, url: Schema.String })
export type MagicLinkEmail = typeof MagicLinkEmail.Type

/**
 * The provider did not accept the email: a non-2xx response (`status` is Some) or a transport
 * failure (None). Internal: Better Auth turns the rejected send into a failed sign-in request.
 */
export class EmailSendFailed extends Data.TaggedError("EmailSendFailed")<{
  readonly message: string
  readonly status: Option.Option<number>
}> {}

export interface EmailSenderShape {
  readonly send: (magicLink: MagicLinkEmail) => Effect.Effect<void, EmailSendFailed>
}

export class EmailSender extends Context.Service<EmailSender, EmailSenderShape>()(
  "@tanren/worker/EmailSender",
) {
  /** Local dev: the link goes to the log, where the owner copies it. */
  static readonly layerConsole = Layer.succeed(
    this,
    this.of({
      send: ({ email, url }) => Effect.logInfo(`magic link for ${email}: ${url}`),
    }),
  )

  /** Production: Resend over the Workers `fetch` (docs/adr/0008). */
  static readonly layerProvider = ResendEmailSender.layer.pipe(Layer.provide(FetchHttpClient.layer))

  /** `EMAIL_MODE` from `WorkerConfig` picks the layer. */
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* WorkerConfig
      return Match.value(config.emailMode).pipe(
        Match.when("console", () => EmailSender.layerConsole),
        Match.when("provider", () => EmailSender.layerProvider),
        Match.exhaustive,
      )
    }),
  )

  /** Tests: records every send; read them through `CapturedEmails`. */
  static readonly layerCapture = Layer.effectContext(
    Effect.gen(function* () {
      const sent = yield* Ref.make<ReadonlyArray<MagicLinkEmail>>([])
      return Context.make(
        EmailSender,
        EmailSender.of({ send: (magicLink) => Ref.update(sent, (all) => [...all, magicLink]) }),
      ).pipe(Context.add(CapturedEmails, CapturedEmails.of({ sent: Ref.get(sent) })))
    }),
  )
}

export interface CapturedEmailsShape {
  /** Every magic link sent so far, oldest first. */
  readonly sent: Effect.Effect<ReadonlyArray<MagicLinkEmail>>
}

export class CapturedEmails extends Context.Service<CapturedEmails, CapturedEmailsShape>()(
  "@tanren/worker/CapturedEmails",
) {}
