# Native sign-in (Expo Go, later a dev build)

Status: accepted (Lead delegation, 2026-10-21) · Team: native-auth (`docs/tasks/v2-native-auth.md`)
· ADR: proposed ADR-0015 (text in the architect report; the Lead writes it).

Goal: the owner signs in on the iPhone (Expo Go), logs a set, and it syncs. Today the emailed link
opens in Safari, the cookie lands there, and an `exp://` callbackURL fails `trustedOrigins` (403).

## 0. Verified facts (read before coding)

| # | Fact | Source |
|---|---|---|
| F1 | `bearer()` (better-auth 1.7.11, `better-auth/plugins`) is a `before` hook: for `Authorization: Bearer <t>` it turns `<t>` into the session cookie on the request headers. A token without `.` is signed with the secret first (unless `requireSignature: true`), so the **raw `session.token`** works. Its matcher also reads `context.headers`, so `auth.api.getSession({ headers })` (our `SessionsLive`) honours it. | `node_modules/better-auth/dist/plugins/bearer/index.mjs` |
| F2 | `oneTimeToken(opts)` (`better-auth/plugins`): `auth.api.generateOneTimeToken({ headers })` (needs a session, GET) stores `verification{ identifier: "one-time-token:<stored>", value: session.token, expiresAt }`; `auth.api.verifyOneTimeToken({ body: { token } })` **consumes** it (single use), returns `{ session, user }`, fails `BAD_REQUEST` "Invalid token" / "Session not found" / "Session expired". Options: `expiresIn` (minutes, default 3), `disableClientRequest` (generate refuses when `c.request` is set), `disableSetSessionCookie`, `storeToken: "hashed"`. Token = `generateRandomString(32)`. | `plugins/one-time-token/index.{mjs,d.mts}` |
| F3 | `disabledPaths: string[]` is checked only in the HTTP router's `onRequest` (404); `auth.api.*` calls bypass it. | `dist/api/index.mjs:166-168`, `@better-auth/core` `init-options.d.mts:1537` |
| F4 | Magic-link verify redirects to `new URL(callbackURL, baseURL)`; a relative `/auth/native/complete?…` resolves on the API origin, which is always trusted (`getTrustedOrigins` adds the baseURL origin). `originCheck` runs on the callbackURL. | `plugins/magic-link/index.mjs:105,135,156,207`, `context/helpers.mjs:60-74` |
| F5 | Expo Go uses `exp://`; a path is put after `/--/` (`exp://192.168.1.5:8081/--/auth/callback?code=…`). `Linking.createURL(path, { scheme, queryParams, isTripleSlashed })` builds it; in a dev build it gives `tanren://auth/callback` (`app.json` `scheme: "tanren"`). A link to a custom scheme is opened by tapping `<a href>` in Safari; typing it in the address bar may not work. | Expo docs "Linking into your app"; `expo-linking/build/createURL.d.ts:25` |
| F6 | `expo-secure-store` is "Included in Expo Go" (iOS Keychain, per-project storage), no web; latest SDK-58 version `58.0.2`. `setItemAsync/getItemAsync/deleteItemAsync`; keys `[A-Za-z0-9._-]`. | Expo docs SecureStore; `npm view` |
| F7 | `expo-crypto` 58.0.7: `getRandomBytes(n): Uint8Array`, `digestStringAsync(CryptoDigestAlgorithm.SHA256, data, { encoding: CryptoEncoding.BASE64 })`. | installed `build/Crypto.d.ts` |
| VERIFY | `disabledPaths` entries are basePath-relative (`"/one-time-token/verify"`); `auth.api.generateOneTimeToken({ headers })` leaves `c.request` unset (so `disableClientRequest` does not block us); the native `POST /api/auth/sign-in/magic-link` (no `Origin`, no cookie) passes `originCheck`; Better Auth cookies on an `http://<LAN-IP>` baseURL are not `Secure`. Each is a test in NA-1. | — |

## 1. Flow

