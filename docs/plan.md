# Tanren — project plan

> This is the project's constitution. It was written by the owner (Lukas) and is
> the source of truth for scope, stack and build order. Agents do not edit it;
> deviations are proposed as ADRs in `docs/adr/` and confirmed by the owner.

Tanren (鍛錬, "forging / disciplined training"). Domain: tanren.me (Cloudflare).

## What it is
Personal gym tracker. The app is a fast logger; Claude (my subscription,
via MCP) reads my history and writes the plan into the DB; the app displays
it. No LLM calls from the app. Running support comes later.

## Stack
- Monorepo (pnpm): `apps/mobile`, `apps/worker`, `packages/db`, `packages/shared`
- Client: Expo + Expo Router, TypeScript. iPhone via Expo Go (EAS Update)
  and responsive web (`expo export --platform web`)
- Local data: expo-sqlite, offline-first; batched push/pull sync
  (`updatedAt`, soft deletes, last-write-wins)
- Backend: Cloudflare Workers (free tier) — REST API + static web hosting
- DB: Cloudflare D1 + Drizzle; every row has `userId`
- Auth: Better Auth on Workers + D1 (magic link)
- MCP: Cloudflare Agents SDK (`McpAgent`) + `workers-oauth-provider`,
  authenticating against the Better Auth user table
- Domains: `tanren.me` (web), `api.tanren.me` (REST), `mcp.tanren.me` (MCP)

## Code style — hard rules
- Effect (`effect`) everywhere outside React components and the McpAgent
  adapter. Services are `Context.Tag`s wired with `Layer`s
- Effect Schema for all data shapes, shared in `packages/shared`
- `@effect/sql-d1` + `@effect/sql-drizzle` for queries;
  `@effect/platform` HttpApi for endpoints
- Errors as `Data.TaggedError`, never `throw`, never `any`
- Branded IDs, discriminated unions, exhaustive `Match`, `readonly`,
  `Option` instead of `null`
- tsconfig: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- eslint-plugin-functional: no `let`, no mutation, no `class` outside adapters

## Data model
- `user`, `profile` (goals, constraints, available days, equipment)
- `exercise` (my names + aliases, muscle groups)
- `plan` → `planWeek` → `plannedSession` → `plannedSet`
- `session` → `set` (weight, reps, RPE, note; links to plannedSession)

## MCP tools
`get_overview(period)`, `get_exercise_history(exerciseId)`, `list_sessions`,
`get_current_plan`, `write_plan_week`, `log_session`, `update_profile`.

## Screens
- Today: planned session, one exercise per screen, swipe to next.
  Prefilled weight/reps with big ± steppers; one tap "Log set"; auto rest
  timer; swap / add exercise. Must work fully offline
- Plan: the current week
- Web: same screens, two-column layout on wide viewports

## Build order
1. Monorepo scaffold, tsconfig, eslint, Effect setup, `packages/shared` schemas
2. D1 schema + migrations + seed script with a fake month of data
3. Worker: Better Auth, HttpApi endpoints, sync endpoint
4. MCP server, read tools first → attach from Claude Code
5. MCP write tools + OAuth → add as custom connector in the Claude app
6. Mobile: Today screen with offline logging + sync
7. Plan screen, web layout, deploy web to Workers on tanren.me

Start with step 1. Ask before making architectural decisions not covered here.

## Amendments (owner instructions after the original plan)

Recorded 2026-10-19, from the owner's kickoff message:

1. **AI-first repo.** The repo is developed by a Lead agent that coordinates
   engineer agents and does not write code itself. All `CLAUDE.md` and
   `.claude/` files are first-class project artifacts. See `docs/dev-system.md`.
2. **Tooling.** Use the newest TypeScript and **Biome** for formatting and
   linting. **No ESLint** (replaces "eslint-plugin-functional" above). The
   functional rules still apply and are enforced with Biome built-in rules
   plus Biome GritQL plugins; see `docs/adr/0002-formatting-and-linting.md`.
