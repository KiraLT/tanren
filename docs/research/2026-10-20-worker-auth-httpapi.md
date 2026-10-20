# W-R1: Better Auth + effect/http-api + wrangler for the step-3 Worker (checked 2026-10-20)

Tags: [pkg] = tarball .d.ts/.mjs of the published package (npm pack, 2026-10-20); [E] = installed effect@4.0.5 source
(node_modules/.pnpm/effect@4.0.5/node_modules/effect/src/...); [doc] = official doc URL fetched 2026-10-20.
Snippets are `unverified` (not compiled).

## Q1 Better Auth
| item | value | source |
|---|---|---|
| latest | `better-auth` 1.7.12 (repo has 1.7.11 installed; bump or keep) | `npm view better-auth version` |
| nodejs_compat | not strictly required: core uses `process.getBuiltinModule("node:async_hooks")` and falls back to dynamic import (inferred: works either way). Repo already sets `nodejs_compat`; keep. | [pkg] @better-auth/core/dist/async_hooks/index.mjs |
| D1 | NATIVE: pass `database: env.DB`. Kysely adapter detects `"batch" in db && "exec" in db && "prepare" in db` and builds a `D1SqliteDialect` (transactions off). No Kysely dialect needed. | [pkg] @better-auth/kysely-adapter@1.7.12 dist/index.mjs:103-108. (docs sqlite/other-relational pages say nothing on D1: [doc]) |
| memory adapter | `import { memoryAdapter } from "better-auth/adapters/memory"`; `memoryAdapter(db: {[table:string]: any[]}, { debugLogs? })` returns `(options)=>DBAdapter`. Use `database: memoryAdapter({ user: [], session: [], account: [], verification: [] })`. Separate pkg `@better-auth/memory-adapter` also exists. | [pkg] better-auth package.json exports `./adapters/memory`; memory-adapter index.d.mts |
| magicLink import | server `import { magicLink } from "better-auth/plugins"`; client `better-auth/client/plugins` `magicLinkClient` | [doc] /docs/plugins/magic-link |
| sendMagicLink | `sendMagicLink: async ({ email, token, url, metadata }, ctx) => {}` (2nd arg is endpoint ctx; `ctx.request` for Request; not verified in .d.ts) | [doc] magic-link |
| endpoints | `POST /sign-in/magic-link`; verify `GET /magic-link/verify` (full: `{basePath}/magic-link/verify?token=..&callbackURL=..`) | [doc] magic-link |
| expiresIn | default 300 s. Also `storeToken: "plain"(default)|"hashed"`, `rateLimit {window:60,max:5}`, `disableSignUp:false` | [doc] magic-link |
| schema SQL | `npx auth@latest generate --adapter kysely --config <path> --output <file> -y` writes `schema.sql` (introspects the configured DB). D1 not mentioned in docs: unknown if it works with a D1 binding in a CLI context (no binding outside workerd). Tables: user, session, account, verification (core tables; inferred from core schema). Safest: hand-write the 4 tables in packages/db Drizzle and test with memory adapter + miniflare D1. | [doc] /docs/concepts/cli |
| UUID user.id | `advanced: { database: { generateId: "uuid" } }`; type is `GenerateIdFn | false | "serial" | "uuid"`. NB it applies to ALL tables (session/account/verification ids too). Needs the `database` block under `advanced` (inferred from nesting at init-options.d.mts:351-374; confirm by tsc). | [pkg] @better-auth/core/dist/types/init-options.d.mts:360-374 |
| getSession | `auth.api.getSession({ headers })` -> `Promise<{ session: Session; user: User } | null>` | [pkg] ba dist/api/routes/session.d.mts:37-39 |
| basePath | option exists (`basePath?: string`); default `/api/auth` (doc knowledge; the .d.ts line has no default text) -> `inferred` | [pkg] init-options.d.mts:492 |
| trustedOrigins | `string[] | (request?: Request) => Awaitable<(string|undefined|null)[]>`; wildcard patterns supported | [pkg] init-options.d.mts:1257 |
| baseURL / secret | `baseURL?: BaseURLConfig` (string or dynamic config), `secret` | [pkg] init-options.d.mts:484 |
| instance lifetime | no official guidance found. Recommend: build per request (cheap, env-safe) via `makeAuth(env)`, or memoise per isolate keyed on nothing since env is static; both fine. `unknown` which is faster. | inferred |

```ts
// unverified
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
export const makeAuth = (env: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL: string; ALLOWED_ORIGINS: string }) =>
  betterAuth({
    database: env.DB, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: env.ALLOWED_ORIGINS.split(","),
    advanced: { database: { generateId: "uuid" } },
    plugins: [magicLink({ expiresIn: 300, sendMagicLink: async ({ email, url }) => { /* console / email */ } })],
  });
```

