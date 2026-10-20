import { EmailFailureReason } from "@tanren/shared"
import { type Effect, Schema } from "effect"

/** One magic-link email: the recipient and the sign-in URL Better Auth generated. */
export const MagicLinkEmail = Schema.Struct({ email: Schema.String, url: Schema.String })
export type MagicLinkEmail = typeof MagicLinkEmail.Type

/**
 * The provider did not accept the email: a non-2xx response (`status` is Some) or no response
 * (None). Internal (no `httpApiStatus`): `message` may hold the provider's raw reply, so it goes to
 * the log only; `authRoutes` answers 502 `EmailDeliveryFailed` with just `provider` and `reason`.
 * A schema rather than `Data.TaggedError` so `Schema.is` narrows a rejected Better Auth promise.
 */
export class EmailSendFailed extends Schema.TaggedError<EmailSendFailed>()("EmailSendFailed", {
  provider: Schema.String,
  reason: EmailFailureReason,
  message: Schema.String,
  status: Schema.Option(Schema.Number),
}) {}

/** What every email sender does; `EmailSender` (the service) and each provider share it. */
export interface EmailSenderShape {
  readonly send: (magicLink: MagicLinkEmail) => Effect.Effect<void, EmailSendFailed>
}