```
App (Expo Go)                       Worker (api host)                         Safari / Mail
1 verifier = b64url(32 random B); challenge = b64url(sha256(verifier))
  SecureStore "tanren.auth.pending" ← { verifier, createdAt }
  returnTo = Linking.createURL("auth/callback")
2 POST /api/auth/sign-in/magic-link { email, callbackURL:
    "/auth/native/complete?challenge=<c>&returnTo=<enc(returnTo)>" }  → email/console link
3                                                                    owner opens link in the PHONE's Safari
4                                   /api/auth/magic-link/verify → cookie, 302 → /auth/native/complete
5                                   GET /auth/native/complete: session from cookie →
                                    ott = generateOneTimeToken; code = ott + "." + mac(ott, challenge)
                                    200 HTML: "Open Tanren" button → returnTo?code=<code>
6 Router opens /auth/callback?code=…  (tap; Safari asks "Open in Expo Go?")
7 POST /api/native/session { code, verifier } → { token, userId, expiresAt }
  SecureStore "tanren.session" ← response; delete pending; CurrentUser.refresh; requestSync
8 every API/sync call: Authorization: Bearer <token>
```

## 2. Worker contract (team native-auth, `apps/worker/src/auth/**`)

### 2.1 `BetterAuth.ts` changes
```ts
import { bearer, magicLink, oneTimeToken } from "better-auth/plugins"
// in betterAuth({...}):
disabledPaths: ["/one-time-token/generate", "/one-time-token/verify"], // server-only (F3)
plugins: [
  magicLink({ ...unchanged }),
  bearer(),                                   // F1, requireSignature stays false
  oneTimeToken({ expiresIn: 5, disableClientRequest: true,
                 disableSetSessionCookie: true, storeToken: "hashed" }),
],
```
`SessionsLive.ts`: **no change** (F1). `trustedOrigins`: unchanged. CORS: unchanged (`authorization` is
already an allowed header; native fetch does no CORS).

### 2.2 `auth/nativeCode.ts` (pure, WebCrypto; Node and workerd)
```ts
export const RETURN_TO = /^(?:exps?:\/\/[^\s?#]+\/--\/auth\/callback|tanren:\/\/\/?auth\/callback)$/
export const isAllowedReturnTo: (raw: string) => boolean
export const challengeOf: (verifier: PkceVerifier) => Effect.Effect<PkceChallenge>  // b64url(SHA-256(ascii))
export const signCode: (secret: Redacted.Redacted<string>, ott: string, challenge: PkceChallenge) => Effect.Effect<NativeCode>
export const verifyCode: (secret: Redacted.Redacted<string>, code: NativeCode, verifier: PkceVerifier)
  => Effect.Effect<Option.Option<string /* ott */>>  // None = binding mismatch
```
`mac = b64url(HMAC-SHA256(key = secret, data = "tanren-native-v1:" + ott + "." + challenge))`, 43 chars.
`verifyCode` recomputes with `crypto.subtle.verify` (constant time). Test vector: RFC 7636 App. B
(`challengeOf(<RFC verifier>) = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"`; copy the verifier from
the RFC, VERIFY).

### 2.3 `auth/nativeAuthRoutes.ts`, merged into the exported `authRoutes` layer
`authRoutes.ts` exports `authRoutes = Layer.mergeAll(<existing /api/auth/* mount>, nativeAuthRoutes)`,
so `app.ts` and `index.ts` stay untouched (the OAuth provider passes every path except `/mcp`,
`/authorize*`, token/register/well-known to `app.handler`; VERIFY no clash with `/auth/native/*`).

