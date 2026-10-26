# ADR-0021 — Signed-out web landing: the gate renders a page instead of redirecting

Status: accepted (Lead decision under plan Amendment 3 and Amendment 13, 2026-10-26; owner reviews asynchronously)

## Context
ADR-0019's gate (`gateFor`, `apps/mobile/src/services/authGate.ts`) sends a device with no account and
no local sets to `/sign-in` for every route. On tanren.me a stranger therefore meets a bare form. The
owner (2026-10-26 22:25): "when not signed in, show cool landing page with button to sign in. It should
have illustrations". Native (Expo Go) keeps the sign-in screen: no marketing page inside the app.

## Decision
1. **Rule**: on web, whenever `gateFor` says `"sign-in"` (no account, no sets, route not `/sign-in`
   or `/auth/*`), `app/_layout.tsx` renders `<Landing />` in place of `<Redirect href="/sign-in" />`.
   The rule covers *every* gated route, not only `/`: `/library`, `/settings`, `/feed` signed out all
   show the landing, URL unchanged. Reason: it is the only rule with zero new states — no route file,
   no typed-routes change, no second redirect, and no path on which app chrome can reach a stranger.
   `/` keeps `index.tsx`'s redirect to `/today` (FEED-0 D2); the landing then renders at `/today`.
2. **No change to `gateFor`, `isSignInRoute` or `useAuthGate`** (pure, tested, shared with native).
   The platform branch is one expression in `_layout.tsx`: `Platform.OS === "web" ? <Landing /> :
   <Redirect href="/sign-in" />`. Native behaviour is byte-identical to today.
3. **Navigator stays mounted** while the landing shows (Expo Router needs it for the Sign-in
   button's `router.replace("/sign-in")`, the pattern `app/sign-in.tsx:44` already uses) but is
   hidden with `display: "none"` (not today's `opacity: 0`, which keeps layout height and would push
   the landing below an invisible screen). `ui-measure.js` already skips `display:none` subtrees.
4. **Sign-in button** navigates to `/sign-in`; the gate allows that route, so the Stack becomes
   visible and the existing styled screen (LOGO-2) renders. After the magic link the web reload
   resolves an account and the gate lifts (ADR-0019 unchanged).
5. The landing lives in `apps/mobile/src/components/landing/` (design: `docs/design/landing.md`),
   imports UI from `src/ui` only, and ships five generated illustrations under
   `apps/mobile/assets/landing/` (webp, ≤ 1.5 MB total).

## Consequences
- Files that change for the routing: `apps/mobile/app/_layout.tsx` only (`Platform` import, the
  ternary, the `hidden` style). `authGate.ts`, `authGate.test.ts`, `useAuthGate.ts`, `index.tsx`,
  `sign-in.tsx` untouched. `apps/mobile/CLAUDE.md` route inventory gets one "not a route but
  owner-visible" line.
- A deep link shared while signed out (`tanren.me/library/<id>`) shows the landing; after sign-in the
  user lands on `/today`, not the shared page. Accepted: no deep-link restore today either.
- The landing is still a UX rule, not security (ADR-0019 §Consequences stands).
- The landing re-renders on every gate change; it holds no state and no effects beyond the button.

## Alternatives considered
- A `landing.tsx` route plus `Redirect href="/landing"`: a new route in the inventory, typed routes
  regenerate, a second redirect hop, and the gated-route-to-landing mapping still has to exist.
- Landing only at `/`, `/sign-in` for the rest: two signed-out looks, and `/today` (where `index.tsx`
  sends everyone) would still be the form.
- A `"landing"` third `GateDecision` with a `web` input: moves a platform fact into the pure helper
  and changes a tested contract for one ternary's worth of logic.

## Not decided
- SEO metadata / `<title>` for the landing (static `public/index.html` is a different stream).
- Deep-link restore after sign-in.
