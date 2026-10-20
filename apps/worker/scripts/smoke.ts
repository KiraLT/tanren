/**
 * Smoke test against a running local `wrangler dev` on a freshly seeded D1 (`pnpm db:reset`).
 * Not part of `pnpm check`. Usage (from the repo root):
 *   pnpm smoke:worker --port 8798 --log <file with the wrangler dev output>
 * The magic link is read from the log (`EMAIL_MODE=console` prints it). Fails non-zero on any
 * mismatch. Entry point: this is where the Effect program is run.
 */
import { readFile } from "node:fs/promises"
import {
  Exercise,
  PullResponse,
  type PushRequestEncoded,
  PushResponse,
  type SyncCursor,
} from "@tanren/shared"
import { Array as Arr, Console, Data, DateTime, Effect, Option, Schedule, Schema } from "effect"

const SEED_USER_ID = "00000000-0000-4000-8000-000000000001"
const SEED_EMAIL = "dev@tanren.local"
const SEED_EXERCISES = 14

class SmokeFailure extends Data.TaggedError("SmokeFailure")<{
  readonly step: string
  readonly message: string
}> {}

const flag = (name: string): Option.Option<string> =>
  Option.some(process.argv.indexOf(`--${name}`)).pipe(
    Option.filter((index) => index >= 0),
    Option.flatMap((index) => Option.fromNullishOr(process.argv[index + 1])),
  )

const port = Option.getOrElse(flag("port"), () => "8787")
const origin = Option.getOrElse(flag("origin"), () => "http://localhost:8081")
const base = `http://localhost:${port}`

interface Reply {
  readonly status: number
  readonly headers: Headers
  readonly body: string
}

const call = (step: string, path: string, init: RequestInit = {}) =>
  Effect.tryPromise({
    try: async (): Promise<Reply> => {
      const response = await fetch(path.startsWith("http") ? path : `${base}${path}`, {
        redirect: "manual",
        ...init,
      })
      return { status: response.status, headers: response.headers, body: await response.text() }
    },
    catch: (cause) => new SmokeFailure({ step, message: String(cause) }),
  })

const fail = (step: string, message: string) => Effect.fail(new SmokeFailure({ step, message }))

const expectStatus = (step: string, reply: Reply, status: number) =>
  reply.status === status
    ? Console.log(`ok    ${step} → ${reply.status}`)
    : fail(step, `expected ${status}, got ${reply.status}: ${reply.body.slice(0, 300)}`)

