# MCP OAuth + write tools (step 5)

Status: accepted (Lead delegation), 2026-10-20. Normative for `apps/worker/src/{index,Env,Config}.ts`,
`src/oauth/**`, `src/mcp/**`, `packages/shared/src/mcp.ts` and `wrangler*.jsonc`. Tags: **[V]** verified
2026-10-20 (context7 `/cloudflare/workers-oauth-provider` v1 docs, Cloudflare docs MCP, installed
`agents@0.28.1` types, repo code); **[S]** verified by S5-SPIKE under local `wrangler dev`
(`docs/research/2026-10-20-oauth-provider-spike.md`); **VERIFY:** the engineer settles it against
installed `.d.ts` before relying on it. Builds on `docs/design/mcp.md` (unchanged except where this note
says "amend") and ADR-0010.

S5-SPIKE summary [S]: `@cloudflare/workers-oauth-provider@1.2.3` wraps the stateless `createMcpHandler`
under `wrangler dev` with our compat date/flags, local KV binding `OAUTH_KV`, no Durable Object.
`resourceMetadata.resource` is **required** (workerd fails at startup without it; `http:` only on
loopback). DCR (`/register`, public clients `token_endpoint_auth_method: "none"`) is on by default once
`clientRegistrationEndpoint` is set; PKCE S256 is mandatory (`allowPlainPKCE` throws). Scopes are
advertised, not enforced: the handler decides. `/authorize` must catch `parseAuthRequest` failures
(`AuthorizationError` → `authorizationErrorRedirect`) or it 500s. Access token 3600 s + refresh token.
CIMD stays off (needs compat flag `global_fetch_strictly_public`; not needed). Not tested by the spike:
a real Claude Code or Claude app login (interactive browser) → runtime proof / owner step.

## 1. Shape: one Worker, `OAuthProvider` in combined mode, no Durable Object

- Package: `@cloudflare/workers-oauth-provider` **1.2.3** (npm latest, 2026-10-07 [V]); catalog pin.
  v1 kept the combined `OAuthProvider` (authorization server + resource in one Worker); the only
  v1-required addition over 0.x is `resourceMetadata: { resource }` [V changelog 2026-10-01]. The
  split API (`OAuthAuthorizationServer` + `OAuthResourceServer`, Service Bindings) is not used: one
  Worker, one D1, one KV. No Durable Object: the provider stores everything in KV [V].
- `src/index.ts` (adapter; the only module that constructs the provider):
  ```ts
  import { OAuthProvider } from "@cloudflare/workers-oauth-provider"   // VERIFY: named vs default export
  const config = WorkerConfig.fromEnvSync(env)             // new: pure decode, defect on ConfigError (module scope)
  const app = makeApp(env, { … })                          // unchanged REST app
  const mcp = makeMcp(env, { persistence: d1Persistence(env.DB), auth: McpAuth.layerLive })
  const authorize = makeAuthorize(env, { sessions: SessionsLive … })   // §3
  const serve = (request: Request, env: Env, ctx: ExecutionContext) => {
    const path = new URL(request.url).pathname
    return path === "/mcp" ? mcp.handle(request, env, ctx)
      : path === "/authorize" || path.startsWith("/authorize/") ? authorize.handle(request, env, ctx)
      : app.handler(request)
  }
  export default new OAuthProvider<Env>({
    apiRoute: "/mcp", apiHandler: { fetch: serve },        // valid token → ctx.props set
    defaultHandler: { fetch: serve },                      // everything else, incl. /mcp without a token
    authorizeEndpoint: `${config.betterAuthUrl}/authorize`,
    tokenEndpoint: `${config.betterAuthUrl}/oauth/token`,
    clientRegistrationEndpoint: `${config.betterAuthUrl}/oauth/register`,
    scopesSupported: [...MCP_SCOPES], requiredScopes: ["tanren:read"],
    resourceMetadata: { resource: config.mcpResourceUrl },
    accessTokenTTL: 3600, refreshTokenTTL: 2592000,
  })
  ```
  `OAuthProvider` is an `ExportedHandler` (`fetch(request, env, ctx)`), so it is the default export;
  `apiHandler: { fetch }` as a plain object works [S] → no class needed. `authorizeEndpoint` is
  advertised, **not served**, by the provider: our `serve` owns it [V][S]. `tokenEndpoint`,
  `clientRegistrationEndpoint`, `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource/mcp` (path-suffixed; the root path is 404) are served by the
  provider [S]. `apiRoute` must be covered by `resourceMetadata.resource` [V].
