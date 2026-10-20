import { describe, expect, it } from "@effect/vitest"
import { LocalDate, Plan, PlanId, UserId } from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { type App, makeApp, memoryPersistence } from "./app"
import { BetterAuth } from "./auth/BetterAuth"
import { CapturedEmails, EmailSender } from "./auth/EmailSender"
import { Sessions } from "./auth/Sessions"
import { WorkerConfig } from "./Config"
import type { EnvVars } from "./Env"
import { ExerciseRepo, MemoryStore, PersistenceError } from "./repos"

const env: EnvVars = {
  ENVIRONMENT: "local",
  BETTER_AUTH_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "test-secret-0000000000000000000000000000",
  ALLOWED_ORIGINS: "http://localhost:8081",
  EMAIL_MODE: "console",
}
const userA = UserId.make("00000000-0000-4000-8000-0000000000a1")
const userB = UserId.make("00000000-0000-4000-8000-0000000000b1")

const appFor = (user: Option.Option<UserId>): App =>
  makeApp(env, { auth: { _tag: "Fixed", sessions: Sessions.layerFixed(user) } })

const call = (app: App, method: string, path: string, body?: unknown) =>
  app.handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )

/** Test-only: decoding throws on a malformed body, which fails the test. */
const idOf = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))

const benchPress = { name: "Bench press", aliases: ["Bench"], muscleGroups: ["chest"], notes: null }