const decode = <A, I>(step: string, schema: Schema.Codec<A, I>, body: string) =>
  Effect.try({
    try: (): unknown => JSON.parse(body),
    catch: (cause) => new SmokeFailure({ step, message: `not JSON: ${String(cause)}` }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((error) =>
      error instanceof SmokeFailure ? error : new SmokeFailure({ step, message: error.message }),
    ),
  )

const json = (cookie: string, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", origin, cookie },
  body: JSON.stringify(body),
})

const LINK = /magic link for dev@tanren\.local: (\S+)/g

/** The newest magic link printed after `offset`, retried while wrangler flushes its log. */
const magicLink = (log: string, offset: number) =>
  Effect.tryPromise({
    try: () => readFile(log, "utf8"),
    catch: (cause) => new SmokeFailure({ step: "read log", message: String(cause) }),
  }).pipe(
    Effect.flatMap((text) =>
      Option.match(Arr.last(Arr.fromIterable(text.slice(offset).matchAll(LINK))), {
        onNone: () => fail("read log", `no magic link for ${SEED_EMAIL} in ${log}`),
        onSome: (match) => Effect.succeed(match[1] ?? ""),
      }),
    ),
    Effect.retry({ times: 20, schedule: Schedule.spaced("250 millis") }),
  )

const logSize = (log: string) =>
  Effect.tryPromise({
    try: () => readFile(log, "utf8"),
    catch: (cause) => new SmokeFailure({ step: "read log", message: String(cause) }),
  }).pipe(Effect.map((text) => text.length))

const pull = (cookie: string, since: Option.Option<SyncCursor>) =>
  Effect.gen(function* () {
    const step = `POST /sync/pull since ${Option.getOrElse(since, () => "null")}`
    const reply = yield* call(
      step,
      "/sync/pull",
      json(cookie, { since: Option.getOrNull(since), limit: 500 }),
    )
    yield* expectStatus(step, reply, 200)
    return yield* decode(step, PullResponse, reply.body)
  })

interface Drained {
  readonly cursor: SyncCursor
  readonly total: number
  readonly serverTime: DateTime.Utc
}

/** Pulls every page from the start; returns the final cursor and the number of changes. */
const drain = (
  cookie: string,
  since: Option.Option<SyncCursor>,
  total: number,
): Effect.Effect<Drained, SmokeFailure> =>
  pull(cookie, since).pipe(
    Effect.flatMap((page) =>
      page.hasMore
        ? drain(cookie, Option.some(page.cursor), total + page.changes.length)
        : Effect.succeed({
            cursor: page.cursor,
            total: total + page.changes.length,
            serverTime: page.serverTime,
          }),
    ),
  )

const program = Effect.gen(function* () {
  const log = yield* Option.match(flag("log"), {
    onNone: () => fail("args", "--log <wrangler dev output file> is required"),
    onSome: Effect.succeed,
  })
  yield* Console.log(`smoke against ${base} (origin ${origin})`)

  yield* expectStatus("GET /health", yield* call("GET /health", "/health"), 200)
  yield* expectStatus(
    "GET /exercises (no cookie)",
    yield* call("GET /exercises", "/exercises"),
    401,
  )

  const offset = yield* logSize(log)
  const signIn = "POST /api/auth/sign-in/magic-link"
  yield* expectStatus(
    signIn,
    yield* call(
      signIn,
      "/api/auth/sign-in/magic-link",
      json("", { email: SEED_EMAIL, callbackURL: "/" }),
    ),
    200,
  )
  // BETTER_AUTH_URL points at :8787; follow the same path on the port under test.
  const printed = new URL(yield* magicLink(log, offset))
  const verify = yield* call("GET magic-link/verify", `${base}${printed.pathname}${printed.search}`)
  yield* expectStatus("GET magic-link/verify", verify, 302)
  const cookie = Arr.map(
    verify.headers.getSetCookie(),
    (header) => header.split(";")[0] ?? "",
  ).join("; ")
  if (!cookie.includes("better-auth.session_token=")) {
    return yield* fail("GET magic-link/verify", "no better-auth.session_token cookie")
  }

  const listStep = "GET /exercises (cookie)"
  const listed = yield* call(listStep, "/exercises", { headers: { cookie } })
  yield* expectStatus(listStep, listed, 200)
  const exercises = yield* decode(listStep, Schema.Array(Exercise), listed.body)
  if (exercises.length !== SEED_EXERCISES) {
    return yield* fail(listStep, `expected ${SEED_EXERCISES} exercises, got ${exercises.length}`)
  }
  if (!Arr.every(exercises, (exercise) => exercise.userId === SEED_USER_ID)) {
    return yield* fail(listStep, `rows are not owned by the seed user ${SEED_USER_ID}`)
  }
  yield* Console.log(`ok    ${exercises.length} exercises owned by ${SEED_USER_ID}`)

  const first = yield* pull(cookie, Option.none())
  if (first.changes.length === 0) {
    return yield* fail("POST /sync/pull", "the first page is empty")
  }
  yield* Console.log(`ok    first page: ${first.changes.length} changes, cursor ${first.cursor}`)
  const drained = yield* drain(cookie, Option.none(), 0)
  yield* Console.log(`ok    drained ${drained.total} changes, cursor ${drained.cursor}`)

  const target = yield* Option.match(Arr.head(exercises), {
    onNone: () => fail("POST /sync/push", "no exercise to edit"),
    onSome: Effect.succeed,
  })
  const wire = yield* Schema.encodeEffect(Exercise)(target).pipe(
    Effect.mapError((error) => new SmokeFailure({ step: "encode", message: error.message })),
  )
  const updatedAt = DateTime.formatIso(drained.serverTime)
  const note = `smoke ${updatedAt}`
  const request: PushRequestEncoded = {
    changes: [{ table: "exercise", row: { ...wire, notes: note, updatedAt } }],
  }
  const pushStep = "POST /sync/push"
  const pushed = yield* call(pushStep, "/sync/push", json(cookie, request))
  yield* expectStatus(pushStep, pushed, 200)
  const response = yield* decode(pushStep, PushResponse, pushed.body)
  if (response.accepted.length !== 1 || response.rejected.length + response.conflicts.length > 0) {
    return yield* fail(pushStep, `expected 1 accepted, got ${pushed.body.slice(0, 300)}`)
  }
  yield* Console.log(`ok    push accepted exercise ${target.id}`)

  const after = yield* pull(cookie, Option.some(drained.cursor))
  const echoed = Arr.findFirst(
    after.changes,
    (change) =>
      change.table === "exercise" &&
      change.row.id === target.id &&
      Option.getOrNull(change.row.notes) === note,
  )
  if (Option.isNone(echoed)) {
    return yield* fail("POST /sync/pull after push", "the pushed row is not in the next page")
  }
  yield* Console.log(
    `ok    pull after push returns the edited row (${after.changes.length} change)`,
  )
  yield* Console.log("smoke passed")
})

await Effect.runPromise(
  program.pipe(
    Effect.catchTag("SmokeFailure", (error) =>
      Console.error(`FAIL  ${error.step}: ${error.message}`).pipe(
        Effect.andThen(Effect.sync(() => process.exit(1))),
      ),
    ),
  ),
)
