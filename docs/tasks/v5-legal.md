# v5 — Legal pages and business surface (plan Amendment 18)
Source: owner 2026-10-27 13:30 + 13:45 (no placeholders) · Status: planned · Written: 2026-10-27 13:12 · Baseline: 0300cd6 + STLS in flight
Design: `docs/design/legal.md` (normative: §1–§2 texts verbatim, §3 page, §4 placement, §6 fact register) · ADR-0024 (accepted, Lead delegation)

## Decisions (ADR-0024)
Public in-app routes `/privacy` + `/terms` via a gate exception; typed copy in `legalCopy.ts`; deletion endpoint + Settings → Data row;
`hello@tanren.me` by Email Routing; `robots.txt` + `security.txt`; no imprint, status page, cookie banner or sitemap (design §5).
Forward refs (grep `-i "legal\|privacy\|terms\|hello@"` in `docs/handoff.md`, `docs/retro/incidents.md`, 13:05): handoff.md:63-69 (this wave) only.

## Owner-gated
- O1 Email Routing: DONE — Cloudflare verified the destination at creation (owner account address); nothing to click.

## Tasks
| id | title | role / model | depends | files (exclusive) | box | status |
| --- | --- | --- | --- | --- | --- | --- |
| LEGAL-1 | `/privacy` + `/terms` pages, `legalCopy.ts`, gate exception, landing footer + sign-in line + About rows | engineer / sonnet | — | `apps/mobile/app/{privacy,terms}.tsx`, `apps/mobile/src/components/legal/{LegalPage.tsx,legalCopy.ts,legalCopy.test.ts}`, `apps/mobile/src/services/{authGate.ts,authGate.test.ts}`, `apps/mobile/src/components/landing/{Landing.tsx,landingCopy.ts,landingCopy.test.ts}`, `apps/mobile/app/sign-in.tsx`, `apps/mobile/src/components/settings/AboutSection.tsx`, `apps/mobile/CLAUDE.md` (Layout inventory lines), `apps/mobile/expo-types.d.ts` if typed routes regenerate | 20 | todo |
| LEGAL-4 | Magic-link email footer line + `robots.txt` + `/.well-known/security.txt` | engineer / sonnet | — | `apps/worker/src/auth/{magicLinkEmail.ts,magicLinkEmail.test.ts}`, `apps/mobile/public/robots.txt`, `apps/mobile/public/.well-known/security.txt` | 10 | todo |
| LEGAL-3 | `hello@tanren.me` via Cloudflare Email Routing (zone `50927fc2e0c893c52ce33e169700eef3`) | Lead (Cloudflare MCP/API) + owner O1 | — | Log only | 10 | done 14:08 (Lead via API): routing enabled, MX route1-3 added, destination verified at creation, rule 281deedbf37341608e95c2c4b6091328 |
| LEGAL-2 | `POST /api/account/delete` (erase every user row + auth rows) + Settings → Data "Delete account" two-step row + local wipe; flip `PRIVACY` §1.7 to the final sentence | engineer / opus | LEGAL-1 (copy), STLS-3 merged (`Authentication.ts` bearer path stable) | `packages/db/src/repositories/{AccountErasure.ts,AccountErasure.test.ts,index.ts}`, `apps/worker/src/api/{AccountApi.ts,AccountHandlers.ts,AccountHandlers.test.ts,Api.ts}` (+ `Handlers.ts` registration line), `apps/mobile/src/services/{AccountErasure.ts,AccountErasure.test.ts}`, `apps/mobile/src/components/settings/{DataSection.tsx,dataCopy.ts}`, `apps/mobile/src/components/legal/legalCopy.ts` (§1.7 only), `packages/shared/src/{account.ts,index.ts}` | 20 | todo |
| LEGAL-R | Review: every §6 fact re-grepped against the code at review time, GDPR Art. 13 checklist (identity, purposes+basis, recipients, transfers, retention, rights, complaint, source), no `[` in texts, Effect rules on LEGAL-2 | reviewer / opus | LEGAL-1, LEGAL-4 (round 1); LEGAL-2 (round 2, 10 min) | read-only | 20 | todo |
| LEGAL-D | Designer check: `/privacy`, `/terms`, landing footer, sign-in at 390 + 1280, light + dark (8 captures) to the review gallery; measure body column 536 at 1280, no h-scroll at 390 | designer / sonnet | LEGAL-1 | Log + gallery | 15 | todo |
| LEGAL-Q | Deploy web (Lead) → live: `curl -sI https://tanren.me/privacy` 200, `/robots.txt`, `/.well-known/security.txt` 200 + body; signed-out browser reaches `/terms` directly; send a mail to hello@tanren.me (Lead) and the owner confirms receipt | qa / sonnet | LEGAL-R clean, LEGAL-3 | Log only | 10 | todo |

