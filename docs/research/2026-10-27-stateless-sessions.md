# Stateless sessions with Better Auth 1.7.11 (spike S2, 2026-10-27)

**Question.** Can the installed Better Auth (1.7.11) run fully stateless sessions as JWTs signed with one
symmetric secret (`BETTER_AUTH_SECRET`) on Workers? Revocation story? What would a JWT MCP token replace in `OAUTH_KV`?

**Setup.** Throwaway dir linking the installed package (`scratchpad/s2-Oy8m/run.mjs`, `node run.mjs <mode>`):
magic link via `auth.handler(Request)` → verify → cookies; then `db.session.length = 0` (session table emptied) and
`GET /api/auth/get-session`; adapter wrapped in a Proxy that logs every `findOne/findMany/...` call. Repo plugins
`magicLink` + `bearer`. Modes: `db-nocache` (today), `db-cache-jwt`, `db-cache-jwe`, `nodb`.

**Observation (trimmed).**
```
db-nocache   cookies, table EMPTY        authed=false dbCalls=[findOne:session]
db-cache-jwt session_data = eyJhbGciOiJIUzI1NiJ9… (3 segments, 805 B)
             cookies, table EMPTY        authed=true  dbCalls=[]
             Bearer only, table EMPTY    authed=false dbCalls=[findOne:session]
             Bearer + session_data       authed=true  dbCalls=[]
             sign-out → REPLAY old cookies authed=true dbCalls=[]
db-cache-jwe session_data = eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhT… (5 segments, 1000 B); same results as jwt
nodb         sign-in writes 0 rows to D1-equivalent; sessions/users live in Better Auth's internal memory adapter
```

**Sources.** `@better-auth/core/dist/types/init-options.d.mts:1004-1012`: `"jwt": Uses JWT with HMAC signature (no
encryption)`, `"jwe": … A256CBC-HS512 and HKDF key derivation`, `@default "compact"` (HMAC-SHA256). `:1016`
`refreshCache` "refreshed before expiry WITHOUT querying the database … fully stateless or DB-less". `create-context.mjs:48`
no `database`/`secondaryStorage` → defaults `cookieCache {enabled, strategy:"jwe", refreshCache:true, maxAge: expiresIn}`;
`:153` with a database `refreshCache` is force-disabled ("meant for stateless (DB-less) setups"). `api/routes/session.mjs:41-48`
the cache is used only when the signed `session_token` cookie is also present, and `session.session.token !== sessionCookieToken`
expires it. `plugins/jwt/types.d.mts:212` `JWKOptions` = EdDSA/ES256/ES512/PS256/RS256 only ("Asymmetric (JWS) Supported");
keys live in the `jwks` table unless `adapter.getJwks/createJwk` or a custom `sign` (`@requires jwks.remoteUrl`) is given.

**Answer.**
1. Stateless request auth exists and is symmetric: `session.cookieCache { enabled, strategy: "jwt" | "jwe", maxAge }`
   signs the session+user with `BETTER_AUTH_SECRET` (HS256 / dir+A256CBC-HS512). Observed: 0 DB reads per request with the
   session table empty. The `jwt` plugin is not the tool: asymmetric keys, `jwks` table, for third-party JWTs.
   `storeSessionInDatabase` only matters with `secondaryStorage`. (observed)
2. Caveats: (a) **Bearer alone still hits D1** — the bearer plugin only rewrites `Authorization` into the `session_token`
   cookie; the app must also send the `session_data` value (observed). (b) Sign-in still **writes** a `session` row while a
   `database` is configured, and after `maxAge` the cache falls back to that row (refreshCache disabled) (observed/source).
   (c) Truly DB-less (`nodb`) puts users and magic-link verifications in a per-isolate memory store — unusable for Tanren,
   whose rows need a persistent `userId` (observed: 0 persisted rows; per-isolate loss inferred).
3. Revocation: sign-out only clears cookies; a replayed cookie stays valid until `maxAge` (observed). Hooks: global
   kill = bump `cookieCache.version` (string → every cache invalid); per-user = `version: async (session, user) => …`
   reading a per-user generation (one KV/D1 read per request, so not stateless); otherwise short `maxAge` + DB fallback.
   jwt-plugin `definePayload`/`verifyJWT` add nothing for revocation. (source; per-user read inferred)
4. MCP (`workers-oauth-provider` 1.2.3, 47 `OAUTH_KV` refs): `client:{id}` registrations (DCR), `grant:{user}:{grant}`
   (props encrypted, `authCodeId` hash, `refreshTokenId`/`previousRefreshTokenId`), `token:{user}:{grant}:{id}` access tokens
   (wrapped key + props), `transaction:{hash}`, JTI replay keys. A JWT design can carry access-token claims (sub, client_id,
   scope, exp) and the auth code (short signed blob, but single-use needs a store); client registrations can be stateless
   only if `client_id` is itself a signed blob of the metadata; refresh-token rotation/reuse detection and revocation still
   need state. (source; design inferred)

**For Tanren.** Recommended shape: keep D1 for users/verification, enable `cookieCache { strategy: "jwe", maxAge: 30 d }`,
return both `session_token` and `session_data` to native (send both on every request), long `session.expiresIn`. That is
"stateless per request, one row at sign-in". Literally zero session rows needs a no-op `secondaryStorage` hack (untested).
