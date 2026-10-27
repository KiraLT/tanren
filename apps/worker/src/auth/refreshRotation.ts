import type { RefreshBurnOutcome } from "@tanren/db"
import { DateTime, Duration, Match, Option } from "effect"
import { CLOCK_SKEW_SECONDS } from "./Tokens"

// Refresh-token rotation rules (ADR-0022 amendment STLS-F5), shared by the app refresh
// (`tokenRoutes.ts`) and the MCP refresh grant (`oauth/token.ts`).

/**
 * A burned refresh token re-sent within this window of its first burn gets a fresh pair and no
 * generation bump: a client that lost the rotated pair (timeout, failed store, suspended app) is
 * not a thief (Auth0's "reuse interval"). Later re-sends are reuse.
 */
export const REUSE_GRACE = Duration.seconds(30)

/**
 * The ledger row's retention for a token whose `exp` claim is `exp` (epoch seconds): verification
 * accepts the token until `exp + CLOCK_SKEW_SECONDS`, so the row must outlive that instant or a
 * purge would forget a burned token that still verifies. Also used for `oauth_code_use`.
 */
export const retainUntil = (exp: number): Option.Option<DateTime.Utc> =>
  Option.map(DateTime.make((exp + CLOCK_SKEW_SECONDS) * 1000), DateTime.toUtc)

export type RefreshVerdict = "rotate" | "grace" | "reuse"

/** `rotate`: first burn; `grace`: re-sent within `REUSE_GRACE`; `reuse`: anything else. */
export const verdictOf = (outcome: RefreshBurnOutcome, now: DateTime.Utc): RefreshVerdict =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Burned: (): RefreshVerdict => "rotate",
      AlreadyBurned: ({ burnedAt }): RefreshVerdict =>
        Option.match(burnedAt, {
          onNone: () => "reuse",
          onSome: (at) =>
            Duration.isLessThanOrEqualTo(DateTime.distance(at, now), REUSE_GRACE)
              ? "grace"
              : "reuse",
        }),
    }),
  )
