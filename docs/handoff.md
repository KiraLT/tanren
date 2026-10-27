# Handoff — 2026-10-26 (night)

Cold-start order: `lead-playbook` skill → this file → `docs/tasks/step-2.md` Log tail → `git status --short`.
Older session history lives in git (`git log -- docs/handoff.md`); this file holds only what a new session needs.

## Where we are (2026-10-27 10:05)
**Production is live and current.** tanren.me (web), api.tanren.me (REST + Better Auth magic link),
mcp.tanren.me (MCP). Production = commit `4426117` (= HEAD), deployed 11:12 (DEPLOY-6) from a clean worktree
whose root gate was green (159 files, 2002 tests); D1 at migration 0005 (applied by DEPLOY-5); the `*/5`
Strava-drain cron is registered (account subdomain `tanren-me`, `workers_dev` off). Live features: Plan week
"Logged N sets · volume" line (PLAN-LOG), W1 wordmark + the T mark as app/PWA icons (plan Amendment 15), OG
image + metas, polish round 5, Forge design, designed magic-link email,
sign-in gate (ADR-0019) with the signed-out **landing page** on web (ADR-0021, five generated
illustrations), Feed tab + activity detail + `/progress` (ADR-0017), guided programs with rep-count items
(ADR-0020: 15 of 24 Core 30 moves count reps), **Finish workout** on Today (inline after the set list on
phones since FIN-LAYOUT) plus auto-finish of stale sessions after a complete pull, Settings → Integrations
with Strava in **console mode** (ADR-0018; real export waits for the owner's Strava app keys), final 力
app icon / favicon / PWA icons + traced SVG mark, desktop polish round 4, brandbook artifact v3.

## Verified today (evidence in docs/tasks/step-2.md Log)
- Root `pnpm check` green at every deploy; DEPLOY-4 worktree run 156 files / 1948 tests (09:49).
- Live chunk check 09:55 (DEPLOY-4): root `_layout-d3f87cf8….js` carries the landing (`assets/landing` ×5,
  all five webps HTTP 200, "Sign in with a magic link"); `today-2b4c0ecf….js` carries "Finish workout" and
  the FIN-LAYOUT footer margin; `plan-570b4dd8….js` carries "Up next"; `__common-….js` carries the r4
  ListRow props and `finishStaleSessions`; `/health` → `{"ok":true}`. Route chunk names are listed inside
  the `entry-*.js` script that index.html names (not `index-*.js`); two `_layout-*` chunks exist and the
  landing is in the larger one.
- Designer verdicts: mobile-A r3 PASS, mobile-B r2 PASS, landing LAND-R PASS, desktop r4 PASS (all seven
  screens 4 at 1280/900). Code reviews: REV-PL (PROG-1/2, LOGO-2, FEED-7), PROG-R (PROG-3), REV-TF (Finish
  workout), REV-3 (Strava), REV-AF r2 (auto-finish), REV-POLISH (mobile pairs) all APPROVE; fixes landed,
  REV-POLISH should-fixes queued into polish round 5.
- Gallery https://claude.ai/artifact/YD5RTPNpuPy9hmpQLhJADQ v11 (14 sections, `desktop-r4` K1–K62; source tracked at
  `docs/design/screens/tanren-screens.html`; `node docs/design/gallery.mjs --publish` prints the files map).
  Brandbook https://claude.ai/artifact/S6ngEL7NHXU1LaMECafJYa v3.

## Live at hand-off (2026-10-27 11:00; resume by SendMessage with a fresh box; ids in the scratchpad `live-agents.txt`)
- DEPLOY-5 DONE 10:55 (`MIGRATE=1 scratchpad/deploy.sh`): migration 0005 applied to production D1 (✅ in the log),
  Worker version 74509783 with `schedule: */5 * * * *` registered (no 10063), web version db23adb9; verified
  `/health` ok, `og.png` 200 + og metas in index.html, `icon-192.png` = the repo's T icon (3335 B).
- Play re-shoot done (shooter, 1 min): `UI-P5-play-*` re-captured at `7678246`; disc = outlined 56 px at 1280
  light, empty ring gone. Nit for the next polish round: at 1280 the eyebrow keeps its 28 px slot at progress 0
  (eyebrow x 148 vs title x 120); at 390 both are flush.
- Gallery v12 (sections `polish-r5` Q1–Q45 and `logo-4` T1–T7) published from the repo source
  `docs/design/screens/tanren-screens.html` (`gallery.mjs` now defaults to it, GAL-3). Brandbook artifact v5
  carries the W1 wordmark + T mark Logo group (BRAND-3; publish recipe: read the artifact, then `root`
  `docs/design/brandbook`, `file_path` = the index, other `project/*` files in `files`).
