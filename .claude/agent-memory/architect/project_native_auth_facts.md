---
name: native-auth-facts
description: Better Auth 1.7.11 ships bearer + oneTimeToken plugins and disabledPaths (HTTP-only); native sign-in design uses them instead of a custom code table
metadata:
  type: project
---

Native sign-in (design `docs/design/native-auth.md`, 2026-10-21) relies on installed better-auth 1.7.11 facts: `bearer()` also matches server-side `auth.api.getSession({ headers })`; `oneTimeToken` gives single-use, TTL'd codes in the `verification` table; `disabledPaths` blocks only the HTTP router, not `auth.api.*`. Magic-link verify resolves callbackURL against `BETTER_AUTH_URL`, so phone dev needs a LAN `BETTER_AUTH_URL` (`dev:phone`).

**Why:** check `node_modules/better-auth/dist/plugins/` before designing any custom auth storage; it saved a D1/KV table here.
**How to apply:** for future auth work (universal links, email OTP, device flow) start from the plugin list; email OTP was noted as a simpler owner question (plan says magic link).
