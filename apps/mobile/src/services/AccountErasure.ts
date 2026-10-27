import { AccountDeleted } from "@tanren/shared"
import { Array as Arr, Context, Data, Effect, Layer } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http"
import { apiBaseUrl } from "./apiBaseUrl"
import { NativeSession, withSession } from "./NativeSession"
import { SqlDriver, type SqlStatement } from "./SqlDriver"

/**
 * Internal: "Delete account" failed. `offline` = no network or a timeout; `server` = the worker
 * answered non-2xx (a 401: not signed in) or an unreadable body; `local` = the account is gone on
 * the server but this device's copy could not be wiped (a retry wipes it: the server answers 401
 * only after the session is gone, so the UI tells the user to clear site data instead).
 */
export class AccountEraseFailed extends Data.TaggedError("AccountEraseFailed")<{
  readonly reason: "offline" | "server" | "local"
}> {}

export interface AccountErasureShape {
  /**
   * `POST /api/account/delete` (Bearer on native, cookie on web), then every local table emptied
   * in one transaction (incl. `sync_state`: owner, cursors), then `NativeSession.clear`. Nothing
   * local changes when the server call fails.
   */
  readonly erase: Effect.Effect<void, AccountEraseFailed>
}

/**
 * Every local table, read at runtime so a table a later migration adds is wiped too. The schema
 * version lives in `PRAGMA user_version`, so there is no bookkeeping table to keep.
 */
export const listLocalTables: SqlStatement = {
  sql: `SELECT "name" FROM sqlite_master WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite\\_%' ESCAPE '\\'`,
  params: [],
}

/** `DELETE FROM "<table>"` per name (identifier quotes doubled). */
export const wipeStatements = (tables: ReadonlyArray<string>): ReadonlyArray<SqlStatement> =>
  Arr.map(tables, (name) => ({ sql: `DELETE FROM "${name.replaceAll('"', '""')}"`, params: [] }))

const REQUEST_TIMEOUT = "10 seconds"

const failed = (reason: AccountEraseFailed["reason"]) => new AccountEraseFailed({ reason })

const failureOfHttp = (cause: HttpClientError.HttpClientError): AccountEraseFailed =>
  failed(cause.reason._tag === "TransportError" ? "offline" : "server")

const make = (baseUrl: Effect.Effect<string>) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const native = yield* NativeSession
    const driver = yield* SqlDriver

    /** Same request options as `Account`: session cookie, no trace headers. */
    const deleteOnServer = Effect.gen(function* () {
      const base = yield* baseUrl
      const request = HttpClientRequest.post(`${base}/api/account/delete`).pipe(
        HttpClientRequest.acceptJson,
      )
      const response = yield* withSession(request).pipe(
        Effect.provideService(NativeSession, native),
        Effect.flatMap((authorised) => client.execute(authorised)),
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        Effect.mapError(failureOfHttp),
      )
      yield* HttpClientResponse.schemaBodyJson(AccountDeleted)(response).pipe(
        Effect.mapError(() => failed("server")),
      )
    }).pipe(
      Effect.timeoutOrElse({
        duration: REQUEST_TIMEOUT,
        orElse: () => Effect.fail(failed("offline")),
      }),
    )

    const wipeLocal = Effect.gen(function* () {
      const rows = yield* driver.all(listLocalTables)
      const names = Arr.flatMap(rows, (row) => (typeof row.name === "string" ? [row.name] : []))
      yield* driver.batch(wipeStatements(names))
    }).pipe(Effect.mapError(() => failed("local")))

    const erase = Effect.gen(function* () {
      yield* deleteOnServer
      yield* wipeLocal
      yield* native.clear
    })

    return { erase } satisfies AccountErasureShape
  })

/** Settings → Data → Delete account (ADR-0024, legal.md §1.7). Provided per call, not in `runtime`. */
export class AccountErasure extends Context.Service<AccountErasure, AccountErasureShape>()(
  "@tanren/AccountErasure",
) {
  /** Any base URL (the test seam). Needs HttpClient, NativeSession and SqlDriver. */
  static readonly layerWith = (baseUrl: Effect.Effect<string>) => Layer.effect(this, make(baseUrl))

  /** App: the worker at `apiBaseUrl`. Needs SqlDriver (the runtime's base layer). */
  static readonly layer = this.layerWith(apiBaseUrl).pipe(
    Layer.provide(Layer.mergeAll(FetchHttpClient.layer, NativeSession.layer)),
  )
}
