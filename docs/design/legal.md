# Legal pages and business surface — `/privacy`, `/terms`, footer, deletion

Source: plan Amendment 18 · ADR-0024 · Status: normative for LEGAL-1…LEGAL-4 · 2026-10-27 13:20
Owner instruction 13:45: no placeholders, operator "Tanren" run by a private individual in Lithuania,
contact `hello@tanren.me` (live), "Last updated 27 October 2026". §6 lists the grep behind each fact.

## 1. Privacy Policy (paste verbatim into `legalCopy.ts` → `PRIVACY`)

Title: **Privacy Policy** · Last updated 27 October 2026

### 1.1 Who runs Tanren (`id: "who"`)
Tanren (tanren.me) is a personal gym tracker run by a private individual in Lithuania. For the purposes of
the GDPR, Tanren is the controller of the personal data described here. Contact: hello@tanren.me.

### 1.2 What we store (`id: "data"`)
- **Account**: your email address, when it was verified, and the time of your sign-ins. Sign-in uses a
  one-time magic link sent to that address; there is no password.
- **Training log**: the sessions, sets, weights, reps, RPE and notes you log, the exercises you add, your
  plans and plan weeks, and the guided-program days you complete.
- **Profile**: goals, constraints, available days, your locations (for example Home, Gym) and the equipment
  at each.
- **Integrations**: if you connect Strava, the access and refresh tokens Strava issues. They are stored
  encrypted with a key that lives only on the server. If you connect Garmin, the token you paste is stored
  the same way, and the activities and daily health data we pull from Garmin are stored as your records.
- **AI access**: if you connect your own Claude (or another MCP client) through our connector, we store the
  grant you approved and short-lived tokens for it. That client can then read everything Tanren stores for you,
  imported Garmin data included, when you ask it. We never send your data to an AI service ourselves.
- **On your device**: the app keeps a copy of your training data in a local database so it works offline,
  plus your theme preference. On the web this lives in your browser's storage for tanren.me.

Your email address is the only data you must provide: without it Tanren cannot sign you in. Everything else
is optional.

### 1.3 Why, and on what legal basis (`id: "purpose"`)
We process your data to run the service you signed up for: logging, syncing between your devices, showing
your plan and history, and pushing or pulling activities for the integrations you turned on (GDPR Art.
6(1)(b)). Connecting Strava, Garmin or an AI client is your choice and can be undone in Settings (Art.
6(1)(a)). Standard server and email delivery logs are kept to run the service securely (Art. 6(1)(f)). We
do not profile you, sell data, show ads, or run analytics or tracking.

### 1.4 Where it is stored, and who else sees it (`id: "where"`)
Your account and training data are stored in a Cloudflare database and run on Cloudflare's network.
Cloudflare also keeps standard request logs and traffic analytics on its side. Magic-link emails are
delivered by Resend, which keeps delivery logs including your address. Strava and Garmin receive or
provide only what the integration you enabled needs; their own terms apply to the data you hold there. The
iPhone app is built and delivered with Expo's tools; Expo does not receive your training data. These
providers are based in the United States and process data under their GDPR data processing terms and the
EU standard contractual clauses. We do not share your data with anyone else, except when the law requires.

### 1.5 Cookies and local storage (`id: "cookies"`)
On the web, one cookie keeps you signed in for up to 30 days; it is strictly necessary and set only after
you sign in, so no cookie banner is needed. The web app stores your training data and theme in your
browser's storage so it can work offline. There are no analytics, advertising or third-party cookies.

### 1.6 How long we keep it (`id: "retention"`)
Your data stays as long as your account exists. Items you delete in the app are marked deleted and kept so
your other devices learn about the deletion; they are removed with your account. Magic links expire within
minutes and work once. Integration tokens are deleted when you disconnect the integration. AI client grants
are revoked when you disconnect them in Settings.

