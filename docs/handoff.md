# Handoff — 2026-10-26 (night)

Cold-start order: `lead-playbook` skill → this file → `docs/tasks/step-2.md` Log tail → `git status --short`.
Older session history lives in git (`git log -- docs/handoff.md`); this file holds only what a new session needs.

## Where we are (2026-10-27 10:05)
**Production is live and current.** tanren.me (web), api.tanren.me (REST + Better Auth magic link),
mcp.tanren.me (MCP). Production = commit `e34ca1e` (= HEAD), deployed 09:50 from a clean worktree whose
root gate was green (156 files, 1948 tests). Live features: Forge design, designed magic-link email,
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

## Live at hand-off (2026-10-27 10:05; resume by SendMessage with a fresh box; ids in the scratchpad `live-agents.txt`)
- **Polish round 5** team-lead (sonnet) dispatched 10:00, hard stop ≈ 11:05: charter + team sheet in
  `docs/tasks/v3-design/team-desktop-r5.md` (R5a ∥ R5b ∥ R5c → REV-R5 → captures at 390 and 1280 → fable
  designer; badges Q1–Qn; fragment `docs/design/screens/UI-P5-rows.html`). On PASS: the Lead commits, inserts
  the fragment into the gallery source before `<footer>`, publishes gallery v12 to the same URL, then DEPLOY-5.
- EM batch 6 done 09:58 (fable, 7.5 min): reviewer "Layout proofs" (open the PNG, box order), engineer item 14
  (box order at 390 pasted in the report), ui-check Today-with-sets recipe + designer states reachable before a
  round, expo-mobile derived-writes rule (after a complete pull, under the lock). P1–P4 applied to the
  lead-playbook (commit before the owner leaves + `ssh-add -l` check, watchdog group liveness, 390 box-order
  Done-when, `In:` names the rendering component); deltas forwarded to the r5 team-lead.
- Done this morning: FIN-LAYOUT + handoff committed `e34ca1e` after the owner unlocked 1Password ("retry");
  DEPLOY-4 live and verified (Verified above). Auto-finish known limit: an offline device that never completes
  a pull never auto-closes.
## Experiment for the next step (retro 2026-10-26-v4-evening)
Wave dispatch + background deploy. Metrics that decide it: zero Lead acceptance edges > 5 min; team-lead
streams ≥ 1.3 children-active ÷ wall; polish r5 PASS ≤ 45 min wall (r5 dispatched 10:00 with three parallel
children: measure it). Lockstep spike answered: the 22:32–22:51 gaps were the Mac idle-sleeping on battery
(`docs/research/process-lockstep-gaps.md`; `caffeinate -i` at session start is playbook step 0; keep the Mac
on AC). Retro verdict: throughput high (9 streams,
3 deploys, 64 acceptances in 3 h), process quality medium (≈ 30 min lost to Lead stalls + lockstep gaps).

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

## Next actions (in order)
1. Accept polish round 5 (Live above): commit, gallery v12, DEPLOY-5 from a clean worktree, verify the
   `plan-*.js` / `feed-*.js` / `library-*.js` chunks. Accept EM batch 6 and apply its proposals.
2. Strava follow-ups in `docs/tasks/v4-strava.md` (refresh lease, planned-session name, typed 400 on
   `GET …/exports`) as one worker engineer; no owner input needed; disjoint from r5 (apps/worker only).
3. LOGO-4 + BRAND-2b when the owner picks a letter; wire the SVG mark into the AppBar / landing header.
4. Strava go-live when keys arrive (owner step 1 below) + SV-Q2.
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
- Team-lead children run concurrently only when dispatched in ONE Agent message (retro correction of EM
  batch 3's "sequential by construction"); charters say so and give each child a disjoint file set.
- Capture `Commit:` is stamped at export; `get-session` must be non-null before a capture batch; pid files
  guarded (`kill 0` killed an engineer's own stack); charter ports probed with `ps -ef | grep "port <n>"`.
- A design predicate names its writer (ADR-0018's `finishedAt` had none → Today never exported).
- Image prompts carry a colour pin per motif; size proofs use `du -ch <glob> | tail -1`.
- Gallery: never publish as a new artifact (60 v1 shots exist only in the artifact store); badges unique
  (`gallery.mjs` checks).