**`POST /api/native/begin`** body `NativeBeginRequest { email, challenge, returnTo }` → 200 `{ sent: true }`
(replaces the app's direct `POST /api/auth/sign-in/magic-link`, NA-REV finding 1a).
- Undecodable body → 400 `NativeBeginRejected{ reason: "malformed" }`; `returnTo` not allowed (no
  prefix in `NATIVE_RETURN_PREFIXES` matches) → 400 `{ reason: "return-to" }`, no email sent.
- Else `exp = now + 15 min`, `sig = b64url(HMAC(secret, "tanren-native-begin-v1\n" + lower(email) + "\n" +
  challenge + "\n" + returnTo + "\n" + exp))`, and the worker calls `auth.api.signInMagicLink` itself with
  `callbackURL = /auth/native/complete?challenge&returnTo&exp&sig` (request headers forwarded).
  `EmailSendFailed` → 502 `EmailDeliveryFailed`; outage → 503.

**`GET /auth/native/complete?challenge=<PkceChallenge>&returnTo=<url>&exp=<s>&sig=<mac>[&error=<string>]`**
- `returnTo` not allowed, `challenge` not a `PkceChallenge`, `exp`/`sig` missing, or `sig` does not verify
  against the **session user's email** → 400 HTML "This sign-in link is broken. Request a new one in
  the app." (no redirect, no code).
- `error` present, `exp` passed, no session, or the session is older than 5 min (`session.createdAt`;
  the magic link just made it) → 200 HTML with a button to `returnTo?error=link_invalid`.
- Else → 200 HTML with a big `<a href>` "Open Tanren" to `returnTo?code=<NativeCode>` (attribute
  HTML-escaped). **No meta refresh**: the hand-off needs a tap. Headers: `content-type: text/html;
  charset=utf-8`, `cache-control: no-store`, `referrer-policy: no-referrer`. Never log the code.
- Store outage → 503 `SessionStoreUnavailable` JSON; defect → 500 `InternalError` (as `authRoutes`).

**`returnTo` allowlist:** the `RETURN_TO` shape (`exp(s)://<host>[:port][/…]/--/auth/callback` or
`tanren://auth/callback`) AND `returnTo.startsWith(prefix)` for a prefix in `WorkerConfig.nativeReturnPrefixes`
(var `NATIVE_RETURN_PREFIXES`, comma list; unset = `exp://localhost:,exp://127.0.0.1:` locally, none elsewhere;
`dev:phone` adds `exp://<LAN IP>:` via `--var`; production = `exps://u.expo.dev/<projectId>/`, owner value in
deploy.md §2). A host alone is not enough: every EAS project shares `u.expo.dev` (NA-REV delta). `tanren://`
is allowed only when listed.

**Rate limit:** all three routes, 10 per minute per route per `cf-connecting-ip`, in isolate memory →
429 `NativeRateLimited{ retryAfterSeconds }` + `Retry-After`. Production upgrade: the Workers
rate-limiting binding (apps/worker/CLAUDE.md).

**`/api/auth/*`:** `set-auth-token` (added by `bearer()` to every cookie-setting response) is stripped
and removed from `access-control-expose-headers`, so the web app's JS never sees the session token.

**`POST /api/native/session`** body `NativeSessionRequest` → 200 `NativeSessionResponse`.
- Undecodable body → 400 `NativeCodeRejected{ reason: "malformed" }`.
- `verifyCode` None → 400 `{ reason: "mismatch" }` (the OTT is **not** consumed).
- `verifyOneTimeToken` BAD_REQUEST (unknown, used, expired code or session) → 400 `{ reason: "invalid" }`.
- Success → `{ token: session.token, userId: user.id (decode UserId), expiresAt: session.expiresAt }`.
- Store outage → 503 `SessionStoreUnavailable`; defect → 500 `InternalError`.

### 2.4 Shared wire schemas: new `packages/shared/src/nativeAuth.ts` (+ one barrel line)
```ts
export const PkceVerifier  = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)).pipe(Schema.brand("PkceVerifier"))
export const PkceChallenge = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)).pipe(Schema.brand("PkceChallenge"))
export const NativeCode    = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/)).pipe(Schema.brand("NativeCode"))
export const SessionToken  = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("SessionToken")) // isMinLength as in common.ts:37
export const NativeSessionRequest  = Schema.Struct({ code: NativeCode, verifier: PkceVerifier })
export const NativeSessionResponse = Schema.Struct({ token: SessionToken, userId: UserId /* ids.ts */, expiresAt: Timestamp /* common.ts */ })
/** Stored on the device between steps 1 and 7 (mobile only, not on the wire). */
export const PendingNativeSignIn   = Schema.Struct({ verifier: PkceVerifier, createdAt: Timestamp })
export class NativeCodeRejected extends Schema.TaggedError<NativeCodeRejected>()(
  "NativeCodeRejected", { reason: Schema.Literals(["malformed", "mismatch", "invalid"]) }, { httpApiStatus: 400 }) {}
// Added after NA-REV (session-export CSRF):
export const NativeBeginRequest  = Schema.Struct({ email: Email, challenge: PkceChallenge, returnTo: Schema.String })
export const NativeBeginResponse = Schema.Struct({ sent: Schema.Literal(true) })
export class NativeBeginRejected extends Schema.TaggedError<NativeBeginRejected>()(
  "NativeBeginRejected", { reason: Schema.Literals(["malformed", "return-to"]) }, { httpApiStatus: 400 }) {}
export class NativeRateLimited extends Schema.TaggedError<NativeRateLimited>()(
  "NativeRateLimited", { retryAfterSeconds: Schema.Number /* int ≥ 0 */ }, { httpApiStatus: 429 }) {}
```
(`Schema.isPattern`, `Schema.brand`, `Schema.Literals` as used in `common.ts`/`errors.ts`; `UserId`
from `ids.ts:7`, `Timestamp` from `common.ts:9`; errors that leave the worker are `Schema.TaggedError`.)

Wire example:
```http
POST /api/native/session
{"code":"Zk3…32 b64url….Qm9…43 b64url…","verifier":"dBjftJeZ4CVP-…43…"}
200 {"token":"aB3x…","userId":"00000000-0000-4000-8000-000000000001","expiresAt":"2026-10-28T07:02:11.000Z"}
400 {"_tag":"NativeCodeRejected","reason":"invalid"}
```

## 3. Mobile contract (`apps/mobile/src/services/**`, `src/hooks/**`)

### 3.1 `services/NativeSession.ts` (new)
```ts
export class NativeSignInFailed extends Data.TaggedError("NativeSignInFailed")<{
  readonly reason: "no-pending" | "rejected" | "unreachable" | "storage" | "link-invalid"
}> {}
export interface NativeSessionShape {
  /** Bearer token, if stored and not past `expiresAt`. Always None on web. */
  readonly token: Effect.Effect<Option.Option<SessionToken>>
  /** Step 1: new verifier → stores PendingNativeSignIn → returns the relative callbackURL. */
  readonly begin: Effect.Effect<string, NativeSignInFailed>
  /** Step 7: exchanges code with the pending verifier, stores the response, deletes pending. */
  readonly complete: (code: string) => Effect.Effect<UserId, NativeSignInFailed>
  /** Sign-out / 401: deletes "tanren.session" and "tanren.auth.pending". */
  readonly clear: Effect.Effect<void>
}
export class NativeSession extends Context.Service<NativeSession, NativeSessionShape>()("@tanren/NativeSession") {
  static readonly layer        // EXPO_OS !== "web": SecureStore via lazy import("expo-secure-store"); web: layerNone
  static readonly layerNone    // token None, begin/complete fail "no-pending", clear no-op
  static readonly layerMemory  // Ref-backed key-value, for Node tests
}
/** Adds `Authorization: Bearer` when a token exists; no-op otherwise (web keeps cookies). */
export const withSession: (request: HttpClientRequest.HttpClientRequest)
  => Effect.Effect<HttpClientRequest.HttpClientRequest, never, NativeSession>
```
Keys: `tanren.session` (JSON of `NativeSessionResponse` encoded), `tanren.auth.pending`
(`PendingNativeSignIn`, ignored after 15 min). Stateless over SecureStore (reads per call), so layers
may self-provide it (no `runtime.ts` edit): `CurrentUser.layer` and `SyncTransport.layer` add
`Layer.provide(NativeSession.layer)` exactly as they provide `FetchHttpClient.layer`.

### 3.2 Changes to existing services and hooks
- `magicLink.ts`: `signInSupported` → `true` on `ios`/`android`/`web`; new
  `nativeCallbackUrl(challenge, returnTo) = "/auth/native/complete?" + URLSearchParams({challenge, returnTo})`;
  `SIGN_IN_WEB_ONLY_NOTICE` deleted once unused. Web keeps `todayCallbackUrl`.
- `useSendMagicLink.ts`: native → `NativeSession.begin` then `sendMagicLink(email, callbackURL)`.
  `Sent` copy on native: "Open the link on this iPhone." (screens already gate on `SIGN_IN_SUPPORTED`,
  so `app/sign-in.tsx` and `today.tsx` need no edit.)
- `CurrentUser.ts`: `signedIn` reads a `SubscriptionRef`; new `refresh: Effect<Option<UserId>>`
  (re-resolve, set ref) and `changes: Stream<Option<UserId>>`; `fetchSession` goes through
  `withSession`. A 200 `null` with a stored token → `NativeSession.clear` (expired session).
- `SyncTransport.ts`: each request goes through `withSession`; `credentials: "include"` stays (web).
- `useSignedIn.ts`: subscribes to `CurrentUser.changes` instead of reading once.
- New `hooks/useNativeCallback.ts`: `(params: { code?: string; error?: string }) => State`
  (`Exchanging | Done | Failed{message}`); runs `complete` → `CurrentUser.refresh` →
  `SyncEngine.requestSync`; copy for `link-invalid`: "That link expired. Request a new one."
- New route `app/auth/callback.tsx` (R2): reads `useLocalSearchParams`, calls the hook, on `Done`
  `router.replace("/today")`; renders a spinner / the failure + "Back to sign-in".
- Sign-out (`Account`, team design phase 2 X4, R4): native posts `/api/auth/sign-out` through
  `withSession`, then `NativeSession.clear`, then forgets the owner as on web.

## 4. Security

- Code = single-use OTT (5 min, stored hashed) + HMAC binding to the PKCE challenge: an intercepted
  deep link (another app claiming `exp://`) is useless without the verifier, which never leaves the
  device. Login CSRF (attacker's code in the victim's app) fails the binding too.
- The bare OTT cannot be redeemed over HTTP (`disabledPaths`, F3); the exchange is the only door.
- Only the one-time code appears in a URL; the session token travels only in the exchange response
  body and `Authorization` headers. No token or code in logs.
- `returnTo` allowlist (`RETURN_TO` + pinned hosts) prevents an open redirect; `trustedOrigins` unchanged.
- **Session-export CSRF** (NA-REV, 2026-10-21): Safari holds a Lax session cookie, and a top-level GET
  sends it. With only (challenge, returnTo) in the URL, any page could navigate a signed-in owner to
  `/auth/native/complete?challenge=<attacker's>&returnTo=exp://<attacker's dev server>` and receive a
  code it can redeem with its own verifier, i.e. the owner's session. Closed by two independent layers:
  (a) the URL must carry a worker signature over (email, challenge, returnTo, expiry) that only
  `POST /api/native/begin` mints, it is checked against the session user's email, and the session must be
  ≤ 5 min old (made by that magic link), so a crafted URL or an old cookie yields no code; (b) `returnTo`
  prefixes are pinned (`NATIVE_RETURN_PREFIXES`, down to the EAS project id), so even a valid code can only
  go to an Expo Go loading this project, and the page needs a tap (no meta refresh).
- Residual: any iOS app can register a custom scheme (`exp://`, `tanren://`), so a malicious app on the
  owner's phone could still receive the deep link. The PKCE binding makes that code useless without the
  verifier, but before a store build the hand-off should move to universal links
  (`https://tanren.me/auth/callback` + AASA, ADR-0012); until then production lists no `tanren://` prefix.
- The session token never appears in a `/api/auth/*` response header (`set-auth-token` stripped).
- Rate limits: code space is 64^32 plus a MAC, brute force is moot. The native routes have their own
  per-isolate limiter (10/min/IP, 429 `NativeRateLimited`); Better Auth's limiter (forced on in
  production via `rateLimitFor`) is per-isolate memory too (weak). Deploy note (owner action,
  `docs/design/deploy.md`): a Cloudflare rate-limiting rule on `POST /api/auth/sign-in/*` and
  `/api/native/*`, or the Workers rate-limiting binding.
