# ADR-0008: Local development and environments

Date: 2026-10-20 · Status: **accepted** (Lead decision under owner delegation, 2026-10-20; plan Amendment 3) · Author: architect

## Context

`docs/design/local-dev.md` §8 left three decisions open: where local secrets live, whether a
preview environment exists, and which email provider sends production magic links. Steps 2–3
already run on committed dummy `vars` with the startup guard in `apps/worker/src/Config.ts`
(`EMAIL_MODE: "console"` is refused unless `ENVIRONMENT` is `"local"`), and
`apps/worker/src/auth/EmailSender.ts` has `layerConsole`, `layerCapture` and a `layerProvider`
that fails with "no email provider configured".

Email provider check (2026-10-20, `cloudflare:cloudflare-email-service` skill plus the Cloudflare
docs MCP, pages `/email-service/`, `/email-service/platform/pricing/`, `/email-service/platform/limits/`,
changelog 2026-04-16): the Lead's rule was Cloudflare Email Service **if** it is (a) generally
available, (b) usable on the free Workers plan and (c) able to send from `tanren.me`.
(a) **fails**: Email Sending is labelled "Beta" (public beta since 2026-04-16). (b) **fails**:
pricing table says "Outbound emails (Email Sending): Not available" on Workers Free; arbitrary
recipients need Workers Paid (3,000/month included); only sends to pre-verified destination
addresses are free. (c) passes: any domain on Cloudflare DNS can be onboarded from the dashboard.

## Decision

1. **Local secrets (§8.1).** Dummy values live as `vars` in the committed `apps/worker/wrangler.jsonc`
   (top level = local). The guard in `src/Config.ts` refuses `EMAIL_MODE: "console"` and a set
   `DEV_MCP_TOKEN` outside `ENVIRONMENT: "local"`. `.dev.vars` is an owner-only override; agents
   never read `.dev.vars*`.
2. **Preview environment (§8.2).** None now. Local is the dev environment; production is the only
   remote one. No `env.preview`, no `tanren-preview` D1. Revisit at step 5 only if the Claude app
   connector cannot be tested against production safely.
3. **Production magic-link email (§8.3): Resend** (HTTP API, free tier), because checks (a) and
   (b) failed. Wiring stays as local-dev.md describes: `EmailSender` is a `Context.Service`;
   `EMAIL_MODE` selects `layerConsole` (`"console"`, the default locally) or the provider layer
   (`"provider"`); tests use `layerCapture`. The provider layer calls Resend over `effect/http`'s
   `HttpClient` (no SDK dependency) with the secret `RESEND_API_KEY` (listed under
   `env.production` `secrets.required`) and the var `EMAIL_FROM` (e.g. `login@tanren.me`).
   `VERIFY:` request shape (`POST https://api.resend.com/emails`, bearer auth, JSON
   `{ from, to, subject, html, text }`) and current free-tier limits against Resend's docs via
   context7 before implementing; the ADR does not fix them.
   **Owner actions:** create the Resend account, add `tanren.me` as a sending domain and put the
   DNS records Resend gives into Cloudflare DNS, create an API key, run
   `wrangler secret put RESEND_API_KEY --env production`, perform the first real send.

## Consequences

- A fresh clone needs no secrets; agents never touch remote resources (local-dev.md §2).
- One external account (Resend). Swapping provider later is one layer; `EMAIL_MODE` values stay.
- Revisit Cloudflare Email Service when Email Sending is GA or the owner moves to Workers Paid.
  Note the loophole: sends to verified destination addresses are free on Workers Free, which
  would serve a single-user app, but it ties login to a pre-verified address list and a beta
  product; not taken now.
- The provider layer is unit-tested with a stubbed `HttpClient`; no agent sends real email.
- Off-LAN phone testing has no preview; `expo start --tunnel` plus a local API tunnel is the
  owner's workaround (local-dev.md §6, unverified).

## Alternatives considered

- Cloudflare Email Service: failed checks (a) and (b) above; first choice when they pass.
- SMTP from the Worker: no plain SMTP from Workers without sockets and a relay; more parts.
- Postmark / SendGrid / Mailgun: equivalent HTTP APIs; Resend chosen for the smallest API surface
  and a free tier. `VERIFY:` free-tier limits at implementation time.
- No email, dev bearer token only: cannot sign the owner into the Claude app connector (step 5).
- Preview environment now: a second real D1 and deploy path for a single-user app; cost without a
  current need.

Not decided here: production `ALLOWED_ORIGINS` and routes (step 7); the MCP dev-token path (step 4).