3. **Decisions and commits** (2026-10-20, owner: "Overall always you decide, I
   will review everything when I feel like and only then I will give you
   feedback"). The Lead makes every architectural and product decision the
   plan does not cover, records each as an accepted ADR, and commits locally
   at milestones. The owner reviews asynchronously and overrides by message.
   This replaces "Ask before making architectural decisions not covered here."
4. **v2 scope** (2026-10-21 00:20, owner, leaving until morning: "Work on
   your own. If you finish what you planned, then expand functionality"):
   - **Exercise catalog**: "all possible exercises in the gym with images (I
     don't know all official names, I need image). For image try to generate
     SVG illustration."
   - **Guided programs**: like the "Six Pack in 30 Days" app — every day
     seven six-pack exercises done in 15 minutes. On iPhone: Dynamic Island
     ("floating island") support while an exercise is on, break (rest)
     tracking, Lock Screen display while exercising — "like a proper
     training app".
   - **Design**: "keep simple and modern design like Strava. Web should be
     responsive — desktop, tablet, mobile support."
   - "If you have even more time think yourself what to do."
   Lead decisions under Amendment 3 apply; deviations (e.g. a native dev
   build for Live Activities, which Expo Go cannot run) are ADRs with owner
   actions listed.
5. **Equipment and locations** (2026-10-21 10:50, owner, verbatim): "Also
   review exercises, I personally like to use gym equipment more than just
   dumbells. And when you sign in you in the app in the setting you should
   be able to select what equipment is available. Also maybe you should
   select per location or smth- e.g. when I train at home I have one
   equipment, at the gym other." Lead reading: the catalog grows on the
   machine / cable / Smith side; Settings gets an equipment picker; the
   picker is per *location* (Home, Gym, …) with one active location that
   filters the Library and informs Claude's planning through MCP
   (ADR-0016, `docs/design/equipment.md`, `docs/tasks/v3-equipment.md`).
6. **Design quality** (2026-10-21 11:20, owner, after reviewing 12 screenshots
   of the v2 web build, verbatim): "Ok, you need improve design a lot. Sizes,
   spacing are out. It does not look like well designed app. Run a separate
   agent that researching how to improve UI, you may need claude plugin or
   what. If it finds anything useful let me know. If not, it should review
   current design and create a plan how to improve it. I think only fable can
   do it." Lead reading: a fable architect researches (plugin skills, web),
   audits the screens with measured computed styles, and writes
   `docs/design/ui-audit.md` + `docs/tasks/v3-design.md`; design direction
   and UI plans are fable-only from now on.
   Owner on the four rendered directions (11:48, verbatim): "I like A and C,
   they can be dark/light theme. I like D big round button and + - layout. +
   cards. I think they both lacks design elements like lines, icons, etc.
   Remove bg from exercise img. Mucle map looks ugly, maybe also generate
   with openai? Also maybe include iliustration in log set page? Cause I
   might forget what it is when exercising by just name" → the merged
   system ("Forge": A light / C dark, D's round controls and cards, icons and
   rules, background-free illustrations also on the exercise page;
   `docs/design/ui-direction-final.md`).
7. **Design polish, pairs** (2026-10-26 21:15, owner, after the Forge screens
   and the first desktop-column work, verbatim): "Yeah. Overall I like design
   but it looks like not finished fully. There a too many white spaces, it
   does not looks like it fills the page. Mobile is kinda ok, desktop is
   bigger problem. But even for mobile I think we should still work on
   smaller UI improvements to make overall the looks more profesional. Spawn
   multiple agents for both desktop and mobile to review and improve design.
   They can work in peers: engineer make change, outputs ss - designed
   reviews it and gives feedback. Before that designed should research how
   to make modern and profesional mobile app UI." Lead reading: a fable
   designer researches first (`docs/design/ui-polish.md`: principles, per-
   screen critique, pair plan); then engineer + designer pairs run as
   `team-lead` loops (change → screenshots → designer feedback, ≤ 3 rounds)
   with disjoint file sets for mobile and desktop; every round's screenshots
   go to the owner's review gallery.
8. **Activity feed** (2026-10-26 21:16, owner, verbatim): "the app is missing
   activities feed page- strava like activities feed." Lead reading: a
   chronological feed of completed sessions (and guided-program days) as
   rich cards — title, date, duration, volume, sets, exercises, PRs, muscle
   map — as a first-class screen in the tab bar, designed in the Forge
   system by a fable architect (ADR-0017, `docs/design/feed.md`,
   `docs/tasks/v4-feed.md`), with the web two-column treatment.
9. **Strava integration** (2026-10-26 21:22, owner, verbatim): "Build Strava
   integration (setting should have integrations page, later on we may add
   more integrations)." Earlier the same evening: "Also can you add apple
   health integrations? or its easier to add strava?" → Lead: Strava first
   (web API, works in Expo Go and on web), Apple Health with the native dev
   build. Lead reading: Settings → Integrations page (list of providers,
   Strava first, Apple Health later), Strava OAuth through api.tanren.me,
   each completed session pushed as a Weight Training activity by the
   Worker with a retry queue, disconnect + status visible (ADR-0018,
   `docs/design/integrations.md`, `docs/tasks/v4-strava.md`).
10. **Logo and icon** (2026-10-26 22:05, owner, verbatim): "Also generate
   logo and icon with chatgpt api". Lead reading: candidates from the
   OpenAI image API in three directions (abstracted 鍛 stroke mark, anvil
   and spark, forged "T" bar with amber heat), a contact sheet for the
   owner's pick, then the final set — iOS icon 1024, adaptive icon,
   favicon, splash icon, transparent mark for the sign-in wordmark — wired
   into `app.json`. Owner on the first nine: "They are all too complex,
   keep more minimalistic" → a second, strictly minimal round.
11. **Core 30 rep targets** (2026-10-26 22:14, owner, verbatim): "I checked
   Core 30 program. For some reason it has only do exervice for x seconds.
   But in reality only some like cardio, plank should have timing. Most of
   them should be do X (count) if y exercise". Lead reading: program items
   get a mode — timed (seconds) for holds and cardio, reps (count) for
   everything else — and the player shows a rep target with a Done tap
   instead of a countdown for rep items; rest stays timed (ADR-0020,
   `docs/design/v2-programs.md` amendment, `docs/tasks/v4-program-reps.md`).
12. **Brandbook** (2026-10-26 22:20, owner, verbatim): "I was wondering
   about brand assets, we need brandook to have a design." Earlier the same
   evening on the logo: "I liked M8. Maybe try to mix minimalistic japanese
   letters or smth with that idea?" Lead reading: `docs/design/brand.md` as
   the source (name and meaning, logo system and rules, colour roles,
   type, spacing, iconography, illustration style, voice, app icon, email,
   social image) plus a browsable Design System artifact built from it,
   with vector exports of the chosen mark.
13. **Landing page** (2026-10-26 22:25, owner, verbatim): "https://tanren.me/
   -> when not signed in, show cool landing page with button to sign in. It
   should have iliustrations, use chatgpt api for that." Lead reading: a
   signed-out visitor to the web root sees a marketing landing in the Forge
   system (hero with the 力 mark and wordmark, what Tanren does, a few
   feature sections, one primary "Sign in" button to the magic-link flow),
   responsive at 390 and 1280 in light and dark, illustrated with a small
   set of images generated by the OpenAI image API in the style of the
   existing exercise illustrations; a signed-in visitor still lands in the
   app; native keeps the sign-in screen (ADR-0019 amended,
   `docs/design/landing.md`, `docs/tasks/v4-landing.md`).
14. **Lettered wordmark** (2026-10-26 22:58, owner, verbatim, after seeing the
   final 力 mark on the sign-in page): "Currently we have more like icon than
   the logo. If we show only the icon it looks good, but if we write tanren
   near it - not so good. Maybe we need logo variation where Tanren is
   written in icon like style?" Lead reading: the mark stays; the typeset
   "TANREN" next to it is replaced by a wordmark lettered in the same
   brush-and-ink language (single ink weight, one amber hook), generated by
   the OpenAI image API in a candidate round (wordmark alone, horizontal
   lockup with 力, stacked lockup, ligature where the T is the 力 stroke),
   contact sheet for the owner's pick, then the final transparent assets
   wired into sign-in, the landing hero and the brandbook.
15. **Wordmark pick and the T mark** (2026-10-27 10:18, owner, verbatim, on the
   W1–W6 sheet): "Wordmark letter -> w1. I like the T. Lets use W1 when we
   need full text and replace icon with only that T from W1." Lead reading:
   W1 is the final wordmark (full-text lockup on sign-in, the landing hero
   and the brandbook); the standalone mark is no longer the 力 kanji but the
   T letterform cut from W1, in the same ink-and-brush language, and it
   replaces the icon everywhere the mark appears alone — iOS app icon,
   adaptive icon, favicon, PWA icons, splash, the magic-link email, the
   in-app mark. LOGO-2's 力 set is superseded (kept under
   `assets/brand/candidates/` for the record); `docs/design/brand.md` and the
   brandbook follow (`docs/tasks/v4-brand-briefs.md`, LOGO-4).
16. **MCP client identities** (2026-10-27 12:35, owner, verbatim, after trying
   the Claude app connector): "Your MCP client does not support 'Use Claude's
   published identity' mode. Add identities for claude/chatgpt. For other
   apps MCP auth screen should show untrusted warning." Lead reading: the
   OAuth server accepts the published client identities of the Claude and
   ChatGPT apps (client-ID metadata documents / their fixed client ids and
   redirect URIs, verified by the spike), shows them by name and logo as
   trusted on the consent screen, and shows an explicit "untrusted app"
   warning for any other (dynamically registered or unknown) client
   (ADR-0022, `docs/design/auth-v2.md`, `docs/tasks/v5-auth.md`).
17. **Stateless auth** (2026-10-27 12:35, owner, verbatim): "Also i saw you use
   kw db for sessions. Instead add SECRET_KEY env var if you dont have
   anything similar to prod and use json web token for both login and oauth
   to have fully stateless auth." Lead reading: no KV; a `SECRET_KEY` Worker
   secret signs JSON Web Tokens for the app login (Better Auth session as a
   JWT / cookie-cached token) and for the MCP OAuth flow (authorization codes,
   access and refresh tokens as JWTs); `OAUTH_KV` is retired. The Lead's
   stated concern: fully stateless tokens cannot be revoked before expiry, so
   the design keeps short access-token lifetimes and one integer per user
   (a token generation in D1) that bumps on disconnect / sign-out everywhere;
   the architect validates or overrides (ADR-0022).
18. **Legitimate business surface** (2026-10-27 13:30, owner, verbatim): "Also
   think how to make https://tanren.me like legit business. I think you need
   to include privacy policy and terms and conditions pages." Lead reading:
   public `/privacy` and `/terms` pages on tanren.me (reachable signed out,
   linked from the landing footer, the sign-in page, the OAuth consent page
   and Settings → About), honest plain-language texts drafted by the
   architect for the owner's review (data stored, where, third parties,
   cookies, retention and deletion, contact, governing law, "not medical
   advice"), a business footer (operator name, contact address such as
   `hello@tanren.me` via Cloudflare Email Routing), "last updated" dates,
   and whatever else a connector reviewer or an API program (Strava, Garmin)
   expects of a real product (ADR-0024, `docs/design/legal.md`,
   `docs/tasks/v5-legal.md`).
