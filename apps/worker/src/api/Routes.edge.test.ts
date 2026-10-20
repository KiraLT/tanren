import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { type App, makeApp } from "../app"
import { Sessions } from "../auth/Sessions"
import { envVars as env } from "../testing/fixtures"

const owner = "00000000-0000-4000-8000-0000000000a2"
const stranger = "00000000-0000-4000-8000-0000000000b2"
const exerciseId = "00000000-0000-4000-8000-0000000000e2"
const missing = "00000000-0000-4000-8000-0000000000ff"
const t = "2026-10-20T08:00:00.000Z"

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

const call = (app: App, user: string | undefined, method: string, path: string, body?: string) =>
  app.handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(user === undefined ? {} : { "x-user": user }),
      },
      ...(body === undefined || method === "GET" ? {} : { body }),
    }),
  )
const json = (value: unknown) => JSON.stringify(value)
const idOf = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))
const tagOf = Schema.decodeUnknownSync(Schema.Struct({ _tag: Schema.String }))

const row = (id: string, user: string, extra: Record<string, unknown>) => ({
  id,
  userId: user,
  createdAt: t,
  updatedAt: t,
  deletedAt: null,
  ...extra,
})
const exerciseChange = (id: string, user: string, name: string, updatedAt = t) => ({
  table: "exercise",
  row: row(id, user, { name, aliases: [], muscleGroups: [], notes: null, updatedAt }),
})
const sessionChange = (id: string, user: string) => ({
  table: "session",
  row: row(id, user, { startedAt: t, finishedAt: null, plannedSessionId: null, notes: null }),
})
const sid = (n: number) => `60000000-0000-4000-8000-${n.toString().padStart(12, "0")}`

describe("every route requires a session", () => {
  const routes: ReadonlyArray<readonly [string, string]> = [
    ["GET", "/profile"],
    ["PUT", "/profile"],
    ["GET", "/exercises"],
    ["POST", "/exercises"],
    ["GET", `/exercises/${exerciseId}`],
    ["PATCH", `/exercises/${exerciseId}`],
    ["DELETE", `/exercises/${exerciseId}`],
    ["GET", `/sessions?from=${t}&to=${t}`],
    ["GET", "/sessions"],
    ["POST", "/sessions"],
    ["GET", `/sessions/${missing}`],
    ["PATCH", `/sessions/${missing}`],
    ["DELETE", `/sessions/${missing}`],
    ["GET", `/sessions/${missing}/sets`],
    ["POST", `/sessions/${missing}/sets`],
    ["PATCH", `/sessions/${missing}/sets/${missing}`],
    ["DELETE", `/sessions/${missing}/sets/${missing}`],
    ["GET", "/plans"],
    ["GET", "/plans/current"],
    ["POST", "/sync/push"],
    ["POST", "/sync/pull"],
  ]
  it("answers 401 signed out, even with an empty or garbage body", async () => {
    const app = newApp()
    const statuses = await Promise.all(
      routes.flatMap(([method, path]) =>
        [undefined, "{not json", "{}"].map((body) =>
          call(app, undefined, method, path, body).then(
            (r) => `${method} ${path} ${body} ${r.status}`,
          ),
        ),
      ),
    )
    expect(statuses.filter((s) => !s.endsWith(" 401"))).toEqual([])
  })

  it("serves /health without a session", async () => {
    expect((await call(newApp(), undefined, "GET", "/health")).status).toBe(200)
  })
})

describe("/sync/pull input edges", () => {
  const pull = (since: unknown, limit: unknown) =>
    call(newApp(), owner, "POST", "/sync/pull", json({ since, limit }))

  it("answers 400 ValidationError for a cursor this server never issued", async () => {
    const response = await pull("garbage", 10)
    expect(response.status).toBe(400)
    expect(tagOf(await response.json())._tag).toBe("ValidationError")
  })

  it("answers 400 for a blank, padded or overlong cursor and for limits 0, 501, -1, 1.5", async () => {
    const statuses = await Promise.all([
      pull("", 10),
      pull(" 1:0:-", 10),
      pull("x".repeat(513), 10),
      pull(null, 0),
      pull(null, 501),
      pull(null, -1),
      pull(null, 1.5),
      pull(null, "10"),
      pull(undefined, 10),
    ]).then((rs) => rs.map((r) => r.status))
    expect(statuses).toEqual([400, 400, 400, 400, 400, 400, 400, 400, 400])
  })

  it("answers 4xx (not 500) for non-JSON and empty bodies", async () => {
    const app = newApp()
    const bad = await Promise.all([
      call(app, owner, "POST", "/sync/pull", "{nope"),
      call(app, owner, "POST", "/sync/pull"),
      call(app, owner, "POST", "/sync/push", "[]"),
    ])
    expect(bad.map((r) => r.status)).toEqual([400, 400, 400])
  })

  it("accepts limit 1 and 500 with a null cursor on an empty store", async () => {
    expect((await pull(null, 1)).status).toBe(200)
    expect((await pull(null, 500)).status).toBe(200)
  })
})

