# Cloudflare core for build steps 2-3: Workers, D1, Drizzle, Effect SQL (S1-R1a) - 2026-10-19

Question: what do the engineers for step 2 (D1 + Drizzle) and step 3 (Worker) need to know about Wrangler,
D1, Drizzle and Effect SQL/HttpApi on Workers: versions, config, workflow, limits, runnable snippets.

Status labels (every row of every table carries one):

| Label | Meaning |
|---|---|
| `V-doc` | read in an official page; the page's own "last updated" date is given with the URL |
| `V-src` | read in package source or `.d.ts` (tarballs fetched with `npm pack` into scratch dirs; nothing installed in the repo) |
| `V-run` | executed in a scratch project outside the repo (wrangler 4.151.2, workerd 1.20261019.1, Node 24.21.0, pnpm 12.9.1, TypeScript 7.0.2) |
| `V-npm` | registry fact from `npm view` |
| `INF` | inferred, with the evidence named |
| `UNK` | unknown |

All rows were checked on 2026-10-19 (column "Checked" = `10-19`). Cloudflare pages were read as raw Markdown
(`<url>index.md`); the Drizzle and pnpm sites as HTML converted to text. Scratch spikes (not in the repo, so the
key code is reproduced in section 9): `spike` (Effect 3 line, npm), `spike4` (Effect 4.0.5, pnpm, Option Y),
`spike4x` (Effect 4.0.5 + Drizzle 1.0 preview, Option X), `mono` (monorepo-layout probes), `pnpmtest`.

## 0. Read first: where reality differs from the brief or the plan

1. **Effect line.** The brief asked for the Effect 3 line. The repo has since pinned Effect 4.0.5
   (`pnpm-workspace.yaml` catalog; ADR-0004, status "proposed"). I verified both. Section 4a is Effect 4.0.5
   (what the repo will use, so the skill is written for it); section 4b is Effect 3.22.3 (verified fallback if
   ADR-0004 is rejected). `@effect/sql-drizzle` has **no v4 release** (V-npm: latest 0.51.0, peers `effect ^3.22`,
   `drizzle-orm >=0.43.1 <0.50`).
2. **Step 2 query layer (ADR-0004 left it open).** Evidence in sections 3 and 4a. Short version: Drizzle
   (stable 0.45.4 / kit 0.31.11) for schema and migration SQL only, queries through `effect/sql` +
   `@effect/sql-d1@4.0.5` (Option Y) works end to end. Drizzle 1.0 on Effect (`drizzle-orm/effect-d1`, Option X)
   **crashes at module load with effect 4.0.5 on the official `rc` tag** (`Schema.TaggedErrorClass` no longer
   exists); it works only with the preview build `1.0.0-rc.5-5935859`.
3. **`McpAgent` is deprecated.** Cloudflare Agents docs: "McpAgent remains available only for existing legacy
   servers while they migrate. It is deprecated and feature-frozen. Migrate to `createMcpHandler`", and "Use
   `createMcpHandler` for a new stateless server" (V-doc: .../agents/model-context-protocol/apis/agent-api/,
   last updated Jul 27, 2026; .../apis/handler-api/, Oct 18, 2026). `createMcpHandler` is called from a Worker
   `fetch`, is stateless and needs no Durable Object. The plan, `CLAUDE.md` files and the skill frontmatter still
   say `McpAgent`. This matters here only for the Durable Object config in section 1; the MCP researcher owns the rest.
4. **Free-plan CPU is 10 ms per request.** Whether Effect + HttpApi + Better Auth fits is `UNK`; it can only be
   measured on Cloudflare (section 5 has indicative local numbers and the way to measure).
5. **pnpm 12 defaults that will bite at step 3** (section 6): ignored dependency build scripts are a hard error
   (`allowBuilds` setting) and versions younger than 24 h are refused (`minimumReleaseAge`).
6. **Docs ahead of the release.** The wrangler docs list `wrangler dev --infer-origin-from-routes`; wrangler
   4.151.2 rejects it (`Unknown arguments`). Alternatives that work are in section 1.

## 1. Workers and Wrangler (question 1)

