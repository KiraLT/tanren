# ADR-0019 — Sign-in gate: no account and no local data shows only the sign-in flow

Status: accepted (Lead decision under plan Amendment 3, 2026-10-26; owner reviews asynchronously)

## Context
The app is offline-first: with no session it runs on an empty local store (demo plan seeded) and
shows every screen. On the public web domain that reads as "no auth" (owner, 2026-10-26: "Why you
can browse without sign in?"). The plan still requires the app to work fully offline.

## Decision
`gateFor({ account, localSets, route })` (`src/services/authGate.ts`, pure) returns `"sign-in"` only
when the device has no account AND zero live sets AND the route is not `/sign-in` or `/auth/*`.
An account is the resolved user, the dev override `EXPO_PUBLIC_DEV_USER_ID`, or the stored owner
(`sync_state.ownerUserId`), so an expired session (`get-session` null) or an offline start is not a
gate; sign-out (`forgetOwner`) removes the owner but keeps local rows, so a user with logged sets is
never locked out. `app/_layout.tsx` calls it through `useAuthGate(usePathname())` on web and native,
renders nothing until `CurrentUser` and the set count answered (no flash), then redirects to
`/sign-in`. A failed runtime allows (screens show their own error).

## Consequences
- A new visitor sees only sign-in; after the magic link (web reload) or the native code exchange
  (`CurrentUser.changes`) the app opens. The demo seed no longer shows to anonymous visitors.
- Gate is a UX rule, not security: the data is local, the API is authenticated on its own.
- Rejected: gating on session alone (breaks offline starts and signed-out users with data).