// LWW ties, the clamp and parent checks are `@tanren/db`'s SyncStore (see SyncStore.edge.test.ts);
// the Node `SyncStoreMemory` fake has no LWW and no parent checks, so they cannot be proven here.
describe("/sync/push over HTTP", () => {
  const push = (app: App, user: string, changes: ReadonlyArray<unknown>) =>
    call(app, user, "POST", "/sync/push", json({ changes }))

  it("rejects an 81-character Label with 400 and accepts 80", async () => {
    const app = newApp()
    expect((await push(app, owner, [exerciseChange(sid(1), owner, "x".repeat(81))])).status).toBe(
      400,
    )
    const ok = await push(app, owner, [exerciseChange(sid(1), owner, "x".repeat(80))])
    expect(ok.status).toBe(200)
  })

  it("pages one push's rows with limit 1 without skipping or repeating", async () => {
    const app = newApp()
    await push(app, owner, [
      exerciseChange(sid(7), owner, "A"),
      exerciseChange(sid(8), owner, "B"),
      exerciseChange(sid(9), owner, "C"),
      sessionChange(sid(10), owner),
    ])
    const Page = Schema.Struct({
      changes: Schema.Array(Schema.Struct({ row: Schema.Struct({ id: Schema.String }) })),
      cursor: Schema.String,
      hasMore: Schema.Boolean,
    })
    const drain = async (
      since: string | null,
      seen: ReadonlyArray<string>,
      depth: number,
    ): Promise<ReadonlyArray<string>> => {
      const response = await call(app, owner, "POST", "/sync/pull", json({ since, limit: 1 }))
      expect(response.status).toBe(200)
      const page = Schema.decodeUnknownSync(Page)(await response.json())
      const all = [...seen, ...page.changes.map((c) => c.row.id)]
      return page.hasMore && depth < 10 ? drain(page.cursor, all, depth + 1) : all
    }
    const seen = await drain(null, [], 0)
    expect(seen).toHaveLength(4)
    expect(new Set(seen).size).toBe(4)
  })
})

describe("nested set routes with foreign or bogus ids", () => {
  const seed = async () => {
    const app = newApp()
    const mine = idOf(
      await (
        await call(
          app,
          owner,
          "POST",
          "/sessions",
          json({ startedAt: t, finishedAt: null, plannedSessionId: null, notes: null }),
        )
      ).json(),
    ).id
    const theirs = idOf(
      await (
        await call(
          app,
          stranger,
          "POST",
          "/sessions",
          json({ startedAt: t, finishedAt: null, plannedSessionId: null, notes: null }),
        )
      ).json(),
    ).id
    const body = (sessionId: string) =>
      json({
        sessionId,
        exerciseId,
        order: 0,
        weightKg: 100,
        reps: 5,
        rpe: null,
        note: null,
        plannedSetId: null,
        loggedAt: t,
      })
    const setId = idOf(
      await (await call(app, stranger, "POST", `/sessions/${theirs}/sets`, body(theirs))).json(),
    ).id
    return { app, mine, theirs, setId, body }
  }

  it("404s the stranger's set addressed through the caller's own session", async () => {
    const { app, mine, setId } = await seed()
    const patched = await call(
      app,
      owner,
      "PATCH",
      `/sessions/${mine}/sets/${setId}`,
      json({ reps: 1 }),
    )
    const removed = await call(app, owner, "DELETE", `/sessions/${mine}/sets/${setId}`)
    expect([patched.status, removed.status]).toEqual([404, 404])
  })

  it("404s a body sessionId that is the stranger's while the path is the caller's (400 mismatch)", async () => {
    const { app, mine, theirs, body } = await seed()
    const response = await call(app, owner, "POST", `/sessions/${mine}/sets`, body(theirs))
    expect(response.status).toBe(400)
  })

  it("400s non-UUID ids in the path rather than 500", async () => {
    const { app } = await seed()
    const statuses = await Promise.all([
      call(app, owner, "GET", "/sessions/not-a-uuid/sets"),
      call(app, owner, "PATCH", `/sessions/${missing}/sets/zzz`, json({ reps: 1 })),
      call(app, owner, "GET", "/exercises/%00"),
    ]).then((rs) => rs.map((r) => r.status))
    expect(statuses).toEqual([400, 400, 400])
  })

  it("rejects an empty PATCH body or out-of-range reps with 400, not 500", async () => {
    const { app, mine } = await seed()
    const created = idOf(
      await (
        await call(
          app,
          owner,
          "POST",
          `/sessions/${mine}/sets`,
          json({
            sessionId: mine,
            exerciseId,
            order: 0,
            weightKg: 100,
            reps: 5,
            rpe: null,
            note: null,
            plannedSetId: null,
            loggedAt: t,
          }),
        )
      ).json(),
    ).id
    const statuses = await Promise.all([
      call(app, owner, "PATCH", `/sessions/${mine}/sets/${created}`, json({ reps: 1001 })),
      call(app, owner, "PATCH", `/sessions/${mine}/sets/${created}`, json({ weightKg: -1 })),
      call(app, owner, "PATCH", `/sessions/${mine}/sets/${created}`, json({ rpe: 11 })),
    ]).then((rs) => rs.map((r) => r.status))
    expect(statuses).toEqual([400, 400, 400])
  })

  it("writes an exercise with an 80-character name and 400s 81", async () => {
    const app = newApp()
    const create = (name: string) =>
      call(
        app,
        owner,
        "POST",
        "/exercises",
        json({ name, aliases: [], muscleGroups: [], notes: null }),
      )
    expect([(await create("é".repeat(80))).status, (await create("é".repeat(81))).status]).toEqual([
      200, 400,
    ])
  })
})
