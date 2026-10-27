# Production deploy runbook (owner only)

Status: accepted (Lead delegation), 2026-10-20. Every command here touches Cloudflare, Resend, EAS or
the Claude app and is run **by the owner from his shell**. Agents never run `wrangler deploy`,
`wrangler secret`, `wrangler kv|d1` against remote, `eas update`, or any DNS change (CLAUDE.md,
ADR-0008). Agents prepare the config so each step is one command. Facts tagged [V] come from the
Cloudflare docs / research 2026-10-19; **VERIFY** = check the current dashboard wording when you get there.

Environments (ADR-0008): `local` (top level of `wrangler.jsonc`) and `production` (`env.production`);
no preview. Production hostnames: `tanren.me` (web, assets Worker `tanren-web`), `api.tanren.me`
(REST + Better Auth + OAuth authorization server, Worker `tanren`), `mcp.tanren.me` (MCP resource,
same Worker `tanren`).

Run `pnpm deploy:preflight` first (add `--skip-gate` to skip `pnpm check`): a read-only checklist of
everything below with the next command for each failure; it never deploys, logs in or writes a secret.

Owner values it checks in `apps/worker/wrangler.jsonc` `env.production` (any `<owner: …>` placeholder or
local value is a ✗): D1 `database_id` (the real id from §1.3; no KV binding any more, ADR-0022); `vars.NATIVE_RETURN_PREFIXES`
= `exps://u.expo.dev/<projectId>/` (every comma-separated entry starts with `exps://u.expo.dev/` and has the
project path, §2); `vars.MCP_RESOURCE_URL` = `https://mcp.tanren.me/mcp`; `vars.EMAIL_MODE` = `provider`;
`vars.EMAIL_FROM` on `tanren.me`; `vars.ALLOWED_ORIGINS` = `https://tanren.me` and nothing else. It also lists
both secrets (§3), requires `wrangler.web.jsonc` to serve `../mobile/dist` on route `tanren.me`, and greps
`apps/mobile/dist` for `api.tanren.me` so a bundle exported without `EXPO_PUBLIC_API_URL` is a ✗ whose fix is
`EXPO_PUBLIC_API_URL=https://api.tanren.me pnpm web:export`.

## 1. One-time accounts and DNS

1. `tanren.me` is on Cloudflare DNS (plan: yes). Custom domains for Workers create the DNS records and
   certificates themselves [V custom-domains page]: no manual `A`/`CNAME` for `tanren.me`,
   `api.tanren.me`, `mcp.tanren.me`. If a record already exists for one of them, delete it first.
2. Resend (ADR-0008): create the account, add `tanren.me` as a sending domain, copy the DNS records
   Resend shows (SPF `TXT`, DKIM `TXT`/`CNAME`, optional DMARC) into Cloudflare DNS, wait for
   "verified", create an API key with send permission. Sender: `Tanren <login@tanren.me>`.
3. Resources (from `apps/worker/`):
   ```
   pnpm exec wrangler login
   pnpm exec wrangler d1 create tanren                 # prints database_id
   ```
   No KV namespace is created: the MCP OAuth server is stateless (ADR-0022) and the Worker has no
   `kv_namespaces` binding. The old `OAUTH_KV` namespace (`f7ea7f892333457f991ae37413b89d97`) only
   lingers until owner step O2 (§3a).

## 2. `wrangler.jsonc` `env.production` (agents write the block with placeholders, owner fills ids)

```jsonc
"env": {
  "production": {
    "name": "tanren",
    "routes": [
      { "pattern": "api.tanren.me", "custom_domain": true },
      { "pattern": "mcp.tanren.me", "custom_domain": true }
    ],
    "vars": {
      "ENVIRONMENT": "production",
      "BETTER_AUTH_URL": "https://api.tanren.me",
      "ALLOWED_ORIGINS": "https://tanren.me",
      "EMAIL_MODE": "provider",
      "EMAIL_FROM": "Tanren <login@tanren.me>",
      "MCP_RESOURCE_URL": "https://mcp.tanren.me/mcp"
    },
    "d1_databases": [{ "binding": "DB", "database_name": "tanren", "database_id": "<owner: wrangler d1 create>",
                       "migrations_dir": "../../packages/db/migrations" }]
  }
}
```
Owner value: `"NATIVE_RETURN_PREFIXES"` (in `apps/worker/wrangler.jsonc` `env.production.vars`, preset to
the placeholder `exps://u.expo.dev/<owner: eas projectId>/`) lists the URL prefixes a native sign-in code may
be sent to. After `eas init` (§6), replace the placeholder with your project id from `apps/mobile/app.json`
`extra.eas.projectId`: `exps://u.expo.dev/<projectId>/`. The project path is required: every EAS project
shares the host `u.expo.dev`, so a host-only value would let another project's Expo Go URL receive your
code. Check it against the `exps://` link the EAS dashboard shows for the update. Leave `tanren://` out until
universal links exist (native-auth.md §4). A wrong value makes iPhone sign-in answer 400
`NativeBeginRejected{return-to}`.
No `DEV_MCP_TOKEN`, no `BETTER_AUTH_SECRET` in vars (secrets below; `Config.ts` refuses a dev token
outside `local`). `wrangler.web.jsonc` gets `"env": { "production": { "name": "tanren-web", "routes":
[{ "pattern": "tanren.me", "custom_domain": true }] } }` (step 7 sheet D1). Placeholders make a
production deploy fail loudly until the ids are real; `wrangler dev` (top level) ignores the block.

