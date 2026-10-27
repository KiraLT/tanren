# v5-legal — paste-ready briefs (sheet: `docs/tasks/v5-legal.md`; design: `docs/design/legal.md`)

## LEGAL-1 — Privacy + Terms pages, gate exception, footer/sign-in/About links (engineer / sonnet)
Time box: 20 min. Skills: `expo-mobile`. Permissions: edit only the files below; no `git`, no `wrangler`, no `eas`, no `.env*`.
Files (exclusive): `apps/mobile/app/{privacy,terms}.tsx`, `apps/mobile/src/components/legal/{LegalPage.tsx,legalCopy.ts,legalCopy.test.ts}`,
`apps/mobile/src/services/{authGate.ts,authGate.test.ts}`, `apps/mobile/src/components/landing/{Landing.tsx,landingCopy.ts,landingCopy.test.ts}`,
`apps/mobile/app/sign-in.tsx`, `apps/mobile/src/components/settings/AboutSection.tsx`, `apps/mobile/CLAUDE.md` (Layout inventory), `expo-types.d.ts` if regenerated.
Do NOT touch `settingsCopy.ts`, `AccountSection.tsx`, `Account.ts` (STLS-5 owns them).
1. `legalCopy.ts`: `LegalDoc`/`LegalSection` shape of design §3; `PRIVACY`, `TERMS` with the §1/§2 texts VERBATIM (section ids as given),
   `LAST_UPDATED`, `CONTACT_EMAIL`, `PRIVACY_DELETION_INTERIM` (use the interim sentence as §1.7's first paragraph until LEGAL-2),
   `SIGN_IN_AGREEMENT`, About row titles. Test per §3 (ids unique, ≥ 9 sections, no `[`, email present, `updated === LAST_UPDATED`).
2. `LegalPage.tsx` per §3 table: `Page scroll` + `AppBar` (back → `router.back()` or `/today`), `title` + caption date, sections with
   `title2` headings carrying a DOM id (VERIFY-2), body paragraphs, bullet rows, caption footer with mailto + link to the other doc.
   `Head` sets "Privacy · Tanren" / "Terms · Tanren" (VERIFY-1). Routes `app/privacy.tsx`, `app/terms.tsx` render it.
3. `authGate.ts`: `isPublicRoute` (`/privacy`, `/terms`) → `gateFor` `"allow"`; `authGate.test.ts`: both routes `"allow"` with `none`/0 sets,
   `/privacyx` stays `"sign-in"`.
4. Landing footer rows (§4 row 1), sign-in agreement caption under the Send button (§4 row 2), About rows (§4 row 3: icons `user` + `book`).
5. `apps/mobile/CLAUDE.md` Layout: add `privacy.tsx, terms.tsx` + `src/components/legal/` lines.
Done: `pnpm check` green; `ui-check` on web :8081 signed out: `/privacy` renders the page (not the landing), `/terms` too, landing footer links
navigate, sign-in shows the agreement line; report answers VERIFY-1/2 and the 390/1280 widths you measured (body ≤ 536 at 1280).

## LEGAL-4 — Email footer + robots.txt + security.txt (engineer / sonnet)
Time box: 10 min. Skills: `cloudflare-workers`. Permissions: edit only the files below; no `git`/`wrangler`/`eas`/`.env*`.
Files: `apps/worker/src/auth/{magicLinkEmail.ts,magicLinkEmail.test.ts}`, `apps/mobile/public/robots.txt`, `apps/mobile/public/.well-known/security.txt`.
1. `magicLinkEmail.ts`: second footer line "Tanren · tanren.me/privacy · tanren.me/terms · hello@tanren.me" in `text` and the HTML footer cell
   (same `MUTED` style, `<br>` between lines); extend the "shows the footer" test to assert the new line in both.
2. `robots.txt`: `User-agent: *` / `Allow: /`. `security.txt` per design §4 "static" row (Expires 2027-10-27).
Done: `pnpm check` green; `pnpm --filter mobile exec expo export --platform web` (or the root web export script) → `ls apps/mobile/dist/robots.txt
apps/mobile/dist/.well-known/security.txt` both present (VERIFY-4; if `.well-known` is dropped, report it — the Lead adds an assets rule).

## LEGAL-3 — hello@tanren.me (Lead, Cloudflare API; owner O1)
Time box: 10 min. Zone `50927fc2e0c893c52ce33e169700eef3`. Enable Email Routing on the zone (adds MX + SPF TXT records — check nothing else
sends from tanren.me except Resend's existing records; keep both SPF includes in ONE TXT), create the destination address (owner's mailbox) →
owner clicks the verification mail (O1) → routing rule `hello@tanren.me` → destination. Log: records added, rule id, verification time.

## LEGAL-2 — Account deletion (engineer / opus) — after STLS-3 is merged
Time box: 20 min. Skills: `effect-conventions`, `cloudflare-workers`, `expo-mobile`. Permissions: files below only; no `git`/`wrangler`/`eas`/`.env*`.
Files: `packages/shared/src/{account.ts,index.ts}`, `packages/db/src/repositories/{AccountErasure.ts,AccountErasure.test.ts,index.ts}`,
`apps/worker/src/api/{AccountApi.ts,AccountHandlers.ts,AccountHandlers.test.ts,Api.ts,Handlers.ts}`, `apps/mobile/src/services/{AccountErasure.ts,
AccountErasure.test.ts}`, `apps/mobile/src/components/settings/{DataSection.tsx,dataCopy.ts}`, `apps/mobile/src/components/legal/legalCopy.ts` (§1.7 only).
1. Shared: `AccountDeleted = Schema.Struct({ deleted: Schema.Literal(true) })`.
2. DB: `AccountErasure.deleteUser(userId)` — one D1 batch deleting rows by `userId` in every table (`grep -n "userId" packages/db/src/schema/*.ts`,
   21 columns / 8 files; list them in the test), then `session`, `verification` (by the user's email), `user`. Test against the workerd D1 harness
   (`apps/worker/src/testing/workerdSetup.ts` pattern): seed two users, delete one, the other's counts unchanged, all of the first's zero.
3. Worker: `POST /api/account/delete` in `AccountApi.ts`, authenticated by the existing `Authentication` middleware (pattern `IntegrationsApi.ts`),
   `Cache-Control: no-store`; 401 unauthenticated. Register in `Api.ts` + `Handlers.ts`.
4. Mobile: `AccountErasure.ts` service: call the endpoint (pattern: `Account.ts` HTTP client, do not edit it), then wipe the local store
   (every table + `sync_state`, reuse `LocalStore` reset if it exists: `grep -n "reset\|wipe\|DELETE FROM" apps/mobile/src/services/LocalStore.ts`),
   then `router.replace("/sign-in")`. `DataSection.tsx`: `ListRow tone="danger" icon="trash" title="Delete account"` → inline `Banner tone="danger"`
   "This removes your account and every record. There is no undo." with `Button variant="destructive"` "Delete everything" + `text` "Cancel"
   (no `Alert.alert`: it is a no-op on web). Copy in `dataCopy.ts`.
5. `legalCopy.ts` §1.7: replace the interim sentence with the final one ("Settings → Data → Delete account …"); remove `PRIVACY_DELETION_INTERIM`.
Done: `pnpm check` green; `ui-check`: sign in on web :8790, Settings → Data → Delete account → confirm → lands on sign-in, D1 `user` row gone
(`wrangler d1 execute … --local "select count(*) from user"` via the existing local-dev script), second sign-in creates a fresh account.

## LEGAL-R — Review (reviewer / opus), round 1 after LEGAL-1 + LEGAL-4, round 2 (10 min) after LEGAL-2
Time box: 20 min. Read-only. (a) Diff `legalCopy.ts` against design §1–§2 word for word; `grep -n "\[" legalCopy.ts` empty. (b) Re-run every §6
grep; any claim without a hit is a blocker. (c) GDPR Art. 13 checklist: identity+contact, purposes+basis, recipients, transfers, retention,
rights, complaint authority — each maps to a section id. (d) Gate tests present; `/privacyx` not public. (e) Round 2: erasure covers all 21
`userId` columns, batch is one D1 transaction, endpoint 401 path tested, no token/email logging (`grep -rn "logInfo\|logError" apps/worker/src/api/Account*`).

## LEGAL-D — Designer check (designer / sonnet)
Time box: 15 min. Capture `/privacy`, `/terms`, landing (footer visible), `/sign-in` at 390 and 1280, light + dark (8 shots) with the
`ui-check` flow; publish to the review gallery (memory: tanren-review-gallery). Measure: body column 536 ± 4 at 1280, headings 28-line,
paragraph gap 12, no horizontal scroll at 390, footer rows fit one line each at 390. Verdict per screen; blockers back to LEGAL-1 (≤ 1 round).

## LEGAL-Q — Live check (qa / sonnet) after the Lead's web deploy
Time box: 10 min. `curl -sI https://tanren.me/privacy | head -1` 200 (SPA fallback serves index; the page renders in a signed-out browser),
`curl -s https://tanren.me/robots.txt`, `curl -s https://tanren.me/.well-known/security.txt` → bodies as designed; `agent-browser` signed out:
`/terms` renders the Terms (title "Terms · Tanren"), landing footer → `/privacy`; Lead sends one mail to hello@tanren.me, owner confirms.
