import {
  OAuthCodeUseRepo,
  type OAuthCodeUseRepoShape,
  type TokenGens,
  UserTokens,
  type UserTokensShape,
} from "@tanren/db"
import type { UserId } from "@tanren/shared"
import { Context, DateTime, Effect, HashMap, Layer, Option, Ref } from "effect"

// In-memory `UserTokens` and `OAuthCodeUseRepo` (migration 0006) for Node tests. There is no user
// table here: every user id exists and starts at generation 0, so `UserNotFound` never occurs.

const ZERO: TokenGens = { app: 0, mcp: 0 }

const makeMemory = Effect.gen(function* () {
  const gens = yield* Ref.make(HashMap.empty<UserId, TokenGens>())
  const burned = yield* Ref.make(HashMap.empty<string, DateTime.Utc>())

  const current = (map: HashMap.HashMap<UserId, TokenGens>, userId: UserId): TokenGens =>
    Option.getOrElse(HashMap.get(map, userId), () => ZERO)

  const bump = (key: keyof TokenGens) => (userId: UserId) =>
    Ref.update(gens, (map) => {
      const was = current(map, userId)
      return HashMap.set(map, userId, { ...was, [key]: was[key] + 1 })
    })

  const userTokens: UserTokensShape = {
    tokenGens: (userId) => Effect.map(Ref.get(gens), (map) => current(map, userId)),
    bumpAppTokenGen: bump("app"),
    bumpMcpTokenGen: bump("mcp"),
  }
  const codeUse: OAuthCodeUseRepoShape = {
    burn: (jti, expiresAt) =>
      Ref.modify(burned, (map) =>
        HashMap.has(map, jti) ? [false, map] : [true, HashMap.set(map, jti, expiresAt)],
      ),
    purge: (now) =>
      Ref.update(
        burned,
        HashMap.filter((expiresAt) => !DateTime.isLessThan(expiresAt, now)),
      ),
  }
  return Context.make(UserTokens, userTokens).pipe(Context.add(OAuthCodeUseRepo, codeUse))
})

export const MemoryTokens = {
  /** Both ports on fresh in-memory state per layer build. */
  layer: Layer.effectContext(makeMemory),
}