### 1.7 Deleting your account (`id: "deletion"`)
Settings → Data → Delete account removes your account and every record linked to it from our database, and
clears the copy on that device. Delete the app or clear site data to remove copies on other devices. You can
also ask by email at hello@tanren.me and we will do it within 30 days. Data already pushed to Strava stays
in your Strava account under Strava's terms.
(LEGAL-2 ships the row. Until then the first sentence reads: "Email hello@tanren.me from your account address
and we remove your account and every record linked to it within 30 days." — `PRIVACY_DELETION_INTERIM`.)

### 1.8 Your rights (`id: "rights"`)
You can access, correct, export (Settings → Data → Export), restrict or object to the processing of your
data, and have it erased. Write to hello@tanren.me. You may also complain to the Lithuanian State Data
Protection Inspectorate (vdai.lrv.lt) or the supervisory authority where you live.

### 1.9 Children (`id: "children"`)
Tanren is for people aged 16 and over. If you believe a younger person has an account, tell us and we will
delete it.

### 1.10 Changes (`id: "changes"`)
When this policy changes, the date at the top changes and the app shows the new version here. Material
changes are announced on the sign-in page before they take effect.

## 2. Terms of Service (`TERMS`)

Title: **Terms of Service** · Last updated 27 October 2026

### 2.1 What Tanren is (`id: "service"`)
Tanren is a personal gym tracker: you log sets, follow guided programs, see your history, and may let your
own AI assistant read that history and write a plan. It is run by a private individual in Lithuania and
offered free of charge. By using it you agree to these terms.

### 2.2 Not medical advice (`id: "health"`)
Tanren records what you do. Plans, targets and programs are suggestions, not medical or professional
coaching advice. Training carries a risk of injury: check with a doctor if you are unsure, and train at your
own risk.

### 2.3 Your account (`id: "account"`)
You need a working email address; sign-in is a one-time link sent to it. Keep your mailbox secure, because
whoever reads it can sign in as you. You must be 16 or older. One account per person.

### 2.4 Your data (`id: "your-data"`)
Your training log belongs to you. You give Tanren the permission needed to store, sync and show it to you
and to send it where you ask (for example Strava). You can export it at any time and delete it with your
account.

### 2.5 AI assistants and integrations (`id: "integrations"`)
Connecting Claude or another MCP client, Strava or Garmin is optional. Those services have their own terms
and privacy policies, and Tanren is not responsible for what they do with your data or for the plans an AI
assistant writes. You can disconnect any of them in Settings.

### 2.6 Acceptable use (`id: "use"`)
Do not attack, overload or reverse-engineer the service, access other people's data, or use Tanren for
anything unlawful. We may suspend accounts that do.

### 2.7 Availability and changes (`id: "availability"`)
Tanren is free and provided as is, without uptime guarantees. Features may change or be removed, and the
service may pause or end; if it ends, we announce it on tanren.me and give you time to export your data.

### 2.8 Intellectual property (`id: "ip"`)
The app, its design, the Tanren name and mark, and the exercise illustrations belong to Tanren. You may use
them only through the app.

### 2.9 Liability (`id: "liability"`)
To the extent the law allows, Tanren is not liable for injury, lost data or other losses from using a free
service. Nothing here limits rights you have as a consumer under Lithuanian or EU law.

### 2.10 Ending (`id: "termination"`)
You can delete your account at any time. We may close accounts that break these terms. These terms end when
your account does, except the sections on your data, IP and liability.

### 2.11 Law and contact (`id: "law"`)
These terms are governed by the law of the Republic of Lithuania; EU consumer protection rules apply where
they are mandatory. Questions: hello@tanren.me.

## 3. Pages — design (Forge, both schemes)

Routes `app/privacy.tsx`, `app/terms.tsx` (inventory line in `apps/mobile/CLAUDE.md` "Layout" added by
LEGAL-1). Both render `<LegalPage doc={PRIVACY} />` / `TERMS`. `Head` from `expo-router/head` sets
`<title>Privacy · Tanren</title>` / `Terms · Tanren` (VERIFY-1: installed `expo-router` exports `Head`;
fallback `Stack.Screen options={{ title }}` — engineer verifies against installed types).

```
┌ AppBar: ← back (router.back(), or /today when no history)   "Privacy Policy" ┐
│                                                                              │
│ Privacy Policy                        title 28/30, header role                │
│ Last updated 27 October 2026          caption muted                          │
│                                                                              │
│ Who runs Tanren                       title2 22/28, nativeID = section.id    │
│ Tanren (tanren.me) is a personal …    body 17/22, paragraph gap 12           │
│ • Account: your email address …       bullets: "• " + body, gap 8            │
│ …                                                                            │
│ Questions? hello@tanren.me            caption muted, mailto link             │
│ Privacy · Terms                       caption links (the other page)         │
└──────────────────────────────────────────────────────────────────────────────┘
```

| element | primitive / prop | measure |
| --- | --- | --- |
| frame | `Page scroll` (not `wide`, no `aside`), `AppBar` title = doc title, back `IconButton` | 390: 390 − 2·16 = 358 body; 1280: header spans 1216, body `contentMaxWidth` 600 → 600 − 2·32 = 536 px ≈ 65 ch at 17 px |
| doc title | `Text variant="title" accessibilityRole="header"` | 30 line |
| updated | `Text variant="caption" tone="muted"` | 18 line, `space.xs` below title |
| section | `View nativeID={id}` + `Text variant="title2" accessibilityRole="header"` | 28 line; sections `rhythm.groupToLabel` 24 apart; heading→first paragraph `rhythm.labelToGroup` 8 |
| paragraph | `Text variant="body"` | 22 line, paragraphs `space.md` 12 apart |
| bullet | row: `Text body` "•" (width 16) + flex `Text body` | 358 − 16 − 8 gap = 334 text column at 390 |
| footer | `Text caption muted`, `Pressable` links in `colors.accent` with `interaction.ts` hover underline | `space.xl` 24 above |

Anchor ids are the section ids in §1/§2 (`/privacy#deletion`); VERIFY-2: RN `View` `id` vs `nativeID` on
web renders a DOM id (installed `react-native` types decide; prefer `id`, fall back `nativeID`).
States: no Loading/Empty/Failed (static content). Frame check per ROUTE (`/privacy`, `/terms`): same
AppBar + Page frame as `/settings` at both widths; no horizontal scroll at 390.

Copy shape (`apps/mobile/src/components/legal/legalCopy.ts`):
```ts
export interface LegalSection { readonly id: string; readonly heading: string
  readonly blocks: ReadonlyArray<{ readonly _tag: "p"; readonly text: string } | { readonly _tag: "ul"; readonly items: ReadonlyArray<string> }> }
export interface LegalDoc { readonly slug: "privacy" | "terms"; readonly title: string; readonly updated: string; readonly sections: ReadonlyArray<LegalSection> }
export const LAST_UPDATED = "27 October 2026"
export const CONTACT_EMAIL = "hello@tanren.me"
export const PRIVACY: LegalDoc, TERMS: LegalDoc, PRIVACY_DELETION_INTERIM: string
```
`legalCopy.test.ts`: every section id unique; every doc has ≥ 9 sections; no `[` placeholder characters;
each text mentions `hello@tanren.me` at least once; `updated === LAST_UPDATED`.

## 4. Placement

| where | file | change |
| --- | --- | --- |
| landing footer | `src/components/landing/Landing.tsx` (footer block after `LANDING.meaning`), `landingCopy.ts` `footer` gains `operator: "© 2026 Tanren · Vilnius, Lithuania"`, `contact: "hello@tanren.me"`, `links: [{label:"Privacy", href:"/privacy"},{label:"Terms", href:"/terms"}]` | one caption row "© 2026 Tanren · Vilnius, Lithuania · hello@tanren.me" + one row "Privacy · Terms" (`router.push`); 390: fits in 358 at 13 px (≈ 55 ch, row 1 is 47 ch) |
| sign-in | `app/sign-in.tsx` below the Send button; copy in `legalCopy.ts` `SIGN_IN_AGREEMENT = "By continuing you agree to the Terms and acknowledge the Privacy Policy."` | `Text caption muted`, the two words are links; both platforms; also shown in the "link sent" state? no — only with the form |
| Settings → About | `src/components/settings/AboutSection.tsx` (not an STLS file; `settingsCopy.ts` IS STLS-5's — copy goes in `legalCopy.ts`) | two `ListRow` `icon="user"` (Privacy) and `icon="book"` (Terms) — both in `iconPaths.ts` (checked 13:12; no shield/file glyphs), titles "Privacy Policy", "Terms of Service", `chevron`, `onPress={() => router.push("/privacy")}` |
| magic-link email | `apps/worker/src/auth/magicLinkEmail.ts` `footer` (line "You asked for this link…") | second footer line "Tanren · tanren.me/privacy · tanren.me/terms · hello@tanren.me" in text and HTML; `magicLinkEmail.test.ts` "shows the footer" asserts the new line too |
| OAuth consent | `apps/worker/src/oauth/pages.ts` — STLS-4 owns it | hand-off: STLS-4 (or its follow-up) adds "Privacy · Terms" caption links to `https://tanren.me/privacy` / `/terms` under the Allow/Deny buttons; sheet Assumes line |
| static | `apps/mobile/public/robots.txt` (`User-agent: *\nAllow: /`), `public/.well-known/security.txt` (`Contact: mailto:hello@tanren.me`, `Expires: 2027-10-27T00:00:00.000Z`, `Preferred-Languages: en, lt`, `Canonical: https://tanren.me/.well-known/security.txt`) | copied to `dist/` by `expo export` like `_headers` (CLAUDE.md Layout line); VERIFY-4 dotted directories are copied |

Gate: `authGate.ts` adds `export const isPublicRoute = (route) => route === "/privacy" || route === "/terms"`;
`gateFor` → `"allow"` when `isPublicRoute(route)`. `_layout.tsx` unchanged (allow shows the Stack).

## 5. Extras — yes/no
| item | decision | reason |
| --- | --- | --- |
| `robots.txt`, `security.txt` | yes (LEGAL-4) | cheap, what reviewers' scanners look for |
| support address `hello@tanren.me` | yes (LEGAL-3) | required contact for GDPR Art. 13, Strava/Garmin API programs |
| in-app Delete account | yes (LEGAL-2) | GDPR Art. 17; Apple 5.1.1(v) for the store build |
| imprint / humans.txt | no | a private individual in Lithuania has no imprint duty; footer + §1.1 carry the operator |
| status page | no | no SLA, one person; Terms §2.7 says so |
| cookie banner | no | one strictly necessary cookie; §1.5 states it |
| sitemap | no | one public URL + two legal pages |

## 6. Fact register (every claim → grep; LEGAL-R re-runs)
| claim | evidence |
| --- | --- |
| email + verification + sessions | `packages/db/src/schema/auth.ts` (`user`, `session`, `verification`) |
| magic link, no password | `grep -n "magicLink(" apps/worker/src/auth/BetterAuth.ts` |
| cookie up to 30 days | `grep -n "expiresIn: 2_592_000" apps/worker/src/auth/BetterAuth.ts` (2 592 000 s = 30 d); ADR-0022 JWT cookieCache keeps the 30-day session |
| magic link "within minutes, once" | `grep -n "expiresIn: 5" apps/worker/src/auth/BetterAuth.ts` — VERIFY-5 unit (Better Auth `magicLink.expiresIn` seconds vs minutes); text stays non-numeric |
| training log / profile / locations / programs | `packages/db/src/schema/{session,plan,exercise,user,program}.ts`; ADR-0016 |
| Strava tokens encrypted server-side | `grep -n "sealed\|open(" apps/worker/src/integrations/ExportQueue.ts`; `INTEGRATION_TOKEN_KEY` in `apps/worker/src/Env.ts`; ADR-0018 |
| Garmin token + activities + daily health | conditional clauses ("if you connect Garmin …") kept ahead of the integration shipping the same day: ADR-0023, tasks GM-2…GM-6, `docs/design/garmin.md`; LEGAL-R r2 re-reads them against what GM-* stores |
| MCP grants + short-lived tokens; no AI calls by us | ADR-0010/0022; `docs/design/auth-v2.md` §3; `grep -rn "openai" apps/mobile/scripts` (illustrations only, offline) |
| local database + theme | `apps/mobile/src/services/LocalStore.ts`, `src/ui/themePreferenceStore.web.ts` |
| soft deletes kept for sync | `docs/design/data-model.md` §7.0 `deletedAt`, §10.2 |
| Resend delivery logs | `apps/worker/src/auth/ResendEmailSender.ts`; Resend keeps logs by default — general statement, no retention number |
| Cloudflare request logs | `wrangler.jsonc` has no `observability` block; Cloudflare dashboard analytics exist regardless — general statement |
| D1 location | not in `wrangler.jsonc` → text says "Cloudflare database"; VERIFY-6 (Lead: dashboard → D1 `tanren` → location) may later add "in Western Europe" |
| Expo builds/delivers the app, no user data | `app.json` has no `updates` block (EAS Update not configured, LEGAL-R r1); Expo Go / EAS build tooling only — text says "built and delivered with Expo's tools" |
| export exists | `apps/mobile/src/services/DataExport.ts`, `components/settings/DataSection.tsx` |
| deletion endpoint | none today (ADR-0024 Context) → LEGAL-2 |
