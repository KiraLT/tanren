import {
  alreadyBurned,
  BURNED,
  OAuthCodeUseRepo,
  type OAuthCodeUseRepoShape,
  type TokenGens,
  UserTokens,
  type UserTokensShape,
} from "@tanren/db"
import type { UserId } from "@tanren/shared"
import { Context, DateTime, Effect, HashMap, Layer, Option, Ref } from "effect"

// In-memory `UserTokens` (incl. the refresh burn ledger, migration 0010) and `OAuthCodeUseRepo`
// (migration 0006) for Node tests. There is no user table here: every user id exists and starts at
// generation 0, so `UserNotFound` never occurs.

const ZERO: TokenGens = { app: 0, mcp: 0 }

interface BurnRow {
  readonly expiresAt: DateTime.Utc
  readonly burnedAt: DateTime.Utc
}

const makeMemory = Effect.gen(function* () {
  const gens = yield* Ref.make(HashMap.empty<UserId, TokenGens>())
  const burned = yield* Ref.make(HashMap.empty<string, DateTime.Utc>())
  const refreshBurns = yield* Ref.make(HashMap.empty<string, BurnRow>())
  /** Keeps the ledger rows whose expiry is not strictly before `now` (the D1 `purge` rule). */
  const unexpired =
    <V>(now: DateTime.Utc, expiryOf: (row: V) => DateTime.Utc) =>
    (map: HashMap.HashMap<string, V>): HashMap.HashMap<string, V> =>
      HashMap.filter(map, (row) => !DateTime.isLessThan(expiryOf(row), now))

  const current = (map: HashMap.HashMap<UserId, TokenGens>, userId: UserId): TokenGens =>
    Option.getOrElse(HashMap.get(map, userId), () => ZERO)

  const bump = (key: keyof TokenGens) => (userId: UserId) =>
    Ref.update(gens, (map) => {
      const was = current(map, userId)
      return HashMap.set(map, userId, { ...was, [key]: was[key] + 1 })
    })

  const userTokens: UserTokensShape = {
    tokenGens: (userId) => Effect.map(Ref.get(gens), (map) => current(map, userId)),
    email: (userId) => Effect.succeed(`${userId}@memory.invalid`),
    bumpAppTokenGen: bump("app"),
    bumpMcpTokenGen: bump("mcp"),
    burnRefresh: ({ jti, expiresAt, burnedAt }) =>
      Ref.modify(refreshBurns, (map) =>
        Option.match(HashMap.get(map, jti), {
          onNone: () => [BURNED, HashMap.set(map, jti, { expiresAt, burnedAt })],
          onSome: (row) => [alreadyBurned(Option.some(row.burnedAt)), map],
        }),
      ),
    purgeBurnedRefresh: (now) =>
      Ref.update(
        refreshBurns,
        unexpired(now, (row: BurnRow) => row.expiresAt),
      ),
  }
  const codeUse: OAuthCodeUseRepoShape = {
    burn: (jti, expiresAt) =>
      Ref.modify(burned, (map) =>
        HashMap.has(map, jti) ? [false, map] : [true, HashMap.set(map, jti, expiresAt)],
      ),
    purge: (now) =>
      Ref.update(
        burned,
        unexpired(now, (expiresAt: DateTime.Utc) => expiresAt),
      ),
  }
  return Context.make(UserTokens, userTokens).pipe(Context.add(OAuthCodeUseRepo, codeUse))
})

export const MemoryTokens = {
  /** Both ports on fresh in-memory state per layer build. */
  layer: Layer.effectContext(makeMemory),
}