- PLAN-LOG done and reviewed (`e71da43` → `4426117`: Schema-decoded aggregate rows, `LoggedTotals` from the
  struct, fixture literal; REV-PL2 APPROVE) and live via DEPLOY-6 11:12 (Worker 2f896c11, web 6a38a0dc; "Logged"
  present in the live `__common` chunk). Plan dark captures go to the next polish round.
- MCP-ROOT done and live (DEPLOY-7 12:37, Worker 16e16920, web 54b5d055 after one transient 10013 retry):
  `https://mcp.tanren.me/` 200 help page (nosniff + CSP) naming the connector URL, root-form
  protected-resource metadata byte-identical to the `/mcp` form, `/mcp` still 401, api root still 404.
- IDENT-1 done and live (DEPLOY-8 12:55, Worker d5362f72): published client identities accepted
  (`clientIdMetadataDocumentEnabled` + `global_fetch_strictly_public`); `oauth/knownClients.ts` marks a client Known
  only when the document host is exactly claude.ai / claude.com / chatgpt.com, the path starts with `/oauth/` and the
  redirect returns to that host (loopback only for the Claude Code document) — REV-ID's round-1 blocker was the Lead's
  "host or subdomain" ruling (incident logged); consent shows "Verified app · <domain>. Only continue if you just
  started this in <Name>." or the "Unknown app" block + "Allow anyway". Live checks: AS metadata advertises
  `client_id_metadata_document_supported: true` + `none`; `/authorize` with the Claude Code identity → 200. EAS-1's
  production `NATIVE_RETURN_PREFIXES` is live too. OPEN: the claude.ai app's document URL is unconfirmed — if the
  owner's consent screen shows Unknown with "document hosted on claude.ai", widen the `/oauth/` prefix (one-line change
  in knownClients.ts + test) and redeploy.
- **Garmin + legal planning wave** (plan Amendments 18 + 19, dispatched 13:40): spike G1 probes Garmin's Personal API
  with the owner's TEST token (stored only at `scratchpad/secrets/garmin.token`, mode 600, never committed; the owner
  regenerates it after testing) → `docs/research/2026-10-27-garmin-personal-api.md`; architect Garmin → ADR-0023 +
  `docs/design/garmin.md` + `docs/tasks/v5-garmin.md` (Settings paste-token row, sealed token, cron pull into synced
  `imported_activity` / `daily_health`, feed cards; migration **0007** after STLS's 0006 is committed); architect legal →
  ADR-0024 + `docs/design/legal.md` (draft Privacy Policy + Terms with `[OWNER]` markers, `/privacy` + `/terms` public
  pages, landing/sign-in/About/consent links, `hello@tanren.me` via Cloudflare Email Routing) + `docs/tasks/v5-legal.md`.
  Engineering for both starts after the STLS W2 commit (shared files, migration order).
- **Auth v2 wave** (plan Amendments 16 + 17, dispatched 12:45): spike S1 → `docs/research/mcp-client-identities.md`
  (CIMD in workers-oauth-provider 1.2.3, the Claude/ChatGPT client ids, trust model), spike S2 →
  `docs/research/stateless-sessions.md` (Better Auth stateless options with a symmetric secret; what the OAuth
  library keeps in KV), architect (fable, 20 min) → ADR-0022 + `docs/design/auth-v2.md` + `docs/tasks/v5-auth.md`
  with IDENT-1 (enable CIMD + allowlist + untrusted warning on the current library) first if it can ship today.
  Lead's concern on record: stateless tokens cannot be revoked before expiry → short TTLs + a per-user token
  generation in D1; `BETTER_AUTH_SECRET` already exists (reuse over a new `SECRET_KEY` unless the architect objects).
- EM batch 7 done (`fe602ef`): engineer rule 9 (scratch D1 proofs, `db:reset`, no `--dry-run`), team-lead
  capture-stack ownership, ui-check per-task stack; playbook P1–P4 + P6 applied. P5 is the owner's (item 9 below).
- Done this morning (all committed): FIN-LAYOUT `e34ca1e` + DEPLOY-4; EM batch 6 (`4e74a28`); SF-1 Strava
  follow-ups reviewed (`be3261a` → `4ccea78`: refresh lease, planned-session names, optional `?limit`); polish
  round 5 PASS (`4447765`) + Player light fixes (`7678246`); LOGO-4 W1 wordmark + T mark (`499b1a9`, plan
  Amendment 15) + BRAND-2b OG image (`6633431`); WD-1 workers_dev off (`8215fb9`); workers.dev subdomain
  `tanren-me` created via the Cloudflare MCP. Auto-finish known limit: an offline device that never completes
  a pull never auto-closes.
## Experiment for the next step (retro 2026-10-26-v4-evening)
Wave dispatch + background deploy. Metrics that decide it: zero Lead acceptance edges > 5 min; team-lead
streams ≥ 1.3 children-active ÷ wall; polish r5 PASS ≤ 45 min wall (r5 dispatched 10:00 with three parallel
children: measure it). Lockstep spike answered: the 22:32–22:51 gaps were the Mac idle-sleeping on battery
(`docs/research/process-lockstep-gaps.md`; `caffeinate -i` at session start is playbook step 0; keep the Mac
on AC). Retro verdict: throughput high (9 streams,
3 deploys, 64 acceptances in 3 h), process quality medium (≈ 30 min lost to Lead stalls + lockstep gaps).

## Owner-gated (exact steps)
1. **Strava** — PARKED by the owner 2026-10-27 11:20 ("skip for now, I will create later"); production stays
   in console mode, nothing to do until keys appear. When they do (O1–O3 in `docs/design/deploy.md`): API app at strava.com/settings/api
   with callback domain `api.tanren.me`; paste `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` → the Lead runs
   `pnpm exec wrangler secret put STRAVA_CLIENT_SECRET --env production` from `apps/worker`, sets the id and
   `STRAVA_MODE: "provider"` in `wrangler.jsonc` `env.production.vars`, redeploys, then SV-Q2 (first real
   export: `start_date_local`, Weight Training, "View on Strava").
2. **Cron trigger**: done on the Lead's side 2026-10-27 (subdomain `tanren-me` created via the MCP; DEPLOY-5
   registers the `*/5` cron). Owner: nothing, unless DEPLOY-5's log still shows 10063.
