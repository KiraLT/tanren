import { Context, Data, Effect, Layer, Match, Ref, Schema } from "effect"
import { WorkerConfig } from "../Config"

/** One magic-link email: the recipient and the sign-in URL Better Auth generated. */
export const MagicLinkEmail = Schema.Struct({ email: Schema.String, url: Schema.String })
export type MagicLinkEmail = typeof MagicLinkEmail.Type

/** `EMAIL_MODE=provider` has no email provider yet (docs/design/local-dev.md §4). Internal. */
export class EmailProviderMissing extends Data.TaggedError("EmailProviderMissing")<{
  readonly message: string
}> {}

export interface EmailSenderShape {
  readonly send: (magicLink: MagicLinkEmail) => Effect.Effect<void, EmailProviderMissing>
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

  /** No provider is chosen yet: every send fails, so sign-in fails loudly instead of silently. */
  static readonly layerProvider = Layer.succeed(
    this,
    this.of({
      send: () =>
        Effect.fail(
          new EmailProviderMissing({
            message: "EMAIL_MODE=provider: no email provider configured",
          }),
        ),
    }),
  )

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