describe("makeApp", () => {
  it("serves /health without a session", async () => {
    const response = await call(appFor(Option.none()), "GET", "/health")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("answers 401 on protected routes without a session", async () => {
    const response = await call(appFor(Option.none()), "GET", "/exercises")
    expect(response.status).toBe(401)
  })

  it("creates, reads, patches and soft-deletes an exercise", async () => {
    const app = appFor(Option.some(userA))
    const created = await call(app, "POST", "/exercises", benchPress)
    expect(created.status).toBe(200)
    const exercise = await created.json()
    const { id } = idOf(exercise)
    expect(exercise).toMatchObject({ ...benchPress, userId: userA, deletedAt: null })

    const read = await call(app, "GET", `/exercises/${id}`)
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual(exercise)

    const patched = await call(app, "PATCH", `/exercises/${id}`, { name: "Flat bench" })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toMatchObject({ name: "Flat bench", aliases: ["Bench"] })

    const removed = await call(app, "DELETE", `/exercises/${id}`)
    expect(removed.status).toBe(204)
    const gone = await call(app, "GET", `/exercises/${id}`)
    expect(gone.status).toBe(404)
    expect(await gone.json()).toMatchObject({ _tag: "NotFound", entity: "exercise" })
    const list = await call(app, "GET", "/exercises")
    expect(await list.json()).toEqual([])
  })

  it("hides one user's exercise from another", async () => {
    // One app, the user picked per request from a test header.
    const app = makeApp(env, {
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
    const as = (user: UserId, method: string, path: string, body?: unknown) =>
      app.handler(
        new Request(`http://localhost${path}`, {
          method,
          headers: { "content-type": "application/json", "x-user": user },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      )
    const { id } = idOf(await (await as(userA, "POST", "/exercises", benchPress)).json())
    expect((await as(userA, "GET", `/exercises/${id}`)).status).toBe(200)
    expect((await as(userB, "GET", `/exercises/${id}`)).status).toBe(404)
    expect(await (await as(userB, "GET", "/exercises")).json()).toEqual([])
    expect((await as(userB, "DELETE", `/exercises/${id}`)).status).toBe(404)
  })

  it("rejects an invalid body with 400", async () => {
    const app = appFor(Option.some(userA))
    const response = await call(app, "POST", "/exercises", { ...benchPress, name: "" })
    expect(response.status).toBe(400)
  })

  it("answers /plans/current with 404 until a plan exists", async () => {
    const response = await call(appFor(Option.some(userA)), "GET", "/plans/current")
    expect(response.status).toBe(404)
  })

  it("answers /plans/current with the active plan", async () => {
    const now = DateTime.makeUnsafe("2026-10-19T08:00:00.000Z")
    const plan = Plan.make({
      id: PlanId.make("00000000-0000-4000-8000-0000000000c1"),
      userId: userA,
      createdAt: now,
      updatedAt: now,
      deletedAt: Option.none(),
      name: "Block 1",
      goal: "Get stronger",
      startDate: LocalDate.make("2026-10-19"),
      status: "active",
    })
    const seeded = Layer.effect(
      MemoryStore,
      Effect.gen(function* () {
        const store = yield* MemoryStore
        yield* Effect.orDie(store.put("plan", userA, [plan]))
        return store
      }).pipe(Effect.provide(MemoryStore.layer)),
    )
    const app = makeApp(env, {
      auth: { _tag: "Fixed", sessions: Sessions.layerFixed(Option.some(userA)) },
      persistence: memoryPersistence(seeded),
    })
    const response = await call(app, "GET", "/plans/current")
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      plan: { id: plan.id, status: "active" },
      weeks: [],
      sessions: [],
      sets: [],
    })
  })

  it("answers a CORS preflight from an allowed origin with credentials", async () => {
    const response = await appFor(Option.none()).handler(
      new Request("http://localhost/exercises", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:8081",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    )
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8081")
  })
  it("answers 500 when a repository fails", async () => {
    const failing = Layer.succeed(
      ExerciseRepo,
      ExerciseRepo.of({
        get: () => Effect.fail(new PersistenceError({ operation: "exercise.get", cause: "boom" })),
        list: () =>
          Effect.fail(new PersistenceError({ operation: "exercise.list", cause: "boom" })),
        put: () => Effect.fail(new PersistenceError({ operation: "exercise.put", cause: "boom" })),
      }),
    )
    const app = makeApp(env, {
      auth: { _tag: "Fixed", sessions: Sessions.layerFixed(Option.some(userA)) },
      persistence: Layer.merge(memoryPersistence(MemoryStore.layer), failing),
    })
    expect((await call(app, "GET", "/exercises")).status).toBe(500)
  })

  it("signs in through Better Auth and uses the cookie on GET /exercises", async () => {
    const context = await Effect.runPromise(
      Effect.scoped(
        Layer.build(
          BetterAuth.layerMemory.pipe(
            Layer.provideMerge(EmailSender.layerCapture),
            Layer.provideMerge(WorkerConfig.layerFromEnv(env)),
          ),
        ),
      ),
    )
    const app = makeApp(env, {
      auth: {
        _tag: "BetterAuth",
        betterAuth: Layer.succeed(BetterAuth, Context.get(context, BetterAuth)),
      },
    })
    const requested = await app.handler(
      new Request("http://localhost:8787/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:8081" },
        body: JSON.stringify({ email: "lukas@example.com", callbackURL: "/" }),
      }),
    )
    expect(requested.status).toBe(200)
    const sent = await Effect.runPromise(Context.get(context, CapturedEmails).sent)
    const link = Option.getOrElse(Arr.head(sent), () => ({
      email: "",
      url: "http://localhost/missing",
    }))
    const verified = await app.handler(new Request(link.url, { redirect: "manual" }))
    const cookie = verified.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .join("; ")
    expect((await call(app, "GET", "/exercises")).status).toBe(401)
    const listed = await app.handler(
      new Request("http://localhost:8787/exercises", { headers: { cookie } }),
    )
    expect(listed.status).toBe(200)
  })
  it("answers a /sync/push preflight from the app origin with credentials", async () => {
    const response = await appFor(Option.none()).handler(
      new Request("http://localhost/sync/push", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:8081",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    )
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8081")
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
  })

  it("serves POST /sync/pull to the app origin with CORS headers", async () => {
    const response = await appFor(Option.some(userA)).handler(
      new Request("http://localhost/sync/pull", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:8081" },
        body: JSON.stringify({ since: null, limit: 100 }),
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8081")
    expect(await response.json()).toMatchObject({ changes: [], hasMore: false })
  })
})
