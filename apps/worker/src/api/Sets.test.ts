import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { type App, makeApp } from "../app"
import { Sessions } from "../auth/Sessions"
import { envVars as env } from "../testing/fixtures"

const owner = "00000000-0000-4000-8000-0000000000a1"
const stranger = "00000000-0000-4000-8000-0000000000b1"
const exerciseId = "00000000-0000-4000-8000-0000000000e1"

/** One app on one memory store; the user comes from the `x-user` header (none → signed out). */
const newApp = (): App =>
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
  app: App,
  user: Option.Option<string>,
  method: string,
  path: string,
  body?: unknown,
) =>
  app.handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...Option.match(user, { onNone: () => ({}), onSome: (id) => ({ "x-user": id }) }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )

/** Test-only: decoding throws on a malformed body, which fails the test. */
const idOf = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))

const setBody = (sessionId: string) => ({
  sessionId,
  exerciseId,
  order: 0,
  weightKg: 100,
  reps: 5,
  rpe: 8,
  note: null,
  plannedSetId: null,
  loggedAt: "2026-10-20T08:05:00.000Z",
})

/** A fresh app with one live session owned by `owner` and one set in it. */
const seeded = async () => {
  const app = newApp()
  const as = Option.some(owner)
  const session = await call(app, as, "POST", "/sessions", {
    startedAt: "2026-10-20T08:00:00.000Z",
    finishedAt: null,
    plannedSessionId: null,
    notes: null,
  })
  expect(session.status).toBe(200)
  const sessionId = idOf(await session.json()).id
  const created = await call(app, as, "POST", `/sessions/${sessionId}/sets`, setBody(sessionId))
  expect(created.status).toBe(200)
  const set: unknown = await created.json()
  return { app, sessionId, set, setId: idOf(set).id }
}

describe("sets under /sessions/:id/sets", () => {
  it("creates a set in the caller's session", async () => {
    const { set, sessionId } = await seeded()
    expect(set).toMatchObject({ ...setBody(sessionId), userId: owner, deletedAt: null })
  })

  it("lists the session's live sets", async () => {
    const { app, sessionId, set } = await seeded()
    const listed = await call(app, Option.some(owner), "GET", `/sessions/${sessionId}/sets`)
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([set])
  })

  it("patches a set and keeps the untouched fields", async () => {
    const { app, sessionId, setId } = await seeded()
    const path = `/sessions/${sessionId}/sets/${setId}`
    const patched = await call(app, Option.some(owner), "PATCH", path, { reps: 6 })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toMatchObject({ id: setId, reps: 6, weightKg: 100 })
  })

  it("soft-deletes a set so it leaves the list", async () => {
    const { app, sessionId, setId } = await seeded()
    const as = Option.some(owner)
    const removed = await call(app, as, "DELETE", `/sessions/${sessionId}/sets/${setId}`)
    expect(removed.status).toBe(204)
    const listed = await call(app, as, "GET", `/sessions/${sessionId}/sets`)
    expect(await listed.json()).toEqual([])
  })

  it("answers 401 on every set route without a session", async () => {
    const { app, sessionId, setId } = await seeded()
    const anon = Option.none()
    const one = `/sessions/${sessionId}/sets/${setId}`
    const statuses = await Promise.all([
      call(app, anon, "GET", `/sessions/${sessionId}/sets`),
      call(app, anon, "POST", `/sessions/${sessionId}/sets`, setBody(sessionId)),
      call(app, anon, "PATCH", one, { reps: 6 }),
      call(app, anon, "DELETE", one),
    ]).then((responses) => responses.map((response) => response.status))
    expect(statuses).toEqual([401, 401, 401, 401])
  })

  it("answers 404 NotFound(session) on every set route for another user's session", async () => {
    const { app, sessionId, setId } = await seeded()
    const other = Option.some(stranger)
    const one = `/sessions/${sessionId}/sets/${setId}`
    const responses = await Promise.all([
      call(app, other, "GET", `/sessions/${sessionId}/sets`),
      call(app, other, "POST", `/sessions/${sessionId}/sets`, setBody(sessionId)),
      call(app, other, "PATCH", one, { reps: 6 }),
      call(app, other, "DELETE", one),
    ])
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404])
    const bodies = await Promise.all(responses.map((response) => response.json()))
    expect(bodies).toEqual(
      Array.from({ length: 4 }, () => ({ _tag: "NotFound", entity: "session", id: sessionId })),
    )
    // The owner's set is untouched.
    const listed = await call(app, Option.some(owner), "GET", `/sessions/${sessionId}/sets`)
    expect(await listed.json()).toMatchObject([{ id: setId, reps: 5, deletedAt: null }])
  })
})