## 3. Secrets (`apps/worker/`, once; re-run to rotate)

```
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env production   # ≥ 32 random bytes: `openssl rand -base64 32`
pnpm exec wrangler secret put RESEND_API_KEY --env production       # from Resend
```
That is the full list for step 5. There is no `SECRET_KEY` and no KV: every token key is an HKDF sub-key of
`BETTER_AUTH_SECRET` (ADR-0022 §6, `auth/Tokens.ts`). Never paste a secret into `wrangler.jsonc` or
`.dev.vars` that is committed.

**Rotating `BETTER_AUTH_SECRET` signs everyone out**: web cookies (`session_data` JWT), native app token
pairs and MCP access/refresh tokens, authorization codes, consent handles and DCR client ids are all HKDF
sub-keys of it (ADR-0022 §6). After a rotation the web app asks for the magic link again, the iPhone app
returns to sign-in, and Claude / ChatGPT clients reconnect. There are no dual keys yet (auth-v2.md §2).

## 3a. Stateless auth cutover (owner steps O1–O2, ADR-0022, `docs/tasks/v5-auth.md`)

Replaces the `workers-oauth-provider` + KV server. Order for the cutover deploy (the Lead runs the first
two): migration `0006_token_generations` (`user.appTokenGen`, `user.mcpTokenGen`, table `oauth_code_use`)
**must be applied remotely before the Worker deploy** (§4), because the new Worker reads those columns; the
Worker deploy then needs no KV binding.

- **O1** (owner, after the stateless cutover deploy): reconnect the Claude app, Claude Code and ChatGPT
  **once**. Their old grants lived in KV and are not read by the new server, so the first MCP call answers
  401 and each client restarts its OAuth flow (§5). Signed-in web sessions survive (Better Auth cookies are
  unchanged); the iPhone app stores a new token pair at its next sign-in.
- **O2** (owner, optional, after about a week with nothing broken; agents never run it):
  `pnpm exec wrangler kv namespace delete --namespace-id f7ea7f892333457f991ae37413b89d97` from
  `apps/worker/` (the `OAUTH_KV` namespace). **VERIFY** the flag spelling with `wrangler kv namespace delete --help`.

## §Strava secrets (owner steps O1–O3, `docs/tasks/v4-strava.md`; ADR-0018)

The Worker refuses to start in production without these: `Config.ts` requires `STRAVA_CLIENT_SECRET` when
`STRAVA_MODE` is `provider` and a real (non-zero) 32-byte `INTEGRATION_TOKEN_KEY`. `pnpm deploy:preflight`
checks the vars and lists the two `secret put` commands below.

**Production runs `STRAVA_MODE: "console"` until O2 is done** (no Strava app yet): console mode only logs
(`[strava:console] …`) and never calls Strava, so `STRAVA_CLIENT_ID` may stay the placeholder and
`STRAVA_CLIENT_SECRET` is not needed; the real `INTEGRATION_TOKEN_KEY` is still required. The flip after O2:
set `env.production.vars.STRAVA_MODE` to `"provider"` in `apps/worker/wrangler.jsonc`, replace
`STRAVA_CLIENT_ID` with the real Client ID, run the `secret put` commands below, then redeploy
(`pnpm exec wrangler deploy --env production`).

- **O1** Strava subscription (API Policy 3.3) and an API app at strava.com/settings/api, callback domain
  `api.tanren.me`, Single Player Mode. The subscription must stay active: a lapse makes Strava answer
  "Inactive" and the app stops working until you resubscribe (research `docs/research/2026-10-26-strava-api.md`,
  "Subscription lapse"; credentials surviving a lapse is unverified). Tanren parks the exports as `blocked`
  and retries every 12 h, so nothing is lost.
