# ADR-0024 — Legal pages and the business surface of tanren.me

Status: accepted (Lead decision under plan Amendment 3 and Amendment 18, 2026-10-27; owner reviews asynchronously)

## Context
tanren.me is now a public product: strangers can sign in, connect Strava, and (Amendment 19) Garmin; the
MCP server is registered as a connector in the Claude app. The owner (2026-10-27 13:30): "think how to
make https://tanren.me like legit business … include privacy policy and terms and conditions pages", and
at 13:45: no placeholders — the operator is "Tanren", run by a private individual in Lithuania, contact
`hello@tanren.me`, dated "Last updated 27 October 2026". Today nothing public states who runs the service,
what data it keeps or how to delete an account; the gate (`gateFor`, `apps/mobile/src/services/authGate.ts`)
allows a device without an account to see only `/sign-in` and `/auth/*`; there is no account-deletion
path (grep `-i delete` in `apps/worker/src/auth` and `apps/mobile/src/services/Account.ts`: only
`forgetOwner`, a local `sync_state` row).

## Decision
1. **Two public routes in the app bundle**: `app/privacy.tsx` and `app/terms.tsx`, rendered by one
   `LegalPage` component from typed copy (`legalCopy.ts`, sections with ids), on web AND native. They are
   added to the gate's public list (`isPublicRoute` next to `isSignInRoute`; `gateFor` returns `"allow"`),
   so a signed-out visitor reaches them directly and from the landing. No CMS, no markdown renderer, no new
   dependency; the texts are code reviewed like code.
2. **The texts** (`docs/design/legal.md` §1–§2) are the source; every "we store / we send" sentence is
   backed by a grep listed in `legal.md` §6 and re-checked by LEGAL-R. Honest voice: a free personal
   product run by one person, not medical advice, no SLA. Facts that cannot be pinned from the repo are
   written as true general statements, never as placeholders; the sheet carries the `VERIFY`.
3. **Placement**: landing footer (operator, contact, Privacy, Terms), sign-in agreement line, Settings → About
   rows, magic-link email footer, OAuth consent footer (hand-off to STLS-4, which owns `oauth/pages.ts`).
4. **Account deletion** becomes a product feature (GDPR Art. 17; Apple guideline 5.1.1(v) for the later
   store build): `POST /api/account/delete` erases every row of the user in D1 and the auth rows, the app
   wipes the local store and returns to sign-in (LEGAL-2). Until it ships the policy says deletion is by
   email to `hello@tanren.me`; LEGAL-2 flips one sentence.
5. **Timing of the text against the code** (LEGAL-R r1 findings 1 and 3): the Garmin clauses ("if you connect
   Garmin, the pasted token is stored encrypted …") are conditional statements kept in the text ahead of the
   integration shipping the same day (ADR-0023, GM-2…GM-6); the legal pages' web deploy ships together with
   or after the auth cut-over (ADR-0022), so the "disconnect AI clients" and "revoke" sentences are backed by
   code at deploy time. LEGAL-Q checks both before the deploy.
6. **Business surface extras**: `hello@tanren.me` via Cloudflare Email Routing (Lead configures, owner
   verifies the destination mailbox), `robots.txt`, `/.well-known/security.txt`, a "© 2026 Tanren · Vilnius,
   Lithuania" footer line. Not done: imprint page (not required of a private individual in Lithuania; the
   footer and policy carry the operator), status page (no SLA; the Terms say so), cookie banner (only a
   strictly necessary session cookie; ePrivacy exempts it, the policy says so), sitemap (one public page).

## Consequences
- `authGate.test.ts` gains assertions for `/privacy` and `/terms` → `"allow"` with no account and no sets.
- The texts age: `LAST_UPDATED` is one constant; any data-handling change (Garmin import, token storage)
  edits `legalCopy.ts` in the same task — added to the route-inventory rule in `apps/mobile/CLAUDE.md`.
- Native shows the pages in-app; nothing opens a browser for them.
- Deletion needs a cross-table erasure in `packages/db` (21 `userId` columns across 8 schema files).

## Alternatives considered
- Static HTML in `apps/mobile/public/` served by the assets Worker: reachable signed out without touching
  the gate, but a second styling system outside Forge, no dark scheme, not reachable on native. Rejected.
- Better Auth's `deleteUser` feature: would delete only auth rows; the training tables still need our
  erasure, and its callback shape is not in `docs/research/`. Our own endpoint over one `AccountErasure`
  repository is smaller and fully typed. (`VERIFY` noted in the sheet in case the engineer prefers it.)
- A hosted policy generator (Termly, iubenda): generic text, tracking scripts, a third party in the chain
  of a no-tracking product. Rejected.