- Hosts. Production: `api.tanren.me` and `mcp.tanren.me` are two custom domains on the same
  Worker (research 2026-10-19: a Worker may carry several custom domains [V-doc]). The **authorization
  server lives on `api.tanren.me`** (= `BETTER_AUTH_URL`, so the Better Auth session cookie is on the
  same host as `/authorize`; no cross-subdomain cookie); the **resource is `https://mcp.tanren.me/mcp`**.
  Locally both are `http://localhost:8787`. Hence the endpoints above are full URLs built from
  `betterAuthUrl` (the config table allows "absolute path or full URL" [V]; the spike used paths on
  one host [S]). **VERIFY (S5-T4, first thing, against `wrangler dev` with a second hostname is not
  possible — read the `.d.ts`/README):** (a) full-URL endpoints make the issuer and
  `/.well-known/oauth-authorization-server` follow the `BETTER_AUTH_URL` host, (b) whether
  `resourceMetadata.authorization_servers` must be set to `[config.betterAuthUrl]` when issuer ≠
  resource host. Fallback if (a) fails: path endpoints (as in the spike) so the whole flow runs on
  `mcp.tanren.me`, plus Better Auth `advanced.crossSubDomainCookies: { enabled: true, domain:
  ".tanren.me" }` (VERIFY option name in `better-auth@1.7.11`) and `https://mcp.tanren.me` in
  `trustedOrigins`; locally nothing changes either way.
- `/mcp` without a valid token: the provider itself answers **401** with `WWW-Authenticate: Bearer
  realm="OAuth", resource_metadata="<issuer>/.well-known/oauth-protected-resource/mcp", scope="tanren:read"`
  [S]. `McpRoute` keeps its own 401 (same header, built from `mcpResourceUrl`) for the `defaultHandler`
  path, tests and the dev-token case; both answers are identical on the wire.
- CORS: `createMcpHandler` defaults (Claude Code / Claude app send no browser `Origin`);
  `allowedHostnames: [new URL(config.mcpResourceUrl).hostname]` (ADR-0010 consequence).

## 2. Config and bindings

- `wrangler.jsonc` (top level = local): add
  `"kv_namespaces": [{ "binding": "OAUTH_KV", "id": "local-oauth-kv" }]` (a local KV binding is all
  the provider needs [S]) and the var `"MCP_RESOURCE_URL": "http://localhost:8787/mcp"`.
  Add an `env.production` block with every production var and placeholder ids (`deploy.md` §2);
  `wrangler.test.jsonc` gets the same KV binding (miniflare KV in workerd tests).
- `Env.ts`: `readonly OAUTH_KV: KVNamespace`, `readonly MCP_RESOURCE_URL: string`. The provider
  injects `env.OAUTH_PROVIDER: OAuthHelpers` per request [V]; type it as
  `readonly OAUTH_PROVIDER?: OAuthHelpers` (import type from the package) so `makeApp`'s module `env`
  (which lacks it) still typechecks.
- `Config.ts`: `mcpResourceUrl: string` (must parse as an absolute `https:` URL, or `http:` only when
  `environment === "local"`; else `ConfigError`); new `WorkerConfig.fromEnvSync(env): WorkerConfigShape`
  = `Effect.runSync` of the decode (module scope, no I/O; a failure is a startup defect, as the eager
  layers already are). No `DEV_MCP_TOKEN` change.

## 3. Authorize flow (`apps/worker/src/oauth/`)

Modules: `OAuthApi.ts` (Effect port over `env.OAUTH_PROVIDER`), `authorize.ts` (`makeAuthorize`),
`pages.ts` (pure HTML string functions, every client-supplied value escaped), `authorize.test.ts`
(Node, fake `OAuthHelpers`), `oauth.workerd.test.ts` (full flow, §6).