19. **Garmin integration, personal token** (2026-10-27 13:30, owner, verbatim):
   "Also add Garmin integrations where you need to enter your personal API
   token (https://connect.garmin.com/app/settings/personalApiToken)." The
   owner supplied a personal token for testing only ("use only for testing,
   do not add to the code"); it lives outside the repo and is never
   committed. Lead reading: Settings → Integrations gains a Garmin row where
   the owner pastes the personal API token; the Worker validates it against
   Garmin, seals it like the Strava tokens, and pulls activities and daily
   health on the existing cron into the feed (runs, walks, rides with
   duration, distance, calories, heart rate) and the day's calories;
   disconnect removes the token (ADR-0023, `docs/design/garmin.md`,
   `docs/tasks/v5-garmin.md`; spike G1 first on the real API).
20. **Calories and nutrition tracking** (2026-10-27 13:52, owner, verbatim):
   "Next, I want to integrate calories tracking like
   https://www.myfitnesspal.com in the app. How I think it should work (these
   are just ideas, your team should think and establish the plan on their
   own): — Garmin fetches burned callories. Idk about our workouts, wont it
   just duplicate if we track. You decide, research how others like
   https://www.myfitnesspal.com/ do. — Food tracking via mcp. I am thinking of
   using claude and just taking photos. I dont need max precision, but I want
   it to make as east as possible. — Then you open app in todays view it
   should show how much you burned, how much you ate. And insigts,
   suggestions. — Health insights that includes activities, calories, etc. —
   Set goals, like gain mucle, lose weigt, etc. In food tracking it should
   track protein, calories, etc. — Maybe overall stats of the past week to
   see if we rearched our goals) Plan yourself it. You can add simple manual
   entry adding with common foods and suplements, but focus adding food is
   via mcp. Manually I maybe will only add protein shakes/bars, etc. Think
   yourself hold to make it". Lead reading: a nutrition domain next to
   training — food entries with calories and macros logged mainly through
   MCP (the owner photographs a meal in the Claude app, Claude estimates and
   calls a `log_food` tool), a small manual quick-add for shakes, bars and
   supplements; burned calories from Garmin's daily totals with a
   double-counting policy decided by research (how MyFitnessPal reconciles
   tracker burn with logged workouts); goals (gain muscle / lose weight /
   maintain) that set calorie and protein targets; Today shows burned vs
   eaten with insights; a Health insights view and a weekly review against
   the goal (ADR-0025, `docs/design/nutrition.md`, `docs/tasks/v6-nutrition.md`,
   research `docs/research/2026-10-27-nutrition-tracking.md`).
