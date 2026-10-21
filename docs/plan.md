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