```ts
// OAuthApi.ts — thin Effect wrapper; every method maps a rejection to OAuthFailure (Data.TaggedError, internal)
export class OAuthApi extends Context.Service<OAuthApi, {
  readonly parseAuthRequest: (request: Request) => Effect<AuthRequest, OAuthFailure>
  readonly describeConsent: (req: AuthRequest) => Effect<ConsentDescription, OAuthFailure>   // clientName, clientDomain, redirectUri, scope [V]
  readonly beginConsent: (req: AuthRequest) => Effect<{ handle: string; headers: Headers }, OAuthFailure>
  readonly approveConsent: (request: Request, handle: string, o: { scope: ReadonlyArray<string> }) => Effect<{ request: AuthRequest; headers: Headers }, OAuthFailure>
  readonly denyConsent: (request: Request, handle: string) => Effect<{ headers: Headers }, OAuthFailure>
  readonly completeAuthorization: (o: { request: AuthRequest; userId: UserId; scope: ReadonlyArray<string>; props: OAuthProps }) => Effect<{ redirectTo: string }, OAuthFailure>
}>()("@tanren/worker/OAuthApi") {
  static readonly layerFromHelpers = (helpers: OAuthHelpers): Layer<OAuthApi>     // per request (env.OAUTH_PROVIDER)
  static readonly layerFake: Layer<OAuthApi>                                       // tests: in-memory handles
}
```
`AuthRequest`/`ConsentDescription`/`OAuthHelpers` are the package's exported types (VERIFY names:
`AuthRequest`, `OAuthHelpers`; `describeConsent` returns `clientName`, `clientDomain`,
`redirectUri`, `redirectHost`, `redirectIsLoopback`, `scope` [V]). `beginConsent/approveConsent/
denyConsent` are the v1 consent helpers that implement the confused-deputy protection (a handle in
a `__Host-oauth-…` cookie, single use, 10 min) [V consent-page.md]; we do not hand-roll CSRF.

`makeAuthorize(env, { sessions }): { handle(request, env, ctx): Promise<Response> }` builds one
`ManagedRuntime` (`sessions` + `WorkerConfig.layerFromEnv(env)` + `BetterAuth` for the magic-link
send) and per request provides `OAuthApi.layerFromHelpers(env.OAUTH_PROVIDER)`. Note: this is a
second Better Auth instance next to `makeApp`'s (lazy, same DB and secret; harmless). VERIFY:
if `makeApp` can expose its `Sessions`/`BetterAuth` runtime cheaply, share it instead.

Routes (all on the `BETTER_AUTH_URL` host):
| Route | Behaviour |
| --- | --- |
| `GET /authorize?<oauth params>` | `parseAuthRequest`. No Better Auth session (`Sessions.current(headers)` → None) → **login page** (email form, `action=/authorize/login`, hidden `next` = this URL incl. query). Session → `describeConsent` + `beginConsent` → **consent page** (client name/domain/redirect host, one checkbox per requested scope with the §4 descriptions, Approve / Deny, hidden `handle`) with `consent.headers` + `Content-Type: text/html; charset=utf-8`. `parseAuthRequest` failure must be caught [S]: an `AuthorizationError` **with** a trusted `redirectUri` → 302 `authorizationErrorRedirect(...)` (package export); without one → 400 page, never a redirect [V]. An uncaught rejection is a 500 [S]. |
| `POST /authorize/login` (`email`, `next`) | `next` must be same-origin and start with `/authorize?` (else 400). Calls Better Auth server-side: `auth.api.signInMagicLink({ body: { email, callbackURL: next } })` (**VERIFY** method name/shape against `better-auth@1.7.11` types; fallback: `auth.handler(new Request(…/api/auth/sign-in/magic-link))`). Renders "check your email" page (locally the link is printed by `layerConsole`). The link verifies at `/api/auth/magic-link/verify?token=…&callbackURL=<next>` (research 2026-10-20), sets the session cookie, redirects to `next` → consent page. |
| `POST /authorize` (`handle`, `decision`, `scope[]`) | `decision !== "approve"` → `denyConsent` → 302 with its headers (`access_denied` to the client). Else `approveConsent(request, handle, { scope: ticked ∩ MCP_SCOPES })` → `completeAuthorization({ request: approved.request, userId, scope: approved.request.scope, props: { userId, scopes: approved.request.scope } })` → 302 `Location: redirectTo` with `approved.headers`. `userId` is re-read from `Sessions.current` on this request, never from the form. |
Everything is Effect except the `handle` adapter (runtime.runPromise). No cookies are set by us: the
provider's helpers own the consent cookie; Better Auth owns the session cookie.

