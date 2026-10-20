import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Option, Schema } from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import { CurrentUser, ownerId, parseDevUserId, resolveSignedIn, SessionBody } from "./CurrentUser"

const USER = UserId.make("00000000-0000-4000-8000-0000000000aa")
const STORED = UserId.make("00000000-0000-4000-8000-0000000000bb")

const signedOut = Effect.succeed(Option.none<UserId>())
const stored = Effect.succeed(Option.some(STORED))

describe("parseDevUserId", () => {
  it("accepts a UUID, trimmed", () => {
    expect(parseDevUserId(` ${USER} `)).toEqual(Option.some(USER))
  })

  it("ignores an unset, empty or invalid value", () => {
    expect(parseDevUserId(undefined)).toEqual(Option.none())
    expect(parseDevUserId("  ")).toEqual(Option.none())
    expect(parseDevUserId("lukas")).toEqual(Option.none())
  })
})

describe("SessionBody", () => {
  it("decodes a signed-out null and a signed-in user id", () => {
    const decode = Schema.decodeUnknownSync(SessionBody)
    expect(decode(null)).toBeNull()
    expect(decode({ session: { id: "s" }, user: { id: USER, email: "a@b.c" } })).toEqual({
      user: { id: USER },
    })
  })
})

describe("resolveSignedIn", () => {
  it.effect("prefers the dev override over the session", () =>
    Effect.gen(function* () {
      const result = yield* resolveSignedIn({
        devUserId: Option.some(USER),
        session: signedOut,
        storedOwner: stored,
      })
      expect(result).toEqual(Option.some(USER))
    }),
  )

  it.effect("treats a null session as signed out, even with a stored owner", () =>
    Effect.gen(function* () {
      const result = yield* resolveSignedIn({
        devUserId: Option.none(),
        session: signedOut,
        storedOwner: stored,
      })
      expect(result).toEqual(Option.none())
    }),
  )

  it.effect("falls back to the stored owner when the worker cannot be asked", () =>
    Effect.gen(function* () {
      const result = yield* resolveSignedIn({
        devUserId: Option.none(),
        session: Effect.fail("unreachable"),
        storedOwner: stored,
      })
      expect(result).toEqual(Option.some(STORED))
    }),
  )
})

describe("ownerId", () => {
  it.effect("is the signed-in user, else LOCAL_USER_ID", () =>
    Effect.gen(function* () {
      const signedIn = yield* CurrentUser.use(ownerId).pipe(
        Effect.provide(CurrentUser.layerTest(Option.some(USER))),
      )
      const local = yield* CurrentUser.use(ownerId).pipe(
        Effect.provide(CurrentUser.layerTest(Option.none())),
      )
      expect([signedIn, local]).toEqual([USER, LOCAL_USER_ID])
    }),
  )
})