21. **Programs via MCP** (2026-10-27 14:34, owner, verbatim): "Can you create your
   own programs? Or create and modify via MCP?" Lead reading: guided programs
   stop being code-only data — a user-owned synced `program` table lets Claude
   create, update and delete programs through MCP tools (`list_programs`,
   `get_program`, `write_program`, `update_program`, `delete_program`,
   `enroll_program`), the built-in catalog (Core 30) stays read-only, the
   app's Programs tab and player run both kinds unchanged, and in-app
   authoring is deferred (ADR-0026, `docs/design/programs-mcp.md`,
   `docs/tasks/v6b-programs.md`; built after the nutrition foundation).
22. **Programs: defaults, UI + MCP authoring, status, exercise swap, a 12-week
   default** (2026-10-27 14:36, owner, verbatim): "For programs provide default
   programs. But allow creating and modifying programs via UI and MCP. Also
   programs should have status- you can have multiple active programs at the
   moment. / Also when start the program exercise add a button to switch the
   exercise to similar one. Its very usefull of you are exercising and e.g.
   some equipment is taken, so you want to do similar exercise with free
   equipment or you just dont like current exercise. This should work even
   for default programs. / I really liked "lee labrada 12 week lean body"
   program. I think idea of it is 2 days work, 1 cardio. And push, pull,
   legs? Create it as default, just dont mention lee labrada." Lead reading
   (supersedes Amendment 21's "authoring deferred"): built-in defaults stay
   (Core 30 plus a new 12-week lean-body program — push / pull / legs
   rotation with a cardio day after every two training days, no trademark
   or author name anywhere); programs are created and edited both in the
   app and through MCP; every program enrollment carries a status (active,
   paused, completed, abandoned) and several can be active at once; the
   player gets a "Swap exercise" action that offers similar exercises (same
   primary muscle group, equipment available at the active location, same
   timed/reps mode) and the swap is remembered per enrollment, so it works
   for default programs without editing them (ADR-0026 amended,
   `docs/design/programs-mcp.md`, `docs/tasks/v6b-programs.md`).
23. **Code hygiene and breaking changes** (2026-10-27 14:41, owner, verbatim):
   "also keep the code clean, no legasy shit. If you make breaking changes -
   migrate live db first and then deploy new changes." Lead reading: no
   compatibility shims, dual code paths, deprecated aliases, `legacy`/`old`
   names, dead exports or "remove later" markers survive a task — the
   replacement deletes what it replaces in the same change (reviewers flag
   any leftover as a should); a schema or wire change that the running
   Worker cannot serve is split expand → migrate live D1 → deploy → contract,
   and every deploy applies pending migrations to production before the
   Worker upload (`scripts/deploy.sh` `MIGRATE=1`, `docs/design/deploy.md`).
24. **MCP reads everything, integrations included** (2026-10-27 16:09, owner,
   verbatim, after reading the Garmin copy "never shared with third parties
   or used by the AI planning tools" and asking "You mean MCP cant access this
   info or what?"): "Going back to MCP, it should be able to access all info:
   including synced from integrations". Lead reading: every row Tanren stores
   for the user is readable through the MCP connector — training, nutrition,
   profile, and the data imported from integrations (Garmin activities and
   daily summaries; Strava is push-only, nothing to read). v6 already returns
   daily summaries in `get_nutrition_day` / `get_week_review`; a
   `list_activities(period)` tool and an imported-activities summary in
   `get_overview` follow (N-S4, `docs/tasks/v6-nutrition.md`), and the Garmin
   copy in Settings, `docs/design/garmin.md` §10 and the privacy page say so
   ("never shared with third parties; your own Claude reads it through the MCP
   connector when you ask").
25. **Program day preview** (2026-10-27 16:10, owner, verbatim, three
   messages): "https://tanren.me/programs -> you should be able to preview
   each day for the program" / "Including today without starting" / "each day
   program on click". Lead reading: on a program's detail every day — today's
   and the current one included — is pressable and opens a read-only preview
   of that day (items with mode and targets, rest, the day's stats and its
   position in the program) without enrolling or starting anything; a "Start
   this day" action appears only for the enrolled program's current day. Works
   for built-in and user programs (P-M5, `docs/tasks/v6b-programs.md`).
26. **Resting heart rate off Today** (2026-10-27 16:18, owner, verbatim): "Also
   I think you can drop bpm from UI- or do you think we need it somewhere?"
   Lead reading: the Today health module shows calories left, eaten, burned,
   protein and steps; resting heart rate is dropped there and kept only on the
   Health screen as a small weekly trend stat (it is a recovery signal worth a
   glance, not a daily headline). Recorded in `docs/design/health-module.md`.
27. **Confirmation dialogs** (2026-10-27 17:55, owner, verbatim): "Our app is
   missing simle popups to confirm dangerous operations." Lead reading: every
   destructive or hard-to-undo action (deleting a program, abandoning an
   enrollment, disconnecting an integration, erasing data, signing out
   everywhere) asks first through one `useConfirm` primitive — the platform
   alert on iPhone, a Forge dialog on web — with the inventory, the rule for
   which actions qualify and the briefs in `docs/design/confirm-dialogs.md`
   (CONFIRM-D).
28. **Styling stack** (2026-10-27 17:55, owner, verbatim): "Also do you use
   tailwind for css? Or https://ui.shadcn.com? Both of these can helps to have
   more consistent UI with some customatizations." then "Decide yourself if
   its worth". Lead decision: no — shadcn/ui is React-DOM-only and Tailwind on
   React Native means NativeWind, a second styling language next to the Forge
   tokens; consistency comes from the `src/ui` primitives, the token table and
   the measured design reviews (ADR-0027).
29. **Start a workout without a plan** (2026-10-27 18:16, owner, verbatim):
   "Also I dont get what is the point of library. I get error what todays
   session not started. How to start days session?" Lead reading: the app
   assumed every session comes from a Claude-written plan or a program day,
   so a user with no plan hits a dead end ("today's session not started")
   when adding an exercise from the Library. Today's empty state and the
   Library's no-session state gain **Start a workout**: an unplanned session
   for today that takes exercises from the Library, logs sets with the usual
   steppers prefilled from history, and finishes into the feed like any other
   session; the Library's purpose (browse by muscle and equipment, see what
   the active location allows, add or swap) is stated in the app
   (ADR-0028, `docs/design/free-workout.md`, FREE-D).
30. **Navigation for growth** (2026-10-27 18:30, owner, verbatim): "Also I
   think we should be smart about bottom navigation cause its very limited.
   And overall limitations. Research strava, garmin and suggest how to remake
   navigation and pages to be easier to navigate and be more usefull.
   Expecially if we are planning to grow our functionality." Lead reading: a
   fable architect researches the hub structure of Strava, Garmin Connect,
   Apple Fitness and the strength-logging apps, then proposes two directions
   and a merge for the tab bar, the hubs behind each tab (Home, Train, Feed,
   You or similar), the desktop nav, growth rules (new features land as cards
   or hub rows, never new tabs) and a route-migration plan; the owner picks
   from a contact sheet (`docs/research/2026-10-27-navigation-ia.md`,
   `docs/design/navigation-v2.md`, NAV-D). Pick: the owner was asked at
   18:50 (A / B / Merge); with no answer by 19:00 the Lead took the
   architect's recommendation, Merge — Home · Train · Feed · You, Start as the
   hero pill, fifth slot reserved — under Amendment 3 (ADR-0029). Owner,
   19:07, verbatim: "I like Merge / Start button does not make sense. /
   weekly review - yeah / Call Activity." → Merge confirmed; no Start button
   in the tab bar (Start stays inside the Up-next card and the Train hub);
   the weekly review page is in this round (NAV-4); the Feed tab is named
   "Activity" (ADR-0029 amended).
32. **Programs are a sequence, not a calendar** (2026-10-27 19:07, owner,
   verbatim): "let's say I start the program. And I miss first day. I want
   next day to see start day 1, not day 2 and skip day 1. Program should not
   be tied exactly to the day. It should be dynamic, do you get?" Lead
   reading: an enrollment's current day is the first day not yet completed,
   whatever the calendar says; a missed day is simply still due; Today, the
   program detail, the day preview and `get_program_progress` all show that
   day; at most one program day is completed per calendar day per enrollment
   (the next one becomes due the following day). Recorded in
   `docs/design/programs-player-v2.md` (PROG-D2 §d) and ADR-0026 amended.
31. **Program player: preview on press, weights per set, resume** (2026-10-27
   18:41, owner, verbatim): "More feedback: when I click on active program
   name I expect go to preview. / There is no ability to track weights for
   exervices? At least when you go to exercise mode. Stats should track
   weigths, not reps in statistics / If you start program, do smth, go back -
   it should say continue day 1 and progress should not be lost." Lead
   reading: the Today program row's name opens the current day's preview
   (Start stays the primary action); reps items of weighted exercises get
   weight × reps entry in the player with the Forge steppers, prefilled from
   history, and log real weights, so Progress charts weight / e1RM for
   weighted exercises and reps or seconds only for bodyweight and timed ones;
   an unfinished program day is persisted on the device and offered as
   "Continue day N" with its progress intact (`docs/design/programs-player-v2.md`,
   `docs/tasks/programs-player-briefs.md`, PROG-D2).