## 4. Identity seam: `ctx.props` → `McpAuth`

Amend `docs/design/mcp.md` §2: the port returns a principal, not a bare id, and takes `ctx`.
```ts
// packages/shared/src/mcp.ts (amend)
export const MCP_SCOPES = ["tanren:read", "tanren:write"] as const
export const McpScope = Schema.Literals(MCP_SCOPES)
/** The grant props the OAuth provider stores encrypted and hands back as `ctx.props`. */
export const OAuthProps = Schema.Struct({ userId: UserId, scopes: Schema.Array(McpScope) })

// apps/worker/src/mcp/McpAuth.ts (amend)
export interface McpPrincipal { readonly userId: UserId; readonly scopes: ReadonlyArray<McpScope> }
export interface McpAuthShape { readonly resolve: (request: Request, ctx: ExecutionContext) => Effect<Option<McpPrincipal>> }
McpAuth.layerDevToken   // as today, principal scopes = all MCP_SCOPES
McpAuth.layerOAuth      // Schema.decodeUnknownOption(OAuthProps)(ctx.props) → Some(principal); anything else None
McpAuth.layerLive       // layerOAuth, then layerDevToken as fallback (dev token is already local-only by Config)
McpAuth.layerFixed(principal: Option<McpPrincipal>)
```
`ctx.props` is `Record<string, unknown>` set by the provider for valid-token requests [V][S]; decoding
it with `OAuthProps` is the only trust boundary. `McpRoute` resolves the principal **before**
`createMcpHandler` runs, so it reads `ctx.props` directly; `getMcpAuthContext()` from `agents/mcp/server`
(AsyncLocalStorage, falls back to `ctx.props` [S]) is only usable inside tool handlers and is not
needed because `userId` reaches tools by closure (mcp.md §2). `ctx.auth.scope` also exists [S]; we
read scopes from `props` so the grant is self-contained. Scope descriptions (consent page, `pages.ts`):
`tanren:read` = "Read your training history and current plan"; `tanren:write` = "Write plan weeks,
log sessions and update your profile". `server.ts` registers `readTools` always and `writeTools`
only when `principal.scopes` includes `tanren:write` (one `McpServer` per request makes this a
closure decision; `createMcpHandler`'s `authContext` option stays unused).

## 5. Write tools (`apps/worker/src/mcp/writeTools.ts`, pure Effect, Node-testable)

Generalise `ReadTool` to `Tool` with `readonly kind: "read" | "write"`; keep `readTools`, add
`writeTools` (MCP_TOOLS order) and `ToolDeps = … | IdGenerator`, `ToolError = NotFound |
ValidationError | Forbidden | PersistenceError`. Annotations: write tools `readOnlyHint: false`,
`idempotentHint` as below, `destructiveHint: true` for `write_plan_week` and `log_session` with
`sessionId`. Ids via `newId(PlanWeekId)` etc.; timestamps via `DateTime.now`; every row carries the
caller's `userId` (repo `put`s refuse foreign rows with `Forbidden`).

Amend `packages/shared/src/mcp.ts` (inputs typed in step 4; fields added here are optional, so the
step-4 round-trip tests keep passing):
```ts
export const WritePlanWeekInput = Schema.Struct({
  planId: Schema.OptionFromNullOr(PlanId),          // None = the active plan
  newPlan: Schema.optionalKey(Schema.Struct({ name: Label, goal: Text })),   // used only when no active plan exists
  weekStart: LocalDate, intent: Schema.OptionFromNullOr(Text),              // was `notes`; PlanWeek's field is `intent`
  sessions: Schema.Array(PlannedSessionSpec) })
export const WritePlanWeekResult = Schema.Struct({ planId: PlanId, planWeekId: PlanWeekId, replaced: Schema.Boolean,
  sessions: Schema.Array(Schema.Struct({ plannedSessionId: PlannedSessionId, order: OrderIndex, name: Label, sets: Schema.Int })) })
export const LogSessionInput = Schema.Struct({ …as today…,
  sessionId: Schema.optionalKey(SessionId),         // replace that session (idempotent retry); omit = create
  sets: Schema.Array(Schema.Struct({ …as today…, loggedAt: Schema.optionalKey(Timestamp) })) })  // default startedAt
export const LogSessionResult = SessionWithSets
export const UpdateProfileResult = Profile
```
Rules:
- **`write_plan_week`** (`idempotentHint: true`). Plan: `planId` Some → must equal the active plan's id
  (`PlanRepo.currentPlan`), else `ValidationError("planId is not the active plan")`; None → the
  active plan, or when none exists create `{ name, goal, startDate: weekStart, status: "active" }` from
  `newPlan` (missing → `ValidationError("no active plan; pass newPlan")`). Week: a live week with
  this `weekStart` in `currentPlan.weeks` → reuse its id, update `intent`, `replaced: true`; else new
  week. Sessions: match existing live planned sessions of that week by `order` → keep the id, update
  fields; existing orders not in the input → tombstone (`deletedAt`); new orders → insert. Sets (amended
  2026-10-21, Lead decision): within each kept planned session, match its live sets by `order` → keep
  the id, update fields; existing orders not in the input → tombstone; new orders → insert. Sets of a
  tombstoned planned session are tombstoned with it. Validation before any
  write: `order` values unique per week and per session (`ValidationError`), every `exerciseId` in
  `ExerciseRepo.list` (`NotFound("exercise", id)`), `weekStart` any weekday (ADR-0007). Writes, parents
  first: `putPlans` (0/1), `putPlanWeeks`, `putPlannedSessions`, `putPlannedSets` (≤ 4 batches; reads
  ≤ 5: `currentPlan` + `list` exercises). Returns `WritePlanWeekResult`.
- **`log_session`** (`idempotentHint: false` without `sessionId`). `sessionId` Some → must be the
  caller's live session (`getSession`, else `NotFound("session", id)`); its live sets are tombstoned and
  replaced; the session row is upserted with the same id. None → if a live session already has this
  exact `startedAt` (`listSessions([startedAt, startedAt+1ms))`) → `ValidationError("a session already
  starts at <iso>; pass sessionId to replace it")`; else new id. `plannedSessionId` Some → must be in
  `currentPlan.sessions` (else `NotFound("plannedSession", id)`); `finishedAt ≥ startedAt` (shared check);
  every `exerciseId` exists; `order` = array index; `loggedAt` default `startedAt`; `plannedSetId` None.
  Writes: `putSessions`, `putSets` (2 batches). Returns `SessionWithSets` (`sets` in order).
- **`update_profile`** (`idempotentHint: true`). `ProfileRepo.get`: Some → merge the patch (absent key =
  unchanged) and `put` with `updatedAt = now`; None → create from the patch, which must then carry
  `timezone` (`ValidationError("no profile yet; timezone is required")`), other arrays default `[]`.
  `id = userId` always. Returns `Profile`.
- Error mapping in `server.ts` as mcp.md §4 plus `Forbidden` → `{ isError: true, text: "Forbidden: …" }`.

## 6. Wire examples and proof

Discovery (unauthenticated): `POST https://mcp.tanren.me/mcp` → `401`, `WWW-Authenticate: Bearer
realm="OAuth", resource_metadata="https://mcp.tanren.me/.well-known/oauth-protected-resource/mcp", scope="tanren:read"`
[S]; that document lists `authorization_servers`; `GET <issuer>/.well-known/oauth-authorization-server`
→ `{ issuer, authorization_endpoint: ".../authorize", token_endpoint: ".../oauth/token", registration_endpoint: ".../oauth/register", scopes_supported: ["tanren:read","tanren:write"], code_challenge_methods_supported: ["S256"], … }` [S].
Token response: `{ access_token, token_type: "bearer", expires_in: 3600, refresh_token, scope }` [S].
Claude Code locally: `claude mcp add --transport http tanren-local http://localhost:8787/mcp` (no
header) → browser opens `/authorize` → login page → magic link from the wrangler console → consent →
back in Claude Code; `tools/list` shows seven tools. Claude app (owner, production only): Settings →
Connectors → Add custom connector → URL `https://mcp.tanren.me/mcp`, leave client id/secret empty
(DCR) → same browser flow. **VERIFY (runtime proof, not settled by the spike):** Claude Code's
`claude mcp add --transport http` completes DCR + PKCE against localhost with no pre-registered
client; the Claude app connector is an owner action (deploy.md §5).
`tools/call write_plan_week` result `structuredContent`:
```json
{ "planId": "a1b2…", "planWeekId": "c3d4…", "replaced": false,
  "sessions": [ { "plannedSessionId": "e5f6…", "order": 0, "name": "Lower A", "sets": 9 } ] }
```
Insufficient scope: a grant with only `tanren:read` sees four tools; `tools/call log_session` →
JSON-RPC error "unknown tool" from the SDK (not registered).

## 6a. Client identities and trust (IDENT-1, 2026-10-27; spike S1 `docs/research/2026-10-27-mcp-client-identities.md`)

- `clientIdMetadataDocumentEnabled: true` (`provider.ts`) + compatibility flag `global_fetch_strictly_public`
  (`wrangler.jsonc` top level, inherited by `env.production`; also `wrangler.test.jsonc`). An `https:`
  `client_id` with a path is a Client ID Metadata Document: the provider fetches it (10 s, 5 KiB, cached ≤ 7 d),
  requires `client_id` == URL, a `client_name`, matching redirect URIs, no secret, and sets
  `ConsentDescription.clientDomain` (its hostname) for such clients only. AS metadata advertises
  `client_id_metadata_document_supported: true` and `none` (Claude needs both). DCR stays on.
- Trust (`oauth/knownClients.ts`): `clientTrust(Option.fromNullishOr(clientDomain))` →
  `{ _tag: "Known", name, domain } | { _tag: "Unknown" }`. Known iff the domain equals or is a subdomain of a
  `TRUSTED_CLIENT_HOSTS` entry: `claude.ai`, `claude.com` → "Claude", `chatgpt.com` → "ChatGPT". By host, not
  URL: claude.ai's hosted document URL is unpublished, ChatGPT's varies per `callback_id`. A client's name never
  counts (a DCR client may call itself "Claude"); a document on any other host is Unknown.
- Consent page (`pages.ts`, `authorize.ts` `consentView`): Known → heading with our name, "Verified app · <domain>",
  button "Approve". Unknown → `danger` block "Unknown app" ("Tanren can't verify who built this app. It calls
  itself "<clientName>" and will return you to <redirect host>. …"), plus the document host for an unknown CIMD
  client; button "Allow anyway". Every client string goes through `escapeHtml`; the loopback warning is unchanged.
- Production check after deploy (owner/Lead): connect from claude.ai ("Use Claude's published identity") and
  ChatGPT; chatgpt.com answered the spike's local workerd fetch with 403 (bot filter), production egress untested.

## 7. Not decided here

- Writing to a non-active (draft) plan, deleting a week, deleting a session: not in the plan's tool
  list; add `delete_*` tools when needed. Refresh-token idle expiry (`refreshTokenIdleTTL`): default off.
- Sharing the Better Auth instance between `makeApp` and `makeAuthorize` (see §3 VERIFY).
- Rate limiting on `/authorize/login` (magic-link email per address): Better Auth's own rate limiter
  applies to `/api/auth/*` only; revisit if abuse appears (single-user app, Resend free tier).
