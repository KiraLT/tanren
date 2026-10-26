# Handoff — 2026-10-26 (night)

Cold-start order: `lead-playbook` skill → this file → `docs/tasks/step-2.md` Log tail → `git status --short`.
Older session history lives in git (`git log -- docs/handoff.md`); this file holds only what a new session needs.

## Where we are (2026-10-26 23:45)
**Production is live and current.** tanren.me (web), api.tanren.me (REST + Better Auth magic link),
mcp.tanren.me (MCP). Production = commit `a049b38`, deployed 23:26 from a clean worktree whose root gate
was green (155 files, 1927 tests). Live features: Forge design, designed magic-link email, sign-in gate
(ADR-0019) with the signed-out **landing page** on web (ADR-0021, five generated illustrations), Feed tab +
activity detail + `/progress` (ADR-0017), guided programs with rep-count items (ADR-0020: 15 of 24 Core 30
moves count reps), **Finish workout** on Today, Settings → Integrations with Strava in **console mode**
(ADR-0018; real export waits for the owner's Strava app keys), final 力 app icon / favicon / PWA icons,
brandbook artifact v3. Later commits (not deployed yet): auto-finish of stale sessions (review pending),
traced SVG mark, desktop polish round 4 (in flight at the time of writing — see Live).

## Verified today (evidence in docs/tasks/step-2.md Log)
- Root `pnpm check` green at every deploy; last main-tree run 1935 tests (TODAY-FIN), mobile 929 (AUTO-FIN).
- Live chunk check: `_layout-e4cecc5b….js` on tanren.me carries `assets/landing` ×5 and the landing CTA;
  `today-….js` carries "Finish workout"; `/health` → `{"ok":true}`; index.html has the dark pre-mount style.
- Designer verdicts: mobile-A r3 PASS, mobile-B r2 PASS, landing LAND-R PASS, desktop r3 "another round"
  (r4 running). Code reviews: REV-PL (PROG-1/2, LOGO-2, FEED-7), PROG-R (PROG-3), REV-TF (Finish workout),
  REV-3 (Strava) all APPROVE; fixes landed.
- Gallery https://claude.ai/artifact/YD5RTPNpuPy9hmpQLhJADQ v10 (13 sections; source tracked at
  `docs/design/screens/tanren-screens.html`; `node docs/design/gallery.mjs --publish` prints the files map).
  Brandbook https://claude.ai/artifact/S6ngEL7NHXU1LaMECafJYa v3.

## Live at hand-off (resume by SendMessage with a fresh box; ids in the scratchpad `live-agents.txt`)
- Desktop polish r4 team-lead (charter `docs/tasks/v3-design/team-desktop-r4.md`): told to stop after one
  capture + designer review, report by 23:55. On report: commit (WIP if not PASS), insert its
  `UI-Pdesktop-r4-rows.html` fragment into the gallery source, publish v11, log scores.
- REV-AF (reviewer) on the auto-finish WIP `889cfea`: blocking question = can the empty-session soft-delete
  remove a session that has sets on the server but none locally? If yes → guard before un-WIP.
- RETRO EM (fable, effort max) writing `docs/retro/2026-10-26-v4-evening.md`: apply its P-lines to the
  Lead's files, record the experiment below, commit.
<!-- DESKTOP_R4_RESULT --> <!-- RETRO_EXPERIMENT -->

## Owner-gated (exact steps)
1. **Strava** (O1–O3 in `docs/design/deploy.md`): keep the subscription; API app at strava.com/settings/api
   with callback domain `api.tanren.me`; paste `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` → the Lead runs
   `pnpm exec wrangler secret put STRAVA_CLIENT_SECRET --env production` from `apps/worker`, sets the id and
   `STRAVA_MODE: "provider"` in `wrangler.jsonc` `env.production.vars`, redeploys, then SV-Q2 (first real
   export: `start_date_local`, Weight Training, "View on Strava").
2. **Cron trigger**: the account has no workers.dev subdomain, so `wrangler deploy` ends with error 10063
   (script deploys, cron for the Strava drain is not set). Owner: open the Workers page in the Cloudflare
   dashboard once (creates it) OR `/mcp` to re-authorise the Cloudflare MCP (token expired 23:00) so the Lead
   creates it via the API; then redeploy the Worker.
3. **Wordmark pick**: gallery section "wordmark", W1–W6 (+ sign-in mock). Lead's pick W2 lockup / W1 alone.
   On a letter → LOGO-4: `--final`-style high-quality run of the winner, transparent ink + off-white
   exports to `assets/brand/`, swap sign-in (`app/sign-in.tsx`), landing hero (`src/components/landing/
   Landing.tsx`), brandbook Logo group; BRAND-2b OG image 1200×630 from the lockup.
4. **Claude connector**: add `https://mcp.tanren.me` as a custom connector in the Claude app, sign in via
   the magic link.
5. **EAS**: `eas init` in `apps/mobile` → project id for `NATIVE_RETURN_PREFIXES` (native sign-in return)
   and EAS Update; Expo Go 58 on the iPhone when the store has it.
6. **Resend**: rotate the API key pasted in chat; confirm the domain shows verified.
7. **Restart Claude Code** only when the Lead says the streams are quiet (hooks snapshot at startup; the
   owner-registered `em-cadence.sh` becomes active then).
8. Later: Apple Health needs the native dev build (Apple Developer account).

## Next actions (in order, new session)
1. Accept whatever of the three live items did not land; un-WIP `889cfea` after REV-AF; publish gallery v11.
2. Desktop r5 charter (from r4's "left for r5" + `team-desktop.md` worklist): Today "Sets / Back Squat"
   single row, stat-row style rule, Plan "Up next", Player enrolled render, Library/Progress desktop fill,
   Strava Failed/Blocked pill baseline, feed stat tiles → `StatRow` (FEED-8).
3. LOGO-4 + BRAND-2b when the owner picks a letter; wire the SVG mark into the AppBar / landing header.
4. Strava go-live when keys arrive (step 1 above) + SV-Q2; auto-finish un-WIP; follow-ups in
   `docs/tasks/v4-strava.md` (refresh lease, planned-session name, typed 400 on `GET …/exports`).
5. Design notes parked: landing light-scheme illustration amber vs rust primary (one colour set, D1),
   eyebrow repeats the name; landing `contentH` probe is the measure (`docH` = viewport on `Page scroll`).
6. Process: EM batch 6 is due at the next ≥ 4 commits (hook); forward role-file deltas to any team-lead
   spawned before the last EM batch.

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
- Team-lead children run sequentially (harness): order charters by critical path; parallelism = several
  team-leads or a ≤ 2-task pair run by the Lead.
- Capture `Commit:` is stamped at export; `get-session` must be non-null before a capture batch; pid files
  guarded (`kill 0` killed an engineer's own stack); charter ports probed with `ps -ef | grep "port <n>"`.
- A design predicate names its writer (ADR-0018's `finishedAt` had none → Today never exported).
- Image prompts carry a colour pin per motif; size proofs use `du -ch <glob> | tail -1`.
- Gallery: never publish as a new artifact (60 v1 shots exist only in the artifact store); badges unique
  (`gallery.mjs` checks).