- **O2** secrets and the client id (from `apps/worker/`):
  ```
  pnpm exec wrangler secret put STRAVA_CLIENT_SECRET --env production    # Client Secret from strava.com/settings/api
  openssl rand -base64 32                                                 # generates the sealing key; copy the output
  pnpm exec wrangler secret put INTEGRATION_TOKEN_KEY --env production    # paste it; losing it makes stored Strava tokens unreadable: reconnect
  ```
  Then edit `apps/worker/wrangler.jsonc` `env.production.vars`: `STRAVA_CLIENT_ID` = the Client ID (replaces
  `<owner: strava client id>`); then set `STRAVA_MODE` to `"provider"` (it is `"console"` until now). The secrets are never `vars`; the cron
  `triggers.crons` in `env.production` is already set. After the flip nothing stale exists: console mode
  writes no rows in production (connect refuses with `not-configured`, the callback answers 400), so the
  console-mode deploy before O2 leaves no fake integration or export row to clean up.
- **O3** First real export on tanren.me (needs O1 + O2 and the deploy in §4): connect in Settings → Integrations →
  Strava, finish a session, check the activity on strava.com (SV-Q2 measures it).

## §Garmin (owner steps O1 and O3; ADR-0023, `docs/design/garmin.md`, `docs/tasks/v5-garmin.md`)

No Garmin secret exists server-side: each user pastes their own personal API key in Settings, and the Worker seals it with
the existing `INTEGRATION_TOKEN_KEY` (§Strava secrets O2). The production vars are already in `apps/worker/wrangler.jsonc`
`env.production.vars`: `GARMIN_MODE: "provider"` and `GARMIN_BASE_URL: "https://personal.connectapi.garmin.com"` (§2 / O2
reads them from there; nothing to `secret put`). Local keeps `GARMIN_MODE: "console"`; `GARMIN_CONSOLE_FAIL` is never set in
production (`Config.ts` refuses it outside console mode).

- **Migration 0007 (`0007_garmin_import`: tables `imported_activity`, `daily_health`) is applied remotely by the Lead only**, at
  the Garmin deploy and BEFORE the `wrangler deploy` in §4 (the cron and `Sync.pull` read the tables):
  `pnpm exec wrangler d1 migrations apply tanren --env production --remote` from `apps/worker/` (packages/db/migrations 0000 … 0007).
  Agents never run it.
- **O1** (owner, after the GM-Q2 test): regenerate the personal API key that was used for testing (connect.garmin.com →
  Settings → Personal API token), then connect the real one in Settings → Integrations → Garmin on tanren.me. Key lifetime is
  30, 90, 180 or 365 days, chosen at creation and not readable via API; Garmin emails a week before expiry. An expired or
  revoked key parks the integration as revoked in Settings until a new key is pasted.
- **O3** First real import on tanren.me (needs the deploy in §4 and O1): paste the key, wait for the next 5-minute cron (or
  open the app and sync), check that a recent activity's start time and today's calories match Garmin Connect.
- **CPU check (Lead, one cron tick after O1; GM-F1)**: Workers Free gives a cron invocation 10 ms CPU. Run
  `cd apps/worker && pnpm exec wrangler tail --env production --format json | jq 'select(.scriptName and .event.cron) | {outcome, cpu: .cpuTime, wall: .wallTime, cron: .event.cron}'`
  across one `*/5` tick: pass = `outcome == "ok"` and no `"exceededCpu"`; `cpu` should read well under 10 during a back-fill
  (1 user, ≤ 2 pages of 50, ≤ 7 dailies per run; a 30-day back-fill takes 3–4 ticks). Field names: `outcome`, `scriptName`,
  `event.cron` are what wrangler 4.151.2's tail printer reads; `cpuTime` / `wallTime` are `TraceItem` fields in
  `@cloudflare/workers-types` (wrangler passes the JSON through) — if they print `null`, `outcome` alone is the verdict.
  GM-F2 expectation: an idle tick (`attempted=0`, `users=0`) measured 28–30 ms before GM-F2 (bac78729); after it the cron
  builds a slim layer once per isolate (`makeScheduled(scheduledLayer(env))`), so warm idle ticks should read ≈ 1–3 ms; a
  cold-isolate tick still pays module evaluation of the whole bundle (not addressed by GM-F2) and may stay well above 10.

## 4. Deploy