## Q2 effect 4.0.5 http-api / http
| item | value | source |
|---|---|---|
| middleware def | `class CurrentUser extends Context.Service<CurrentUser, User>()("id") {}`; `class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser; requires: never }>()("id", { error: HttpApiError.Unauthorized }) {}` (`security` option optional; `requiredForClient` optional). Attach with `.middleware(Auth)` on group/api (`Users.ts:94`). | [E] ai-docs/src/51_http-server/fixtures/api/Authorization.ts; HttpApiMiddleware.ts:340 |
| impl (no security scheme) | type `(httpEffect, {endpoint, group}) => Effect<HttpServerResponse, unhandled | E, Requires | HttpRouter.Provided>`; build `Layer.effect(Auth, Effect.gen(function*(){ return Auth.of((httpEffect) => Effect.gen(function*(){ const req = yield* HttpServerRequest.HttpServerRequest; ... return yield* Effect.provideService(httpEffect, CurrentUser, user) })) }))`. With `security: { bearer: HttpApiSecurity.bearer }` impl is `Auth.of({ bearer: (httpEffect, { credential }) => ...})` instead. | [E] HttpApiMiddleware.ts:67-80 (type), fixtures/server/Authorization.ts |
| Unauthorized | `HttpApiError.Unauthorized` is a built-in class (tag "Unauthorized", 401); construct `new HttpApiError.Unauthorized()` (inferred; no-arg fields). A custom `Schema.TaggedError(...)({..},{ httpApiStatus: 401 })` also works (fixture). | [E] HttpApiError.ts:77; fixture |
| mount raw handler | `HttpRouter.add("*", "/api/auth/*", (req) => Effect.gen(function*(){ const web = yield* HttpServerRequest.toWeb(req); const res = yield* Effect.promise(() => auth.handler(web)); return HttpServerResponse.fromWeb(res) }))`. Returns a Layer; `Layer.mergeAll` it with `HttpApiBuilder.layer(Api)`. `toWeb(self,{signal?}): Effect<Request, RequestError>`; `fromWeb(Response): HttpServerResponse` (keeps Set-Cookie). Alternative: `req.source` is the original Web `Request` on Workers (`WebRequest` class, `source: Request`), but `source` is typed `object` on the interface. Methods: `"*"|"GET"|"POST"|...`. | [E] HttpRouter.ts:572-585; HttpServerRequest.ts:1115, 434, 492; HttpServerResponse.ts:1811 |
| CORS | `HttpRouter.cors({ allowedOrigins: string[] | Predicate, allowedMethods?, allowedHeaders?, exposedHeaders?, maxAge?, credentials?: boolean })` returns `Layer<never,never,HttpRouter>` (global middleware, also answers preflight). `HttpMiddleware.cors` takes the same options. Gotcha: with exactly 1 origin it echoes that origin; with >1 or a Predicate it echoes the request Origin if allowed; with [] it sends `*` (invalid with credentials) so never pass []. Default allowedMethods exclude OPTIONS handling issues? default = GET,HEAD,PUT,PATCH,POST,DELETE. allowedHeaders default [] (check it reflects request headers; set `["content-type","authorization"]` explicitly). | [E] HttpRouter.ts:1307; HttpMiddleware.ts:361-400 |
| web handler | `HttpRouter.toWebHandler(appLayer, { middleware?, memoMap?, disableLogger? })` -> `{ handler(request, context?) => Promise<Response>, dispose }`. Build once at module scope (docstring shows `export default { fetch: (r) => app.handler(r) }`); provide `HttpServer.layerServices`. `options.middleware` cannot change the response: use `HttpRouter.cors` layer instead. | [E] HttpRouter.ts:1470-1540 |

```ts
// unverified
const AuthRoute = HttpRouter.add("*", "/api/auth/*", (req) => Effect.gen(function* () {
  const web = yield* HttpServerRequest.toWeb(req);
  return HttpServerResponse.fromWeb(yield* Effect.promise(() => makeAuth(env).handler(web)));
}));
const App = Layer.mergeAll(ApiRoutes, AuthRoute).pipe(
  Layer.provide(HttpRouter.cors({ allowedOrigins: origins, credentials: true, allowedHeaders: ["content-type", "authorization"] })),
  Layer.provide(HttpServer.layerServices));
export const app = HttpRouter.toWebHandler(App);
```
(Whether `Layer.provide(cors)` vs `Layer.provideMerge` is needed for a global middleware layer is `unknown`: test.)

## Q3 Wrangler / workers
| item | value | source |
|---|---|---|
| module-scope env | `import { env } from "cloudflare:workers"` works in top-level scope for vars/secrets; binding methods (D1 queries, KV get) fail outside request context ("Workers do not allow I/O from outside a request context"). No compat date found; the only related flag is `disallow_importable_env` (no default date, i.e. importable by default). Binding objects themselves (`env.DB`) are readable at top level (inferred). | [doc] developers.cloudflare.com/workers/runtime-apis/bindings/ ; /compatibility-flags/ |
| typing | `@cloudflare/workers-types@5.20261019.1` declares `module "cloudflare:workers"` with `export const env: Cloudflare.Env`, but `interface Env {}` is EMPTY. So either run `wrangler types` or declare-merge: `declare namespace Cloudflare { interface Env { DB: D1Database; ... } }` in a .d.ts. | [pkg] workers-types/index.d.ts:16379-16386, 16679 |
| env.production vars | NOT inherited: `vars` is non-inheritable and must be repeated in each env. | [doc] /workers/wrangler/configuration/ |

## Recommendation
1. `database: env.DB` directly (no Kysely dep needed); tests use `memoryAdapter`. 2. Hand-own schema SQL in packages/db; use CLI generate only to diff. 3. Mount auth with `HttpRouter.add("*","/api/auth/*")` + `toWeb`/`fromWeb`; CurrentUser middleware calls `auth.api.getSession({ headers: req.headers })`. 4. CORS via `HttpRouter.cors`. 5. Declare `Cloudflare.Env` in a d.ts (the repo's `Env.ts` may already do it).

## Unknowns
Magic-link `ctx` shape; D1 with CLI generate; `advanced.database` nesting (tsc); basePath default text; cors layer composition order; HttpApiError.Unauthorized constructor args.
