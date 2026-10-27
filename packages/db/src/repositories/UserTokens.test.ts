import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect } from "effect"
import { TestLayer } from "../testing/fixtures"
import { UserNotFound, UserTokens } from "./UserTokens"

const userOf = (n: number) =>
  UserId.make(`00000000-0000-4000-8000-${(9000 + n).toString().padStart(12, "0")}`)

/** Better Auth owns `user`; the token generation columns take their SQL default (0). */
const insertUser = (id: UserId) =>
  Effect.promise(() =>
    env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, 'T', ?, 1, '2026-10-27T10:00:00.000Z', '2026-10-27T10:00:00.000Z')`,
    )
      .bind(id, `${id}@example.com`)
      .run(),
  )

describe("UserTokens", () => {
  it.effect("a new user starts at generation 0 for both families", () =>
    Effect.gen(function* () {
      const repo = yield* UserTokens
      const user = userOf(1)
      yield* insertUser(user)
      expect(yield* repo.tokenGens(user)).toEqual({ app: 0, mcp: 0 })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("bumpAppTokenGen adds exactly 1 each call and leaves mcp alone", () =>
    Effect.gen(function* () {
      const repo = yield* UserTokens
      const user = userOf(2)
      yield* insertUser(user)
      yield* repo.bumpAppTokenGen(user)
      expect(yield* repo.tokenGens(user)).toEqual({ app: 1, mcp: 0 })
      yield* repo.bumpAppTokenGen(user)
      expect(yield* repo.tokenGens(user)).toEqual({ app: 2, mcp: 0 })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("bumpMcpTokenGen adds exactly 1 each call and leaves app alone", () =>
    Effect.gen(function* () {
      const repo = yield* UserTokens
      const user = userOf(3)
      yield* insertUser(user)
      yield* repo.bumpMcpTokenGen(user)
      yield* repo.bumpMcpTokenGen(user)
      expect(yield* repo.tokenGens(user)).toEqual({ app: 0, mcp: 2 })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a bump touches only that user's row", () =>
    Effect.gen(function* () {
      const repo = yield* UserTokens
      const [a, b] = [userOf(4), userOf(5)]
      yield* insertUser(a)
      yield* insertUser(b)
      yield* repo.bumpAppTokenGen(a)
      expect(yield* repo.tokenGens(b)).toEqual({ app: 0, mcp: 0 })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("tokenGens on an unknown user fails with UserNotFound", () =>
    Effect.gen(function* () {
      const repo = yield* UserTokens
      const error = yield* Effect.flip(repo.tokenGens(userOf(98)))
      expect(error).toBeInstanceOf(UserNotFound)
      expect(error).toMatchObject({ _tag: "UserNotFound", userId: userOf(98) })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("both bumps on an unknown user fail with UserNotFound", () =>
    Effect.gen(function* () {
      const repo = yield* UserTokens
      const app = yield* Effect.flip(repo.bumpAppTokenGen(userOf(99)))
      const mcp = yield* Effect.flip(repo.bumpMcpTokenGen(userOf(99)))
      expect(app._tag).toBe("UserNotFound")
      expect(mcp._tag).toBe("UserNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})