```
# API + MCP Worker
cd apps/worker
pnpm exec wrangler d1 migrations apply tanren --env production --remote     # packages/db/migrations 0000 … 0006; 0006 BEFORE the deploy below (§3a)
pnpm exec wrangler deploy --env production                                   # also registers the */5 cron
curl -i https://api.tanren.me/health                                          # 200
curl -i -X POST https://mcp.tanren.me/mcp -H 'content-type: application/json' -d '{}'
#   → 401 with WWW-Authenticate: Bearer realm="OAuth", resource_metadata="…/.well-known/oauth-protected-resource/mcp"
curl -s https://api.tanren.me/.well-known/oauth-authorization-server | jq .issuer

# Web (assets Worker): export from the repo root, deploy from apps/worker
# (the wrangler binary is apps/worker/node_modules/.bin/wrangler: the isolated linker has no ../../node_modules/.bin/wrangler)
EXPO_PUBLIC_API_URL=https://api.tanren.me pnpm -F @tanren/mobile exec expo export --platform web
cd apps/worker
pnpm exec wrangler deploy -c wrangler.web.jsonc --env production
open https://tanren.me                       # sign in with your email → magic link arrives via Resend
```
First sign-in creates your user; there is no seed in production (the seed is local-only). Do **not**
run `pnpm db:reset` or `scripts/seed.ts` against `--remote`.

workers.dev: `triggers.crons` needs the account's workers.dev subdomain (before it existed the deploy ended with
Cloudflare error 10063). The subdomain exists since 2026-10-27, so the deploy registers the cron. Both Workers stay off it
by config: `workers_dev: false` and `preview_urls: false` in `wrangler.jsonc` and `wrangler.web.jsonc` (top level and
`env.production`); the API answers on api.tanren.me and mcp.tanren.me only, the web Worker on tanren.me only.

Rollback: `pnpm exec wrangler rollback --env production` (Workers keeps previous versions [V]); D1
migrations are forward-only, so a schema rollback is a new migration.

**Deploy order for breaking changes.** Pending migrations apply to the live D1 *before* the Worker
upload (`MIGRATE=1 scratchpad/deploy.sh`, and the manual order above), so for a few seconds — and for
as long as a rollback keeps the old version — the previously deployed Worker serves against the new
schema. Every migration must therefore be servable by the previous Worker: add columns nullable or
with a default, add tables freely, never rename or drop in the same release that stops using the old
name. A rename or drop is split across releases: expand (migration adds the new shape, Worker writes
both / reads the new) → migrate (backfill) → deploy (Worker uses only the new shape) → contract (a
later migration drops the old column or table). Token or seal format changes follow the same rule:
the new Worker reads both formats until no old value can exist.

## 5. Claude app custom connector (after §4 is green)

Claude app → Settings → Connectors → **Add custom connector** → name `Tanren`, URL
`https://mcp.tanren.me/mcp`, leave OAuth client id / secret empty (the connector registers itself
via DCR; **VERIFY** the dialog still offers that) → Connect → browser: `api.tanren.me/authorize` login
page → enter your email → click the magic link → consent page → Approve → back in the Claude app.
Then in a chat: "use Tanren get_overview for 30d" and "write next week's plan" (`write_plan_week`).
If the connector only shows four tools, the grant lacks `tanren:write`: remove the connector and
redo the flow with both scopes ticked. Revoking: Claude app → connector → Disconnect removes the client's
copy only; the server keeps no grants (stateless, ADR-0022), so the tokens already issued stay valid until
they expire (access 15 min, refresh 30 days). To kill them all at once use Settings → Account → Disconnect AI
clients in the app (`POST /api/token/revoke-mcp`, bumps `user.mcpTokenGen`): every MCP token and code of the
user then fails at its next refresh or call, and each client must reconnect.

Claude Code (your laptop) against production: `claude mcp add --transport http tanren https://mcp.tanren.me/mcp`
and follow the same browser flow. Local development keeps the dev bearer token (local-dev.md §5).

## 6. EAS Update for Expo Go (iPhone)

Prerequisites once: `pnpm -F @tanren/mobile exec eas login`, `eas init` (links the project id into
`app.json`), `eas update:configure` (adds `expo-updates` config, `runtimeVersion` policy). Then:
```
cd apps/mobile
EXPO_PUBLIC_API_URL=https://api.tanren.me pnpm exec eas update --branch production --message "step 7"
```
Open the update's QR / `exp://` link from the EAS dashboard in Expo Go (Expo Go loads EAS Updates for
the matching SDK 58 runtime; ADR-0009 notes a physical iPhone under the isolated linker is
unverified → the first `eas update` is also that verification). The app's API base URL is inlined at
export time, so every production update must carry `EXPO_PUBLIC_API_URL`. **VERIFY** the exact
`eas update` flags against `expo:eas-update` when you run it; agents do not run EAS.

## 7. Checklist order

DNS/Resend verified → `d1 create` → id into `env.production` → secrets (incl. §Strava secrets) →
migrations (0006 first, §3a) → `wrangler deploy` (API) → web export + deploy → sign in on tanren.me → Claude app
connector → EAS Update. Each step's check command is above; stop at the first failure and paste its
output to the Lead (nothing in this runbook is retried by an agent).
