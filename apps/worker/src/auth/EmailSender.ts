import { Context, Effect, Layer, Match, Ref } from "effect"
import { FetchHttpClient } from "effect/http"
import { WorkerConfig } from "../Config"
import type { EmailSenderShape, MagicLinkEmail } from "./Email"
import { MAGIC_LINK_SUBJECT } from "./magicLinkEmail"
import { makeResendSender } from "./ResendEmailSender"

export type { EmailSenderShape } from "./Email"

export class EmailSender extends Context.Service<EmailSender, EmailSenderShape>()(
  "@tanren/worker/EmailSender",
) {
  /** Local dev: the link goes to the log, where the owner copies it. */
  static readonly layerConsole = Layer.succeed(
    this,
    this.of({
      send: ({ email, url }) =>
        Effect.logInfo(`magic link for ${email} (${MAGIC_LINK_SUBJECT}): ${url}`),
    }),
  )

  /** Resend over whatever `HttpClient` the caller provides (tests pass a fake). */
  static readonly layerResend = Layer.effect(this, makeResendSender)

  /** Production: Resend over the Workers `fetch` (docs/adr/0008). */
  static readonly layerProvider = this.layerResend.pipe(Layer.provide(FetchHttpClient.layer))

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