Parallel groups (≤ 3): {LEGAL-1, LEGAL-4, LEGAL-3} → {LEGAL-R r1, LEGAL-D} → LEGAL-2 (after STLS-3 lands) → LEGAL-R r2 → LEGAL-Q.
Case check: `ls apps/mobile/src/components/legal apps/mobile/app | tr A-Z a-z | sort | uniq -d` prints nothing (`LegalPage.tsx` vs `legalCopy.ts` differ beyond case).

## Frozen contracts
- Design §1–§2 texts verbatim (LEGAL-R diffs `legalCopy.ts` against them); §3 `LegalDoc`/`LegalSection` shape and the section ids.
- `isPublicRoute(route)` in `authGate.ts`: exactly `/privacy` and `/terms`; `gateFor` → `"allow"` for them regardless of account/sets.
- `POST /api/account/delete`, session-bound (cookie or bearer through the existing `Authentication` middleware), body `{}`,
  200 `{ deleted: true }` (`AccountDeleted` schema in `packages/shared/src/account.ts`), 401 otherwise. Erases rows of `userId`
  in every table (`grep -n "userId" packages/db/src/schema/*.ts` → 21 columns, 8 files) then `session`, `verification` (by
  email), `user`; one D1 batch.
- Consent-page footer: STLS-4 (or its follow-up) adds "Privacy · Terms" links to `https://tanren.me/privacy|terms` under the
  buttons in `apps/worker/src/oauth/pages.ts`/`consent.ts` — hand-off, not a task here.

## Assumes (cited)
- Gate: `gateFor` returns `"allow"` only for `Option.isSome(account) || localSets > 0 || isSignInRoute(route)`
  (`grep -n "allow" apps/mobile/src/services/authGate.ts`); `_layout.tsx` shows the Stack whenever gate is `"allow"` (ADR-0021).
- No deletion exists: `grep -rin "delete" apps/worker/src/auth apps/mobile/src/services/Account.ts` → only `forgetOwner`
  (`DELETE FROM "sync_state"`). ADR-0024 Context.
- `settingsCopy.ts`, `AccountSection.tsx`, `Account.ts` are STLS-5's (v5-auth.md task table) → legal copy lives in `legalCopy.ts`,
  the delete row in `DataSection.tsx` + new `dataCopy.ts`, the client call in a new `AccountErasure.ts`.
- `apps/worker/src/app.ts` is STLS-3's (mount only) → LEGAL-2 registers through `api/Api.ts` + `Handlers.ts`
  (`IntegrationsApi.ts` is the pattern: `grep -n "IntegrationsApi" apps/worker/src/api/Api.ts apps/worker/src/api/Handlers.ts`).
- `public/` files reach `dist/` on `expo export` (`apps/mobile/CLAUDE.md` Layout: "public/_headers … copied into dist/").
- Email footer string: `grep -n "footer" apps/worker/src/auth/magicLinkEmail.ts` (one `const footer` at ~line 48, rendered in text + HTML).
- `AboutSection.tsx` has an "About" `SettingsSection` with one `ListRow` (`cat apps/mobile/src/components/settings/AboutSection.tsx`).

## VERIFY (engineer, against installed types; answers go in the report)
1. `expo-router/head` `Head` exists and sets `document.title` on web with `web.output: "single"`; else `Stack.Screen options.title`.
2. RN `View` `id` prop renders a DOM id on web (else `nativeID`).
3. (resolved 13:12) icons `user` + `book` exist in `iconPaths.ts`; `trash` exists for LEGAL-2; `RowTone` = default | danger; `BannerTone` has danger.
4. `expo export` copies dot-directories (`public/.well-known/`) into `dist/` — check `ls apps/mobile/dist/.well-known` after export.
5. `magicLink.expiresIn: 5` unit (seconds or minutes) — the text stays "within minutes"; if seconds, flag to the Lead (5 s is a bug).
6. (Lead) D1 `tanren` location in the dashboard → optional "in Western Europe" in §1.4 later.