3. **Wordmark**: picked (W1; the T from W1 is the mark, plan Amendment 15) and shipped (LOGO-4, BRAND-2b).
   Owner: look at gallery section `logo-4` (T1–T7: sheet, drift comparison, sign-in and landing) and say if
   the T reads well as the app icon; the brandbook artifact still shows 力 until BRAND-3.
4. **Claude connector**: add **`https://mcp.tanren.me/mcp`** (the `/mcp` path, not the bare origin — the
   origin answered 404 on 2026-10-27; MCP-ROOT gives it a help page) as a custom connector in the Claude app,
   then sign in via the magic link in the OAuth window. Checks: `/.well-known/oauth-authorization-server` 200,
   `/mcp` 401 with `www-authenticate` naming the protected-resource metadata.
5. **EAS**: done 2026-10-27 13:05 — the owner ran `pnpm dlx eas-cli@latest login` + `init` in `apps/mobile`; project id
   `71f6f700-4c89-4627-8a93-b2fdd82974a5`, owner `tanren` (app.json). EAS-1 puts it into
   `env.production.vars.NATIVE_RETURN_PREFIXES` (rides DEPLOY-8). Left: `eas update:configure` + the first EAS Update
   channel when the iPhone path starts (Expo Go 58 on the phone when the store has it).
6. **Resend**: key rotated by the owner 2026-10-27 11:20. The production Worker still holds the OLD key as the
   `RESEND_API_KEY` secret unless it was updated too → magic-link emails fail until
   `cd apps/worker && pnpm exec wrangler secret put RESEND_API_KEY --env production` (paste the new key at the
   prompt, never in chat) — owner or Lead with the owner present; then request a magic link on tanren.me once
   and confirm the email arrives.
7. **Restart Claude Code** only when the Lead says the streams are quiet (hooks snapshot at startup; the
   owner-registered `em-cadence.sh` becomes active then).
8. Later: Apple Health needs the native dev build (Apple Developer account).
9. **Permissions** — decided by the owner 2026-10-27 11:20 (`.claude/settings.json`): `Bash(wrangler:*)`,
   `Bash(pnpm:*)` and `Bash(git commit:*)` are allowed outright; `ask` holds only `rm -r*` variants; `deny` only
   the env files; `git push|reset|checkout`, `eas *` and the Cloudflare MCP `execute` are unlisted (auto-mode
   classifier). Consequence: nothing stops a subagent from deploying except the role files and briefs — keep the
   "Forbidden" line in every brief and charter, and keep deploys Lead-run from clean worktrees.

