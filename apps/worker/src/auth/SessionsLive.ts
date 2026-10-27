import { SessionStoreUnavailable, UserId } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import type { WorkerConfig } from "../Config"
import { BetterAuth } from "./BetterAuth"
import { Sessions } from "./Sessions"
import { Tokens } from "./Tokens"

const BEARER = /^Bearer\s+(\S+)$/i

/**
 * The `Authorization: Bearer` credential when it is shaped like a JWT (three dot-separated parts).
 * A Better Auth session token has at most one dot (`token.signature`), so the two never collide.
 */
export const bearerJwt = (headers: globalThis.Headers): Option.Option<string> =>
  Option.fromNullishOr(headers.get("authorization")).pipe(
    Option.flatMap((header) => Option.fromNullishOr(BEARER.exec(header.trim())?.[1])),
    Option.filter((token) => token.split(".").length === 3),
  )

/**
 * Who is signed in (auth-v2.md §1, §4):
 * - `Authorization: Bearer <app access JWT>` (native) → `Tokens.verifyApp`, no D1 read; a rejected
 *   JWT is signed out, never 503, and never falls through to Better Auth (whose bearer plugin would
 *   read the session row for a dotted token).
 * - anything else → Better Auth `getSession` (web cookie; `cookieCache` answers without D1 within
 *   15 minutes). A missing or forged cookie resolves to none; a rejected lookup is a store outage
 *   and fails with `SessionStoreUnavailable` (503).
 * Kept out of the `Sessions` port module so `Sessions.layerFixed` consumers never load better-auth.
 */
export const SessionsLiveNoDeps: Layer.Layer<Sessions, never, BetterAuth | Tokens> = Layer.effect(
  Sessions,
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth
    const tokens = yield* Tokens

    const fromCookie = (headers: globalThis.Headers) =>
      Effect.gen(function* () {
        const auth = yield* betterAuth.auth
        const session = yield* Effect.tryPromise(() => auth.api.getSession({ headers })).pipe(
          Effect.tapError((error) => Effect.logError("session lookup failed", error.cause)),
          Effect.mapError(
            () => new SessionStoreUnavailable({ message: "session store unavailable" }),
          ),
        )
        return yield* Option.match(Option.fromNullishOr(session), {
          onNone: () => Effect.succeed(Option.none<UserId>()),
          onSome: ({ user }) =>
            Schema.decodeUnknownEffect(UserId)(user.id).pipe(
              Effect.map(Option.some),
              // A non-UUID user id is not a user this API serves: signed out, but logged.
              Effect.catch((error) =>
                Effect.logWarning("session user id is not a UserId", error).pipe(
                  Effect.as(Option.none<UserId>()),
                ),
              ),
            ),
        })
      })

    const fromAppJwt = (token: string) =>
      tokens.verifyApp(token).pipe(
        Effect.map((identity) => Option.some(identity.userId)),
        Effect.catchTag("TokenRejected", () => Effect.succeed(Option.none<UserId>())),
      )

    return Sessions.of({
      current: (headers) =>
        Option.match(bearerJwt(headers), {
          onNone: () => fromCookie(headers),
          onSome: fromAppJwt,
        }),
    })
  }),
)

/** `SessionsLiveNoDeps` with the Worker's `Tokens` (one shared instance: `Tokens.layer` is one reference). */
export const SessionsLive: Layer.Layer<Sessions, never, BetterAuth | WorkerConfig> =
  SessionsLiveNoDeps.pipe(Layer.provide(Tokens.layer))