| Item | Value | Status | Source | Checked |
|---|---|---|---|---|
| wrangler latest | `4.151.2`, published 2026-10-19T10:37Z (previous: 4.151.1 on 10-16, 4.151.0 on 10-14, 4.150.0 on 10-13). `engines.node >=22.0.0`. Bundles `workerd 1.20261019.1` and `miniflare 5.20261019.0-beta`. Optional peer `@cloudflare/workers-types ^5.20261019.1` | V-npm | `npm view wrangler@4.151.2 version peerDependencies engines dependencies --json`, `npm view wrangler time` | 10-19 |
| Config file | `wrangler.jsonc` recommended for new projects; JSONC allows comments; `"$schema": "./node_modules/wrangler/config-schema.json"`. Required: `name`, `main`, `compatibility_date` (`main` optional for assets-only Workers) | V-doc | https://developers.cloudflare.com/workers/wrangler/configuration/ (Oct 17, 2026) | 10-19 |
| Field names | `exports`, `migrations`, `secrets`, `routes`, `assets.not_found_handling` (enum `single-page-application` / `404-page` / `none`), `assets.run_worker_first`, `d1_databases[].migrations_dir/migrations_table/migrations_pattern/preview_database_id`, `custom_domain` all present in the schema file | V-run | `node_modules/wrangler/config-schema.json` of wrangler 4.151.2 | 10-19 |
| `compatibility_date` | set to the current date when scaffolding; update occasionally | V-doc | https://developers.cloudflare.com/workers/configuration/compatibility-dates/ (Apr 23, 2026) | 10-19 |
| `nodejs_compat` | **Implied for dates >= 2026-08-04** (`nodejs_compat` and `nodejs_compat_v2` both on); docs say omit the flags from new configs; for 2024-09-23..2026-08-03 the flag is required. Executed: `node:buffer` and `node:async_hooks` work with no flag at 2026-10-19 and 2026-08-04, fail to bundle/run at 2026-08-03 without the flag, work at 2026-08-03 with it | V-doc, V-run | https://developers.cloudflare.com/workers/runtime-apis/nodejs/ (Aug 12, 2026); spike `nodecheck` | 10-19 |
| D1 binding block | `"d1_databases": [{ "binding": "DB", "database_name": "tanren", "database_id": "<uuid>", "migrations_dir": "migrations" }]`; optional `preview_database_id`, `migrations_table` (default `d1_migrations`), `migrations_pattern`. Bindings without `database_id` are auto-provisioned on `wrangler deploy` and the id is written back (not executed here: needs credentials) | V-doc | config page, "D1 databases" and "Automatic provisioning" | 10-19 |
| `migrations_dir` outside the config dir | `"migrations_dir": "../../packages/db/migrations"` from `apps/worker/wrangler.jsonc` lists and applies correctly; local state lands in `apps/worker/.wrangler/state/v3/d1/...` | V-run | spike `mono` | 10-19 |
| Durable Object binding | `"durable_objects": { "bindings": [{ "name": "COUNTER", "class_name": "Counter" }] }` | V-doc, V-run | config page "Durable Objects" | 10-19 |
| Durable Object lifecycle, new style | `"exports": { "Counter": { "type": "durable-object", "storage": "sqlite" } }`. Declarative, recommended for new Workers; **mutually exclusive with `migrations`**; once a Worker has deployed with `exports` it cannot return to `migrations`; `wrangler versions upload` and gradual deployments do not apply lifecycle changes. Executed in `wrangler dev` 4.151.2: DO counter incremented, `ctx.storage.sql` present | V-doc, V-run | https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ (Sep 28, 2026) | 10-19 |
| Durable Object lifecycle, legacy | `"migrations": [{ "tag": "v1", "new_sqlite_classes": ["Counter"] }]`; still supported; executed OK in `wrangler dev` | V-doc, V-run | config page "Migrations" | 10-19 |
| Durable Objects needed? | Only if `McpAgent` is used (section 0.3). `createMcpHandler` is stateless: no binding, no `exports`/`migrations` block | V-doc | agents handler-api page (Oct 18, 2026) | 10-19 |
| `assets` block | `"assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "html_handling": "auto-trailing-slash" (default), "run_worker_first": false (default) }`. One asset collection per Worker. `main` optional (assets-only Worker) | V-doc, V-run | config page "Assets"; assets-only dry-run: `Total Upload: 0.31 KiB`, `wrangler dev` served the SPA shell | 10-19 |
| SPA + Worker: navigation requests | With `not_found_handling: single-page-application`, a `main` Worker and compatibility date >= 2025-04-01, requests with `Sec-Fetch-Mode: navigate` that match no asset get `index.html` and **do not invoke the Worker**. Executed: navigation to `/api/exercises` returned the HTML shell; the same path as `cors` fetch or without the header reached the Worker; with `"run_worker_first": ["/api/*"]` the navigation reached the Worker, other SPA routes still got the shell, assets were served directly | V-doc, V-run | https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/ (Oct 12, 2026); spike `spike` | 10-19 |
| `run_worker_first` on Free | Requests matching the patterns always invoke the Worker; past the daily limit they get 429 instead of falling back to assets. Patterns must start with `/` or `!/`, at most 100 entries | V-doc | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ (Apr 23, 2026); binding page (Oct 12, 2026) | 10-19 |
| Static asset billing | Requests served as static assets are free and unlimited; no storage cost. Limits (Free): 20,000 files per Worker version, 25 MiB per file | V-doc | pricing page (Oct 2, 2026); limits page (Oct 12, 2026) | 10-19 |
| Custom domains | `"routes": [{ "pattern": "api.tanren.me", "custom_domain": true }]`, several per Worker allowed. Needs an active Cloudflare zone. Cannot be created on a hostname with an existing CNAME record. Exact host match only (no wildcard), all paths go to the Worker. 100 custom domains per zone, 1,000 routes per zone | V-doc | https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ (Sep 29, 2026); limits page | 10-19 |
| Config with routes accepted | `wrangler deploy --dry-run` accepts the three-domain `routes` block plus `secrets.required` (offline; domains not attached) | V-run | spike `wrangler.prod.jsonc` | 10-19 |
| `workers_dev` | defaults to `true` when there is no `route`/`routes`, else `false` | V-doc | config page | 10-19 |
| Local origin with routes | When a custom-domain route is configured, `wrangler dev` makes the Worker see `request.url` as `http://api.tanren.me/...` (host rewritten from the first route). Executed fixes: `wrangler dev --local-upstream 127.0.0.1:PORT`, or `"dev": { "host": "127.0.0.1:PORT" }`, or routes only under `env.production`. The documented `--infer-origin-from-routes=false` is **rejected** by 4.151.2 | V-run, V-doc | config page "Local development settings"; wrangler commands page (Oct 18, 2026); spike echo Workers | 10-19 |
| Env access at module scope | `import { env } from "cloudflare:workers"`; secrets and variables are readable at top level; binding methods (I/O) are not callable there; bindings can become stale in module-scope derivatives after a binding-only deploy (Cloudflare's example recreates clients per request) | V-doc | https://developers.cloudflare.com/workers/runtime-apis/bindings/ (Oct 12, 2026) | 10-19 |
| Types | Docs recommend `wrangler types` (generates `worker-configuration.d.ts`: `Env` from bindings plus runtime types for the compatibility date/flags, default path, `--check` for CI, `--strict-vars`). `@cloudflare/workers-types` 5.x exposes only the latest types and stays the choice for libraries. Executed: `Env { DB: D1Database; ASSETS: Fetcher }` generated; header "Runtime types generated with workerd@1.20261019.1 2026-10-19"; `Cloudflare.GlobalProps.mainModule` emitted | V-doc, V-run | https://developers.cloudflare.com/workers/languages/typescript/ (Oct 9, 2026); wrangler commands page `types` | 10-19 |
| Type-check settings | `tsc` passes with `types: ["./worker-configuration.d.ts"]` and `lib` = `["es2022"]`, with DOM added, or with `lib` unset, under the repo's strict base options **only with `skipLibCheck: true`** (already in `tsconfig.base.json`). With `skipLibCheck: false`: 99 errors without `@types/node` and 230 with it (`@effect/platform` v3 needs DOM `Storage`/`Transferable`, `@types/node` duplicates workerd globals, `drizzle-kit` types need Node `tls`). `@types/node` is not needed for app code | V-run | spike, spike4 | 10-19 |
| `@effect/sql-d1` and workers-types | v3 `@effect/sql-d1@0.50.0` depends on `@cloudflare/workers-types ^4.20250515.0` (nested copy 4.20260702.1 next to the generated types); `D1Client.layer({ db: env.DB })` still type-checks with generated `D1Database`. v4 `@effect/sql-d1@4.0.5` depends on `^5.20261010.1` | V-run, V-npm | `npm view @effect/sql-d1@... dependencies`; tsc | 10-19 |
| `secrets` property | `"secrets": { "required": ["BETTER_AUTH_SECRET"] }`: declares required names; `wrangler types` then generates typed `Env` entries (and a `ProcessEnv` pick) **without reading `.dev.vars`/`.env`**; `wrangler deploy` fails if a required secret is not set on the Worker (not executed: needs credentials) | V-doc, V-run | config page "Secrets"; spike `wrangler.prod.jsonc` typegen output | 10-19 |
| `.dev.vars` | In the directory of the wrangler config; `.dev.vars` or `.env`, not both; `.dev.vars.<env>` per environment; dotenv syntax; must be git-ignored. With `secrets.required`, only listed keys are loaded and a missing key prints `Missing required secrets: ...` as a warning. Executed with dummy values: declared key visible at module scope and in the handler, an undeclared key in the same file was not loaded, no file means values come from `process.env`; wrangler prints bindings as `("(hidden)")` | V-doc, V-run | config page; spike `secretcheck` | 10-19 |
| `wrangler secret put` | `wrangler secret put <KEY>` prompts for the value or reads piped stdin; creates and deploys a new Worker version; needs auth, so owner-only | V-doc | https://developers.cloudflare.com/workers/wrangler/commands/workers/ (Oct 18, 2026) | 10-19 |
| Bundle and startup (Effect 4 spike) | `wrangler deploy --dry-run`: `Total Upload: 1164.15 KiB / gzip: 236.39 KiB` (HttpApi + `D1Client` + SqlSchema); Effect 3 spike with Drizzle: 1549.31 KiB / gzip 300.29 KiB. Limits: 64 MiB uncompressed, startup 1 s. `wrangler check startup` (local CPU, not representative of Cloudflare): 31-39 ms active, window 55-63 ms | V-run, V-doc | limits page; spikes | 10-19 |
| Monorepo bundling | A symlinked workspace package whose `exports` point at TypeScript source (`"./src/index.ts"`, no build step) bundles and runs under `wrangler dev` and `deploy --dry-run` (224.94 KiB) | V-run | spike `mono` | 10-19 |

### One Worker or several

Facts that decide it:

| Fact | Status | Source |
|---|---|---|
| The 100,000 requests/day Free limit is per account across all Workers, so splitting does not multiply it. 100 Workers per account on Free | V-doc | limits page (Oct 12, 2026) |
| Static asset requests are free and unlimited only when no Worker script runs for them | V-doc | pricing page; billing-and-limitations page |
| A SPA-fallback Worker swallows browser navigations to non-asset paths unless `run_worker_first` lists them. Magic-link verification links and OAuth `/authorize` redirects are navigations | V-run (mechanism), INF (that Better Auth and workers-oauth-provider use top-level navigations for these) |  spike; Better Auth/OAuth flow knowledge, not read from a source in this note |
| With a custom-domain route configured, `wrangler dev` shows one hostname only, so hostname dispatch inside a single Worker cannot be exercised locally with real hosts | V-run | spike echo Workers |
| Custom domains can be attached to the same Worker several times; each hostname maps to exactly one Worker | V-doc | custom-domains page |
| A bigger bundle costs startup time and a Worker only pays CPU for what runs | INF | limits page ("Larger bundles ... increase startup time") |

Options:

| Option | Shape | For | Against |
|---|---|---|---|
| A (recommended, INF; needs an ADR) | `tanren-api` = `apps/worker` on `api.tanren.me` (step 3); `tanren-mcp` on `mcp.tanren.me` (step 4) as a second entry file plus `wrangler.mcp.jsonc` in the same package, same `database_id`; `tanren-web` assets-only Worker on `tanren.me` (step 7, no `main`, `apps/worker/wrangler.web.jsonc`) | No navigation gotcha, no hostname dispatch code, lean isolates per concern, static hosting stays free and unlimited | three configs and deploys; web at `tanren.me` calling `api.tanren.me` is cross-origin (CORS, cookie domain `.tanren.me` for Better Auth: INF) |
| B | One Worker with `assets` (SPA) on all three hostnames and `run_worker_first: ["/api/*", "/authorize", "/token", "/register", "/.well-known/*", "/mcp*"]` | one deploy; pattern mechanism verified for `/api/*` | every hostname serves the SPA for unmatched paths; hostname dispatch needed; each matched request is a billed Worker request (and a 429 past the daily limit) |
| C | API + MCP in one Worker (path or host dispatch), web separate | two deploys | MCP SDK and OAuth provider load into every API isolate (INF) |

For step 3 only the API Worker exists, so the choice is cheap to defer: build `apps/worker` as the API Worker and
add the others at steps 4 and 7.

## 2. D1: local dev, migrations, limits, Durable Objects on Free (question 2)

| Item | Value | Status | Source | Checked |
|---|---|---|---|---|
| Local D1 | `wrangler dev` runs the Worker in local `workerd` (Miniflare) with a local D1 "running the same version of D1 as Cloudflare runs globally"; the local session cannot see production data unless a binding sets `"remote": true` | V-doc, V-run | https://developers.cloudflare.com/d1/best-practices/local-development/ (Jun 25, 2026) | 10-19 |
| Local state | `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite` in the cwd/config dir (hash derived from `database_id`); persists across runs; delete `.wrangler/state` to reset; `--persist-to <dir>` must be repeated on every wrangler command that touches the same data (`wrangler dev` adds a `v3` subdirectory) | V-doc, V-run | https://developers.cloudflare.com/workers/development-testing/local-data/; spike | 10-19 |
| Default scope | `wrangler d1 migrations list/apply` and `d1 execute` with **no flag act on the local DB**: output says "Resource location: local. Use --remote if you want to access the remote instance." `--remote` is required for production | V-run | wrangler 4.151.2 | 10-19 |
| Commands | `wrangler d1 create <NAME> [--location weur\|eeur\|apac\|oc\|wnam\|enam] [--jurisdiction eu\|fedramp\|us] [--update-config] [--binding]` (remote, needs auth); `wrangler d1 migrations create <DB> <MESSAGE>`; `migrations list <DB> [--local\|--remote\|--preview] [--persist-to]`; `migrations apply <DB> [same flags]`; `wrangler d1 execute <DB> --command <sql> \| --file <f> [--local\|--remote] [--json] [--persist-to]`. `<DB>` may be the binding or the database name (database name recommended: it cannot change) | V-doc | https://developers.cloudflare.com/d1/wrangler-commands/ (Apr 21, 2026); migrations page (Jun 8, 2026) | 10-19 |
| `migrations apply` behavior | Confirms before applying (non-interactive shells fall back to yes: executed); a migration that errors is rolled back and earlier ones stay applied; a backup is captured after applying; applied names go to table `d1_migrations(id, name, applied_at)` | V-doc, V-run | commands page; spike | 10-19 |
| Migration files | Default folder `migrations/`, top-level `*.sql`, applied in filename order. `migrations_pattern` (glob, requires `migrations_dir`, must start with it) supports nested layouts such as Drizzle 1.0 `migrations/*/migration.sql`; names are recorded relative to `migrations_dir`. `wrangler d1 migrations create` writes only top-level files | V-doc, V-run | https://developers.cloudflare.com/d1/reference/migrations/ (Jun 8, 2026) | 10-19 |
| Foreign keys | D1 enforces them in every query and migration (like `PRAGMA foreign_keys = on`); `PRAGMA defer_foreign_keys = on` defers checks to the end of the current transaction. Executed: child-before-parent insert failed with `FOREIGN KEY constraint failed`; with the pragma first it succeeded; inside `D1Client.batch` (Effect 4) the failing batch rolled back to 0 rows and the batch with the pragma as first statement committed | V-doc, V-run | https://developers.cloudflare.com/d1/sql-api/foreign-keys/ (Apr 21, 2026); spike4 | 10-19 |
| `batch()` | "Batched statements are SQL transactions. If a statement in the sequence fails ... it aborts or rolls back the entire sequence"; one call = one round trip | V-doc | https://developers.cloudflare.com/d1/worker-api/d1-database/ (Jun 22, 2026) | 10-19 |
| Bound parameters | Max 100 per query. Executed locally through `D1Client` (Effect 3 and 4) and through Drizzle: a multi-row insert with 12 rows x 8 columns = 96 parameters succeeds, 13 x 8 = 104 fails with `D1_ERROR: too many SQL variables at offset 394: SQLITE_ERROR` | V-doc, V-run | https://developers.cloudflare.com/d1/platform/limits/ (Apr 21, 2026); spikes | 10-19 |
| D1 free limits | rows read **5,000,000/day**; rows written **100,000/day**; storage **5 GB total**; max DB size **500 MB**; databases per account **10**; Time Travel 7 days; queries per Worker invocation **50**; row/string/BLOB max 2 MB; 100 columns per table; SQL statement max 100 KB; max query duration 30 s. Free limits reset at 00:00 UTC; past the limit queries return errors. Indexes add one written row per indexed write. A D1 database is single-threaded (1 ms queries = at most 1,000 per second) | V-doc | https://developers.cloudflare.com/d1/platform/pricing/ and /limits/ (both Apr 21, 2026) | 10-19 |
| Queries vs subrequests | D1 calls count as subrequests: Free allows 50 subrequests per invocation and 1,000 to internal services; the D1 page states 50 queries per invocation on Free. Whether one `batch()` counts as one query is not stated | V-doc, UNK | limits pages | 10-19 |
| Durable Objects on Free | **Yes, SQLite-backed only.** Free: 100,000 requests/day, 13,000 GB-s/day duration, SQLite rows read 5,000,000/day, rows written 100,000/day, stored data 5 GB total, 100 classes, 10 GB per object. Key-value backed DOs only for accounts that already have one | V-doc | https://developers.cloudflare.com/durable-objects/platform/pricing/ (Oct 18, 2026); /limits/ (Jun 1, 2026) | 10-19 |
| DO CPU on Free | The DO limits page lists 30 s CPU per request but also says "Durable Objects are a special kind of Worker, so Workers Limits apply according to your Workers plan" (Free = 10 ms) | V-doc, INF | limits pages | 10-19 |
| Seed / Node access to local D1 | `getPlatformProxy({ configPath, persist: { path: "<dir>/.wrangler/state/v3" }, remoteBindings: false })` from `wrangler` gives `env.DB` backed by the same local SQLite as `wrangler dev`. Without `persist.path` it uses `<cwd>/.wrangler`, **not** the config's directory (executed from `packages/db`: `no such table`). `remoteBindings` defaults to `true`, so always pass `false` in scripts. Executed: Effect `D1Client` + queries from a Node script, data visible to the running dev server | V-doc, V-run | https://developers.cloudflare.com/workers/wrangler/api/ (Oct 12, 2026); spikes | 10-19 |
| Running TypeScript scripts | Node 24.21 runs `.ts` natively (type stripping) but cannot resolve the repo's extensionless relative imports (`ERR_MODULE_NOT_FOUND`); `tsx@4.23.15` runs them under pnpm with esbuild's build script disabled | V-run | spike4 | 10-19 |

## 3. Drizzle on D1 (question 3)

| Item | Value | Status | Source | Checked |
|---|---|---|---|---|
| Versions | `drizzle-orm` **0.45.4** (2026-10-08), `drizzle-kit` **0.31.11** (2026-09-21) are `latest`. Pre-releases: dist-tag `rc` = `1.0.0-rc.4` (2026-06-27), `beta` = `1.0.0-beta.22`, preview tag `rc5` = `1.0.0-rc.5-5935859` (2026-09-09) for both packages | V-npm | `npm view drizzle-orm dist-tags time`; same for drizzle-kit | 10-19 |
| Docs describe v1 RC | The Drizzle docs site (D1 page, get-started, config, column types, migrations) is the **1.0 RC** version ("Upgrade to v1.0 RC" banner; installs `drizzle-orm@rc`). Layout and APIs for 0.45.4 / 0.31.11 were therefore verified by execution, not by those pages | V-doc | https://orm.drizzle.team/docs/connect-cloudflare-d1 ; /docs/get-started/d1-new ; /docs/guides/d1-http-with-drizzle-kit ; /docs/column-types/sqlite | 10-19 |
| Runtime driver (promise API) | `import { drizzle } from "drizzle-orm/d1"; const orm = drizzle(env.DB)`; `orm.select()...`, `orm.batch([...])` (atomic, wraps `D1Database.batch`). Executed on the D1 binding in `wrangler dev`: `batch ok: 2 statements`. The API does not depend on the Effect version | V-run | spike `spike` | 10-19 |
| `drizzle.config.ts` for `generate` | `defineConfig({ dialect: "sqlite", schema: "./src/db/schema.ts", out: "./migrations" })`. No driver, no credentials needed | V-run | spike | 10-19 |
| `driver: "d1-http"` | `defineConfig({ dialect: "sqlite", driver: "d1-http", dbCredentials: { accountId, databaseId, token } })` is for `migrate`, `push`, `pull`, `studio` against the **remote** DB over Cloudflare's HTTP API; needs an API token with D1 edit permission (owner-only secret). Type-checks in 0.31.11; not executed (no credentials) | V-doc, V-run | https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit; spike | 10-19 |
| Pointing at the local sqlite file | `dbCredentials: { url: ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite" }`. drizzle-kit needs `better-sqlite3` or `@libsql/client` installed for sqlite URLs ("Please install either 'better-sqlite3' or '@libsql/client' for Drizzle Kit to connect to SQLite databases"). Config type-checks; not executed (native module, only useful for Studio) | V-src, V-run | drizzle-kit 0.31.11 `bin.cjs`; spike | 10-19 |
| Generated layout, 0.31.11 | `migrations/0000_<name>.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`; flat, so wrangler's default `migrations/*.sql` applies it. The SQL contains `--> statement-breakpoint` comments; D1 accepted a 4-statement file ("4 commands executed successfully") | V-run | spike | 10-19 |
| Generated layout, 1.0 RC | `migrations/<timestamp>_<name>/migration.sql` plus `snapshot.json`; needs `"migrations_dir": "migrations", "migrations_pattern": "migrations/*/migration.sql"`; executed with rc.4: wrangler listed and applied `20261019194959_init/migration.sql` | V-doc, V-run | D1 migrations page; spike4x | 10-19 |
| Workflow | `drizzle-kit generate --name <slug>` writes the SQL; `wrangler d1 migrations apply <DB> --local` applies it; `--remote` is the owner's step. Executed end to end for both layouts | V-run | spikes | 10-19 |
| Hand-written SQL | `drizzle-kit generate --custom --name seed_data` creates an empty `0001_seed_data.sql` and registers it in the journal | V-run | spike | 10-19 |
| Traps | (1) `wrangler d1 migrations create` into the same folder picked `0002_manual_change.sql` while a later `drizzle-kit generate` also produced `0002_add_note.sql`: two `0002_` files, both listed for apply, journal unaware of one. (2) Drizzle's own migrator tracks `__drizzle_migrations`, wrangler tracks `d1_migrations`; `drizzle-kit migrate`/`push` against D1 bypass wrangler's tracking | V-run, V-src | spike; `drizzle-orm@0.45.4` `sqlite-core/dialect.js` | 10-19 |
| Timestamp column modes | `integer(name, { mode: 'number' \| 'timestamp' \| 'timestamp_ms' \| 'boolean' })`; the two timestamp modes map to a JS `Date`, `number` stays a number; `text` with `.default(sql\`(CURRENT_TIMESTAMP)\`)` gives `YYYY-MM-DD HH:MM:SS` text | V-src, V-doc | `drizzle-orm@0.45.4` `sqlite-core/columns/integer.d.ts`; https://orm.drizzle.team/docs/column-types/sqlite | 10-19 |
| ISO text is sortable | Effect `DateTime.formatIso(DateTime.makeUnsafe(ms))` always returns 24 characters, UTC, milliseconds, `Z` (7 samples incl. ms boundaries): lexicographic order equals chronological order. `Schema.DateTimeUtcFromString` decodes it; `Schema.DateTimeUtcFromMillis` (v4; v3 name `DateTimeUtcFromNumber`) covers integer columns | V-run, V-src | effect 4.0.5 and 3.22.3 | 10-19 |
| Second resolution default | `CURRENT_TIMESTAMP` has one-second resolution and a space separator: unsuitable for `updated_at` last-write-wins | INF | SQLite semantics shown in the Drizzle docs snippet | 10-19 |

### Timestamp recommendation (INF, owner/ADR-level)

Store `created_at`, `updated_at`, `deleted_at` as **ISO-8601 UTC text with milliseconds** (`text("created_at")`).
Reasons: the shared `Timestamp` is `Schema.DateTimeUtcFromString` and `@tanren/db` says "the schema is the truth,
the table follows", so `SqlSchema` can decode rows with the shared schema unchanged (verified: rows decode and
re-encode as ISO); the same text works in expo-sqlite and on the wire; fixed width makes `updated_at > ?` correct as a
string comparison. Cost: 24 bytes instead of 8 per value. Alternative: `integer({ mode: "number" })` epoch
milliseconds plus a second row schema with `DateTimeUtcFromMillis`. Avoid `timestamp`/`timestamp_ms` modes
(they hand back mutable `Date`) and avoid `CURRENT_TIMESTAMP` defaults.
