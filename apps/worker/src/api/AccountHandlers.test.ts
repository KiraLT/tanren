import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Layer, Option } from "effect"
import { makeApp } from "../app"
import { Sessions } from "../auth/Sessions"
import { envVars as env } from "../testing/fixtures"

const owner = UserId.make("00000000-0000-4000-8000-0000000000d1")
const other = UserId.make("00000000-0000-4000-8000-0000000000d2")

/** Memory persistence (default); the `x-user` header is the signed-in user, none = signed out. */
const newApp = () =>
  makeApp(env, {
    auth: {
      _tag: "Fixed",
      sessions: Layer.succeed(
        Sessions,
        Sessions.of({
          current: (headers) =>
            Effect.succeed(Option.map(Option.fromNullishOr(headers.get("x-user")), UserId.make)),
        }),
      ),
    },
  })

const call = (
  app: ReturnType<typeof newApp>,
  method: string,
  path: string,
  user: Option.Option<UserId>,
  body?: unknown,
) =>
  Effect.promise(() =>
    app.handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...Option.match(user, { onNone: () => ({}), onSome: (id) => ({ "x-user": id }) }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    ),
  )

const createExercise = (app: ReturnType<typeof newApp>, user: UserId, name: string) =>
  call(app, "POST", "/exercises", Option.some(user), {
    name,
    aliases: [],
    muscleGroups: [],
    notes: null,
  })

const exerciseCount = (app: ReturnType<typeof newApp>, user: UserId) =>
  call(app, "GET", "/exercises", Option.some(user)).pipe(
    Effect.flatMap((response) => Effect.promise(() => response.json())),
    Effect.map((rows) => (Array.isArray(rows) ? rows.length : -1)),
  )

describe("POST /api/account/delete", () => {
  it.effect("answers 401 without a session and erases nothing", () =>
    Effect.gen(function* () {
      const app = newApp()
      yield* createExercise(app, owner, "Squat")
      const response = yield* call(app, "POST", "/api/account/delete", Option.none())
      expect(response.status).toBe(401)
      expect(yield* exerciseCount(app, owner)).toBe(1)
    }),
  )

  it.effect("answers 200 { deleted: true } with Cache-Control: no-store", () =>
    Effect.gen(function* () {
      const response = yield* call(newApp(), "POST", "/api/account/delete", Option.some(owner))
      expect(response.status).toBe(200)
      expect(yield* Effect.promise(() => response.json())).toEqual({ deleted: true })
      expect(response.headers.get("cache-control")).toBe("no-store")
    }),
  )

  it.effect("expires every Better Auth cookie in both spellings", () =>
    Effect.gen(function* () {
      const response = yield* call(newApp(), "POST", "/api/account/delete", Option.some(owner))
      const cookies = response.headers.getSetCookie()
      const names = cookies.map((cookie) => cookie.split("=")[0])
      expect(names).toEqual([
        "better-auth.session_token",
        "__Secure-better-auth.session_token",
        "better-auth.session_data",
        "__Secure-better-auth.session_data",
        "better-auth.dont_remember",
        "__Secure-better-auth.dont_remember",
      ])
      expect(cookies.every((cookie) => /Max-Age=0/i.test(cookie) && /Path=\//.test(cookie))).toBe(
        true,
      )
    }),
  )

  it.effect("expires cookies only on the delete response, not on later requests", () =>
    Effect.gen(function* () {
      const app = newApp()
      yield* call(app, "POST", "/api/account/delete", Option.some(owner))
      const after = yield* call(app, "GET", "/exercises", Option.some(other))
      expect(after.headers.getSetCookie()).toEqual([])
    }),
  )

  it.effect("erases the caller's rows and keeps another user's", () =>
    Effect.gen(function* () {
      const app = newApp()
      yield* createExercise(app, owner, "Squat")
      yield* createExercise(app, other, "Bench")
      yield* call(app, "POST", "/api/account/delete", Option.some(owner))
      expect(yield* exerciseCount(app, owner)).toBe(0)
      expect(yield* exerciseCount(app, other)).toBe(1)
    }),
  )
})