- The session is a normal Better Auth session (7-day expiry, refreshed on use); the app session is
  the same row as Safari's cookie, so sign-out in the app ends both.

## 5. Local dev (owner's morning recipe)

The emailed/printed link uses `BETTER_AUTH_URL`, and verify redirects relative to it (F4), so for
phone sign-in the API must call itself by the Mac's LAN address:
```sh
pnpm dev:phone   # API only: wrangler dev --ip 0.0.0.0 --var BETTER_AUTH_URL:http://$(ipconfig getifaddr en0):8787
pnpm -F @tanren/mobile start   # scan the QR with the iPhone camera → Expo Go
```
1. In Expo Go: Sign in → email `dev@tanren.local` → "Open the link on this iPhone".
2. The wrangler terminal prints `magic link for dev@tanren.local: http://192.168.x.y:8787/api/auth/magic-link/verify?…`
   **and a terminal QR of the same URL** (decided: yes, NA-4: `dev:phone` pipes wrangler through
   `apps/worker/scripts/linkQr.mjs` using `uqr` `renderUnicodeCompact`, VERIFY the export name; never in the bundle). Scan it with the iPhone camera → it opens in the
   phone's Safari. Fallback without QR: copy the URL on the Mac and paste it into the iPhone Safari
   address bar (Universal Clipboard). It must open on the PHONE: on the Mac the deep link has no Expo Go.
3. Safari shows "Open Tanren" → tap → "Open in Expo Go?" → Open → Today, signed in; log a set; the
   wrangler log shows `POST /sync/push 200`.
Caveat: while `dev:phone` runs, web sign-in on `localhost:8790` does not work (the cookie lands on the
LAN host); use `pnpm dev` for web. Production: link host `api.tanren.me`, same steps from Mail.

## 6. Not decided here

- Email OTP (6-digit code typed in the app) would need no deep link and no `dev:phone`; it changes
  the plan's "magic link", so it is a future owner question, not this team's.
- Universal links (`https://tanren.me/...` opening the app) need a dev build + AASA: later, with ADR-0012.
- Different user on the same device: still out of scope (v2-extras §2.2).