## Next actions (in order)
1. Finish MCP-ROOT (commit, DEPLOY-7, live check), then the auth v2 wave: read ADR-0022 + `docs/tasks/v5-auth.md`,
   dispatch IDENT-1 first (owner wants to connect the Claude app), then the stateless tasks in the sheet's order;
   owner step when the design lands: `wrangler secret put` for a new secret only if ADR-0022 asks for one.
2. EM batch 8 after the next ≥ 4 commits.
3. Next polish round (nits in `docs/tasks/v4-polish-briefs.md` §Queued: eyebrow 28 px slot at 1280, landing
   light-scheme colour set, eyebrow repeats the name; dark captures for the Plan logged line) — or the next
   feature the owner names; the v4 backlog is otherwise empty.
3. Strava go-live when keys arrive (owner step 1 below) + SV-Q2.
3a. Parked, owner-asked 2026-10-27 13:15: **Garmin**. Garmin reopened its Connect Developer Program on 2026-10-21 with a
   free **Personal** tier: instant key + access tokens from https://connect.garmin.com/app/settings/personalApiToken,
   own data only, pull-only Activity (JSON + .FIT), Health and Women's Health JSON; Training/Courses (push a workout to
   the watch) are business tiers only (Starter: free, apply via form, push-only, limited users). Fit for Tanren: the
   Worker pulls the owner's activities + daily health on the existing `*/5` cron with the personal token as a Worker
   secret → feed cards for runs/calories (ADR + spike on token lifetime, rate limits, history depth, which the public
   pages do not state). Alternatives noted: Apple Health bridge (native build), Strava bridge (parked keys); MyFitnessPal
   has no public API. Sources: developer.garmin.com/gc-developer-program/overview/, dcrainmaker 2026-10 revamp article.
4. Design notes parked: landing light-scheme illustration amber vs rust primary (one colour set, D1),
   eyebrow repeats the name; landing `contentH` probe is the measure (`docH` = viewport on `Page scroll`).
5. Process: forward role-file deltas to any team-lead spawned before the last EM batch in the same turn the
   EM report is accepted (r5 received batch 6's deltas after its children were briefed); charters now tell
   team-leads to re-read role files by mtime before each round.

## Deploy recipe (Lead-run; owner lifted the ban 2026-10-26, dev-system §13)
`scratchpad/deploy.sh` (recreate from this if purged): `git worktree remove --force $S/deploy-wt; git worktree
add --detach $S/deploy-wt HEAD` → `pnpm install --frozen-lockfile` → `pnpm check` (stop if red) →
`EXPO_PUBLIC_API_URL=https://api.tanren.me CI=1 pnpm -F @tanren/mobile export:web` → in `apps/worker`:
`pnpm exec wrangler deploy --env production` (cron step fails with 10063 until item 2 above; the script
still deploys) and `pnpm exec wrangler deploy -c wrangler.web.jsonc --env production` → `curl --resolve
api.tanren.me:443:104.21.69.164 https://api.tanren.me/health` and the same for tanren.me (Mac resolver
caches NXDOMAIN). Verify features on the live route chunks (`_layout-*.js`, `today-*.js`), not the entry.
Account `326ec3d6fda1261c15bf6580fd81e426`, zone `50927fc2e0c893c52ce33e169700eef3`, D1
`0cdfa785-fd69-4971-adf8-14a4acb89a01`, KV `f7ea7f892333457f991ae37413b89d97`; secrets uploaded:
`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `INTEGRATION_TOKEN_KEY`.

## Gotchas that cost time today (all in docs/retro/incidents.md; rules applied by EM batches 1–5)
- Never commit a file two live streams edit unless both pieces are in the tree; deploy only from a clean
  worktree (settings.tsx blocked a deploy for an hour).
- Team-lead children run concurrently only when dispatched in ONE Agent message (retro correction of EM
  batch 3's "sequential by construction"); charters say so and give each child a disjoint file set.
- Capture `Commit:` is stamped at export; `get-session` must be non-null before a capture batch; pid files
  guarded (`kill 0` killed an engineer's own stack); charter ports probed with `ps -ef | grep "port <n>"`.
- A design predicate names its writer (ADR-0018's `finishedAt` had none → Today never exported).
- Image prompts carry a colour pin per motif; size proofs use `du -ch <glob> | tail -1`.
- Gallery: never publish as a new artifact (60 v1 shots exist only in the artifact store); badges unique
  (`gallery.mjs` checks).
