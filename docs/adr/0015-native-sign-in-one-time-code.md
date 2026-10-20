# ADR-0015: Native sign-in via a one-time code and a Bearer session token

Date: 2026-10-21 · Status: **accepted** (Lead decision under owner delegation, 2026-10-21; plan Amendment 4) · v2 · Author: architect (recording `docs/design/native-auth.md`)

## Context

The plan fixes Better Auth with magic link. On the iPhone (Expo Go) sign-in cannot work today: the
emailed link verifies in Safari, so the session cookie lands there, and an `exp://` callbackURL is
not a trusted origin (403). v1 therefore made sign-in web-only (NATIVE-1). **Verified 2026-10-21 in
installed better-auth 1.7.11**:
- `bearer()` turns `Authorization: Bearer <session.token>` into the session cookie. It also applies
  to server-side `auth.api.getSession({ headers })`.
- `oneTimeToken` stores a single-use code with an expiry, optionally hashed, in the `verification`
  table.
- `disabledPaths` blocks only HTTP requests, not `auth.api.*` calls.
- Magic-link verify resolves a relative callbackURL against `BETTER_AUTH_URL`, whose origin is
  always trusted.

**Verified in the Expo docs**: Expo Go deep links look like `exp://host:port/--/path`.
`expo-secure-store` is included in Expo Go.

## Decision

- The native app sends the magic-link request with a **relative** callbackURL:
  `/auth/native/complete?challenge=<PKCE challenge>&returnTo=<Linking.createURL("auth/callback")>`.
  `trustedOrigins` is unchanged.
- After verify, that worker page turns the fresh cookie session into a Better Auth **one-time
  token**: 5 min, single use, stored hashed. The page appends an HMAC of (token, challenge) to make
  the code. It answers with HTML containing an "Open Tanren" button to the allowlisted `returnTo`
  (`exp(s)://…/--/auth/callback`, `tanren://auth/callback`).
- The app exchanges `{ code, verifier }` at `POST /api/native/session`. The binding is checked
  before the token is consumed. The response is `{ token, userId, expiresAt }`: the raw
  `session.token`, saved in `expo-secure-store`. Every API and sync call then sends
  `Authorization: Bearer <token>` (`bearer` plugin). Sign-out clears the store. Web keeps cookies.
- `/api/auth/one-time-token/{generate,verify}` are in `disabledPaths`, so the exchange endpoint is
  the only way to redeem a code.
- The routes are mounted inside the `authRoutes` layer, so `index.ts` and `app.ts` are untouched.
  `SessionsLive` is unchanged.
- **Local dev:** phone sign-in uses `pnpm dev:phone`, which sets `BETTER_AUTH_URL` to the Mac's LAN
  IP. The link is opened in the phone's Safari: scan a terminal QR, or copy it on the Mac and paste
  it on the phone. `uqr` is allowed in worker scripts only, never in the deployed bundle.

## Consequences

- No new tables or bindings; the code lives in the existing D1 `verification` table.
- An intercepted deep link or a planted code is useless without the device's verifier.
- The app's session is the same Better Auth session row as Safari's cookie: 7 days, refreshed on
  use. Sign-out in the app ends both.
- While `dev:phone` runs, web sign-in on `localhost:8790` does not work; use `pnpm dev` for web.
- Better Auth's built-in rate limiter keeps its state in each isolate's memory on Workers, which is
  weak. A Cloudflare rate-limiting rule on sign-in and on `/api/native/session` is an owner deploy
  action.
- `CurrentUser` becomes refreshable (`refresh`, `changes`) so native sign-in needs no bundle reload.

## Alternatives considered

- **`expo-web-browser` `openAuthSessionAsync`**: the emailed link is opened from Mail in Safari,
  never inside the auth session, so the session never sees the redirect. It would need polling.
- **WebView**: same problem, and its cookie jar is separate.
- **A custom D1 or KV code table**: duplicates the plugin. KV is eventually consistent and cannot
  consume a code atomically.
- **Email OTP** (a 6-digit code typed into the app, Better Auth `emailOTP`): no deep link, no
  Safari, no `dev:phone`; the simplest option. It replaces the plan's "magic link", so it **needs
  an owner plan change** and is not decided here.

Not decided: universal links (`https://tanren.me/...` opening the app) need a dev build and an AASA
file; they come later with ADR-0012. A different user on the same device stays out of scope.