## Log
- 13:12 architect: ADR-0024, `docs/design/legal.md`, this sheet. Briefs in `docs/tasks/v5-legal-briefs.md`.

## LEGAL-DV — designer verdict (architect as Forge designer, 13:36–13:41)

Shots G1–G9 in `docs/design/screens/UI-LEGAL-*.{png,json}`; gallery `<section id="legal">` appended to
`docs/design/screens/tanren-screens.html` (9 figures). Tokens cited from `ui/colors.ts`, `ui/tokens.ts`.

| shot | verdict | measured fact |
| --- | --- | --- |
| G1 privacy 390 light | PASS | bg `#FFFFFF`; title 28/30/800 ×2 (AppBar "Tanren" + one body title, LEGAL-R r2 frame); 10 `title2` 22/28, 16 body 17/22; heading→block 8 = `rhythm.labelToGroup`, block→block 12 = `space.md`; column 358 |
| G2 privacy 390 dark | PASS | bg `#0F1113`, same counts as G1; links `#FFB020`; Back 44×44 |
| G3 privacy 1280 light | PASS | body column x 372 → 908 = 536 px ≈ 63 ch at 17 px (45–75 ch band); AppBar spans 1216, 0 nav links |
| G4 privacy 1280 dark | PASS | identical boxes to G3 (`contentH` 2384 both); hairline under the AppBar visible on `#0F1113` |
| G5 terms 390 light | PASS | 11 sections 22/28, 11 body blocks, `contentH` 2040, no horizontal scroll (`docH` 1600 viewport) |
| G6 terms 1280 dark | PASS | same 536 column, first section at y 167 = AppBar 60 + 16 + title 30 + 4 + 18 + 24 |
| G7 landing footer 390 | FIX (item 2) | Privacy 61×44, Terms 54×44 at top 1540, 4 px under the 18 px operator row (visual gap 17); "·" has 24 px each side vs ≈5 px around the operator row's dots |
| G8 sign-in 390 light | FIX (item 1) | inline anchors Terms 38×16, Privacy Policy 85×16 (`small` in the JSON); sentence 13/18/500 wraps to 2 lines inside 358 |
| G9 sign-in 1280 dark | PASS (item 1 applies) | Privacy Policy box 418×34 = the anchor wraps "Privacy / Policy." across two lines in the 420 column; accent `#FFB020` on `#0F1113` |

FIX items, ranked (both one-liners, no re-shoot beyond G7; bundle with the in-flight heading-level fix):
1. **Inline anchors are 16 px high** (G8 Terms 38×16, Privacy Policy 85×16; G1–G6 footer `hello@tanren.me` 105×16 — all six
   JSONs list it under `small`), while the sibling `LegalLink` is 44. `hitSlop` is ignored on RNW (`LegalPage.tsx` comment), so
   give `InlineAnchor` `paddingVertical: 14` (16 + 2·14 = 44): on an inline span vertical padding extends the hit box without
   moving the line box. Done when the anchor's `getBoundingClientRect().height` is 44 and `contentH` of G1/G5/G8 is unchanged.
   Also put a no-break space in the G9 label ("Privacy Policy") so the anchor never splits across lines.
2. **Footer separator spacing** (G7): 8 px link padding + the "·" row gap makes 24 px each side of the dot, next to a row whose
   dots sit at ≈5 px. Drop the "·" glyph between the two 44 px targets; the two 8 px paddings leave a 16 px gap (= `space.lg`),
   which is how the brand row already separates its items. Alternative: keep the dot, `paddingHorizontal: space.xs` → 16 px.

Nits ruled:
- (a) 24 px around the "·": not accepted as is — see item 2 (the fix removes the glyph, keeps the 44 px targets).
- (b) landing tagline at 390: 62 ch at 13/18/500 ≈ 390 px > 358, wraps with the one-word orphan "holds." — pre-existing landing
  copy, out of LEGAL scope: accepted here; landing nit for later (`maxWidth` ≈ 300 px or two balanced lines of ≈31 ch).
- Two 28/30/800 titles 48 px apart on 390 (AppBar brand + doc title): accepted, it is the LEGAL-R r2 document-frame decision
  and matches `/settings`; the 1280 column (372) sits right of the brand title (120) for the same reason.
- (c) heading levels: ignored (code fix in flight, not visual).

LEGAL-DV: FIX (2 items)
