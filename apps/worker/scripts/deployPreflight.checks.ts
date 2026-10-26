/**
 * Pure decision logic of `pnpm deploy:preflight` (docs/design/deploy.md). No I/O: the entry point
 * (`deployPreflight.ts`) gathers facts and these functions turn them into checklist rows.
 */
import { Array as Arr, Option, Schema } from "effect"

export type Status = "ok" | "fail" | "info"

export interface Check {
  readonly id: string
  readonly status: Status
  readonly label: string
  readonly detail: string
  /** The exact command (or action) that fixes a failing row. */
  readonly next: Option.Option<string>
}

const row = (
  id: string,
  status: Status,
  label: string,
  detail: string,
  next: Option.Option<string> = Option.none(),
): Check => ({ id, status, label, detail, next })

const ok = (id: string, label: string, detail = "") => row(id, "ok", label, detail)
const fail = (id: string, label: string, detail: string, next: string) =>
  row(id, "fail", label, detail, Option.some(next))
const info = (id: string, label: string, detail: string, next?: string) =>
  row(id, "info", label, detail, Option.fromNullishOr(next))

/* ---------- JSONC ---------- */

/**
 * Minimal JSONC reader: there is no `jsonc-parser` in the lockfile. Strips `//` and block comments
 * and trailing commas, skipping string literals so `"https://..."` survives.
 */
export const stripJsonc = (text: string): string =>
  text
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => (m.startsWith('"') ? m : ""))
    .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (m, tail: string | undefined) =>
      m.startsWith('"') ? m : (tail ?? ""),
    )

const Route = Schema.Struct({
  pattern: Schema.String,
  custom_domain: Schema.optionalKey(Schema.Boolean),
})

const ProductionEnv = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  routes: Schema.optionalKey(Schema.Array(Route)),
  vars: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  triggers: Schema.optionalKey(
    Schema.Struct({ crons: Schema.optionalKey(Schema.Array(Schema.String)) }),
  ),
  d1_databases: Schema.optionalKey(
    Schema.Array(Schema.Struct({ binding: Schema.String, database_id: Schema.String })),
  ),
  kv_namespaces: Schema.optionalKey(
    Schema.Array(Schema.Struct({ binding: Schema.String, id: Schema.String })),
  ),
})

/** Only the parts of a wrangler config the preflight reads. */
export const WranglerConfig = Schema.Struct({
  assets: Schema.optionalKey(Schema.Struct({ directory: Schema.String })),
  env: Schema.optionalKey(Schema.Struct({ production: Schema.optionalKey(ProductionEnv) })),
})
export type WranglerConfig = typeof WranglerConfig.Type

export const parseWrangler = (text: string): Option.Option<WranglerConfig> =>
  Schema.decodeUnknownOption(Schema.fromJsonString(WranglerConfig))(stripJsonc(text))

/* ---------- 2. wrangler.jsonc env.production ---------- */

export const ZERO_D1_ID = "00000000-0000-4000-8000-000000000000"
export const MCP_RESOURCE_URL = "https://mcp.tanren.me/mcp"
const EDIT = "edit apps/worker/wrangler.jsonc env.production (docs/design/deploy.md §2)"

const isPlaceholder = (value: string): boolean =>
  value.trim() === "" || value.startsWith("<") || value === ZERO_D1_ID || value === "local-oauth-kv"

/** Native sign-in codes may go only to this Expo Go origin (docs/design/deploy.md §2). */
export const NATIVE_PREFIX_ROOT = "exps://u.expo.dev/"
export const PROD_ORIGIN = "https://tanren.me"
export const MAIL_DOMAIN = "tanren.me"

const csv = (value: string): ReadonlyArray<string> =>
  Arr.filter(
    Arr.map(value.split(","), (part) => part.trim()),
    (part) => part !== "",
  )

/** `exps://u.expo.dev/<projectId>/`: the project path is required and no placeholder is left. */
export const isNativePrefixes = (value: string): boolean => {
  const entries = csv(value)
  return (
    Arr.isReadonlyArrayNonEmpty(entries) &&
    Arr.every(
      entries,
      (entry) =>
        entry.startsWith(NATIVE_PREFIX_ROOT) &&
        entry.length > NATIVE_PREFIX_ROOT.length &&
        !entry.includes("<owner:") &&
        !entry.includes("<") &&
        !entry.includes(">"),
    )
  )
}

/** Accepts `login@tanren.me` and `Name <login@tanren.me>`. */
export const isTanrenSender = (value: string): boolean =>
  new RegExp(`^(?:[^<>]*<)?[^\\s<>@]+@${MAIL_DOMAIN.replace(".", "\\.")}>?$`).test(value.trim())

const isLocal = (value: string): boolean => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(value)

/** An owner-fill placeholder (`<owner: …>`) or an empty value is not a real Strava client id. */
const isStravaClientId = (value: string): boolean =>
  value.trim() !== "" && !value.includes("<") && !value.includes(">")

/**
 * The client id is required only in `provider` mode. In `console` mode the placeholder is accepted
 * (it still loads in Config.ts) and the row says exports are only logged until O1/O2.
 */
const stravaClientIdChecks = (vars: Readonly<Record<string, string>>): ReadonlyArray<Check> => {
  const id = "prod.var.STRAVA_CLIENT_ID"
  const label = "env.production.vars.STRAVA_CLIENT_ID"
  return vars.STRAVA_MODE === "console"
    ? [ok(id, label, "console: exports are only logged until O1/O2")]
    : [
        varCheck(
          vars,
          "STRAVA_CLIENT_ID",
          isStravaClientId,
          "the Client ID from strava.com/settings/api (owner step O2, docs/design/deploy.md §Strava secrets)",
        ),
      ]
}

/** Secrets live in Cloudflare (`wrangler secret put`); a var would be readable in the config and the dashboard. */
export const STRAVA_SECRETS_NOT_VARS = ["INTEGRATION_TOKEN_KEY", "STRAVA_CLIENT_SECRET"] as const

const notAVar = (vars: Readonly<Record<string, string>>, name: string): Check =>
  name in vars
    ? fail(
        `prod.novar.${name}`,
        `${name} is not in env.production.vars`,
        "present as a plain var",
        `${EDIT}: delete it, then cd apps/worker && pnpm exec wrangler secret put ${name} --env production`,
      )
    : ok(`prod.novar.${name}`, `${name} is not in env.production.vars`)

const hasCustomDomain = (config: ProductionBlock, pattern: string): boolean =>
  Arr.some(
    config.routes ?? [],
    (route) => route.pattern === pattern && route.custom_domain === true,
  )

type ProductionBlock = NonNullable<NonNullable<WranglerConfig["env"]>["production"]>

const varCheck = (
  vars: Readonly<Record<string, string>>,
  name: string,
  accept: (value: string) => boolean,
  expected: string,
): Check => {
  const value = vars[name]
  return value === undefined
    ? fail(`prod.var.${name}`, `env.production.vars.${name}`, "missing", `${EDIT}: set ${expected}`)
    : accept(value)
      ? ok(`prod.var.${name}`, `env.production.vars.${name}`, value)
      : fail(
          `prod.var.${name}`,
          `env.production.vars.${name}`,
          `got "${value}"`,
          `${EDIT}: set ${expected}`,
        )
}

export const checkProduction = (config: Option.Option<WranglerConfig>): ReadonlyArray<Check> => {
  const production = Option.flatMap(config, (c) => Option.fromNullishOr(c.env?.production))
  if (Option.isNone(config)) {
    return [fail("prod.block", "wrangler.jsonc readable", "could not parse", EDIT)]
  }
  if (Option.isNone(production)) {
    return [fail("prod.block", "wrangler.jsonc env.production block", "missing", EDIT)]
  }
  const block = production.value
  const vars = block.vars ?? {}
  const d1 = Arr.findFirst(block.d1_databases ?? [], (d) => d.binding === "DB")
  const kv = Arr.findFirst(block.kv_namespaces ?? [], (k) => k.binding === "OAUTH_KV")
  return [
    ok("prod.block", "wrangler.jsonc env.production block", "present"),
    varCheck(vars, "ENVIRONMENT", (v) => v === "production", '"production"'),
    varCheck(
      vars,
      "BETTER_AUTH_URL",
      (v) => v.startsWith("https://") && !isLocal(v),
      '"https://api.tanren.me"',
    ),
    varCheck(
      vars,
      "ALLOWED_ORIGINS",
      (v) => {
        const origins = csv(v)
        return origins.length === 1 && origins[0] === PROD_ORIGIN
      },
      `"${PROD_ORIGIN}" only (no localhost, no other origin)`,
    ),
    // Config.ts accepts "console" | "provider"; "provider" is the Resend mode (deploy.md §2).
    varCheck(vars, "EMAIL_MODE", (v) => v === "provider", '"provider" (Resend)'),
    varCheck(
      vars,
      "EMAIL_FROM",
      isTanrenSender,
      `a sender on ${MAIL_DOMAIN}, e.g. "Tanren <login@tanren.me>"`,
    ),
    varCheck(vars, "MCP_RESOURCE_URL", (v) => v === MCP_RESOURCE_URL, `"${MCP_RESOURCE_URL}"`),
    varCheck(
      vars,
      "NATIVE_RETURN_PREFIXES",
      isNativePrefixes,
      `"${NATIVE_PREFIX_ROOT}<projectId>/" with the id from eas init (apps/mobile/app.json extra.eas.projectId)`,
    ),
    // Strava export (docs/design/deploy.md §Strava secrets): Config.ts accepts "console" | "provider".
    // Production runs "console" (only logs, never calls Strava) until the owner has a Strava app
    // (O1/O2); then "provider" with a real client id.
    varCheck(
      vars,
      "STRAVA_MODE",
      (v) => v === "provider" || v === "console",
      '"console" or "provider"',
    ),
    ...stravaClientIdChecks(vars),
    ...Arr.map(STRAVA_SECRETS_NOT_VARS, (name) => notAVar(vars, name)),
    Arr.isReadonlyArrayNonEmpty(block.triggers?.crons ?? [])
      ? ok("prod.crons", "env.production.triggers.crons", (block.triggers?.crons ?? []).join(", "))
      : fail(
          "prod.crons",
          "env.production.triggers.crons",
          "missing or empty: the export queue would never drain",
          `${EDIT}: "triggers": { "crons": ["*/5 * * * *"] } (a named env may not inherit the top-level triggers)`,
        ),
    Option.match(d1, {
      onNone: () => fail("prod.d1", "D1 binding DB", "missing", EDIT),
      onSome: (d) =>
        isPlaceholder(d.database_id)
          ? fail(
              "prod.d1",
              "D1 database_id",
              `placeholder "${d.database_id}"`,
              "cd apps/worker && pnpm exec wrangler d1 create tanren   # then paste database_id",
            )
          : ok("prod.d1", "D1 database_id", d.database_id),
    }),
    Option.match(kv, {
      onNone: () => fail("prod.kv", "KV binding OAUTH_KV", "missing", EDIT),
      onSome: (k) =>
        isPlaceholder(k.id)
          ? fail(
              "prod.kv",
              "KV OAUTH_KV id",
              `placeholder "${k.id}"`,
              "cd apps/worker && pnpm exec wrangler kv namespace create OAUTH_KV   # then paste id",
            )
          : ok("prod.kv", "KV OAUTH_KV id", k.id),
    }),
    ...Arr.map(["api.tanren.me", "mcp.tanren.me"], (host) =>
      hasCustomDomain(block, host)
        ? ok(`prod.route.${host}`, `route ${host}`, "custom domain")
        : fail(
            `prod.route.${host}`,
            `route ${host}`,
            "no custom_domain route",
            `${EDIT}: { "pattern": "${host}", "custom_domain": true }`,
          ),
    ),
  ]
}

export const checkWeb = (config: Option.Option<WranglerConfig>): ReadonlyArray<Check> => {
  const directory = Option.flatMap(config, (c) => Option.fromNullishOr(c.assets?.directory))
  const routes = Option.flatMap(config, (c) => Option.fromNullishOr(c.env?.production?.routes))
  const fix = "edit apps/worker/wrangler.web.jsonc (docs/design/deploy.md §2)"
  return [
    Option.exists(directory, (d) => d === "../mobile/dist")
      ? ok("web.assets", "wrangler.web.jsonc assets", "../mobile/dist")
      : fail(
          "web.assets",
          "wrangler.web.jsonc assets",
          Option.getOrElse(directory, () => "none"),
          fix,
        ),
    Option.exists(routes, (rs) =>
      Arr.some(rs, (r) => r.pattern === "tanren.me" && r.custom_domain === true),
    )
      ? ok("web.route", "wrangler.web.jsonc route tanren.me", "custom domain")
      : fail("web.route", "wrangler.web.jsonc route tanren.me", "missing", fix),
  ]
}

/* ---------- 3. secrets ---------- */

export const SECRETS = [
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "STRAVA_CLIENT_SECRET",
  "INTEGRATION_TOKEN_KEY",
] as const

/** Where the value of a secret comes from, appended to its command (docs/design/deploy.md §3, §Strava secrets). */
const SECRET_HINT: Readonly<Record<(typeof SECRETS)[number], string>> = {
  BETTER_AUTH_SECRET: "   # openssl rand -base64 32",
  RESEND_API_KEY: "   # from Resend",
  STRAVA_CLIENT_SECRET:
    '   # Client Secret from strava.com/settings/api; not needed while STRAVA_MODE is "console" (only before the flip to "provider")',
  INTEGRATION_TOKEN_KEY:
    "   # value: openssl rand -base64 32 (keep a copy: losing it forces a Strava reconnect)",
}

/** `wrangler secret list` needs a login, so secrets are listed, never verified. */
export const checkSecrets = (devVarsFound: ReadonlyArray<string>): ReadonlyArray<Check> => [
  ...Arr.map(SECRETS, (name) =>
    info(
      `secret.${name}`,
      `secret ${name}`,
      "not verifiable without a login; run it once",
      `cd apps/worker && pnpm exec wrangler secret put ${name} --env production${SECRET_HINT[name]}`,
    ),
  ),
  Arr.isReadonlyArrayEmpty(devVarsFound)
    ? ok("secret.devvars", "no .dev.vars.production in the tree")
    : info(
        "secret.devvars",
        ".dev.vars.production exists",
        `${devVarsFound.join(", ")}: not needed, secrets live in Cloudflare; keep it out of git`,
      ),
]

/* ---------- 4. DNS ---------- */

export type DnsResult =
  | { readonly _tag: "Resolved"; readonly addresses: ReadonlyArray<string> }
  | { readonly _tag: "Unresolved"; readonly code: string }

/** Never fatal: Workers custom domains create the records on the first deploy. */
export const checkDns = (host: string, result: DnsResult): Check =>
  result._tag === "Resolved"
    ? ok(`dns.${host}`, `DNS ${host}`, result.addresses.join(", "))
    : info(
        `dns.${host}`,
        `DNS ${host}`,
        `not resolved yet (${result.code}); created by the first deploy`,
      )

/* ---------- 5. web export ---------- */

export const EXPORT_MAX_AGE_MS = 2 * 60 * 60 * 1000
const EXPORT_CMD = "EXPO_PUBLIC_API_URL=https://api.tanren.me pnpm web:export"

export const checkExport = (
  mtimeMs: Option.Option<number>,
  nowMs: number,
  maxAgeMs: number = EXPORT_MAX_AGE_MS,
): Check =>
  Option.match(mtimeMs, {
    onNone: () => fail("export", "web export apps/mobile/dist/index.html", "missing", EXPORT_CMD),
    onSome: (mtime) => {
      const ageMin = Math.round((nowMs - mtime) / 60_000)
      return nowMs - mtime > maxAgeMs
        ? fail(
            "export",
            "web export apps/mobile/dist/index.html",
            `stale (${ageMin} min old)`,
            EXPORT_CMD,
          )
        : ok("export", "web export apps/mobile/dist/index.html", `${ageMin} min old`)
    },
  })

/**
 * The API base URL is inlined at export time, so a bundle built without
 * `EXPO_PUBLIC_API_URL=https://api.tanren.me` talks to localhost. `scan` is `None` when
 * `apps/mobile/dist` does not exist (the export row already fails then), else whether any file in
 * it contains `api.tanren.me`.
 */
export const checkExportApiUrl = (scan: Option.Option<boolean>): Check =>
  Option.match(scan, {
    onNone: () =>
      info("export.apiUrl", "web export targets api.tanren.me", "skipped (no apps/mobile/dist)"),
    onSome: (found) =>
      found
        ? ok("export.apiUrl", "web export targets api.tanren.me", "found in apps/mobile/dist")
        : fail(
            "export.apiUrl",
            "web export targets api.tanren.me",
            "not found in apps/mobile/dist: built without EXPO_PUBLIC_API_URL",
            EXPORT_CMD,
          ),
  })

/* ---------- 6. wrangler whoami ---------- */

export interface WhoamiRun {
  readonly stdout: string
  readonly exitCode: number
  readonly timedOut: boolean
}

const LOGIN = "cd apps/worker && pnpm exec wrangler login"

export const checkWhoami = (run: WhoamiRun): Check => {
  const text = run.stdout
  const prompting = /\[y\/n\]|\(y\/n\)|press enter|open the browser|\? \(/i.test(text)
  return run.timedOut || prompting
    ? fail(
        "whoami",
        "wrangler logged in",
        run.timedOut ? "timed out (10 s)" : "prompt-like output",
        LOGIN,
      )
    : /not authenticated|not logged in|wrangler login/i.test(text) || run.exitCode !== 0
      ? fail("whoami", "wrangler logged in", "not logged in", LOGIN)
      : /logged in|account (name|id)/i.test(text)
        ? ok("whoami", "wrangler logged in", "authenticated")
        : fail("whoami", "wrangler logged in", "unrecognised output", LOGIN)
}

/* ---------- 1. gate ---------- */

export const checkGate = (result: Option.Option<{ readonly exitCode: number }>): Check =>
  Option.match(result, {
    onNone: () => info("gate", "pnpm check", "skipped (--skip-gate)", "pnpm check"),
    onSome: ({ exitCode }) =>
      exitCode === 0
        ? ok("gate", "pnpm check", "green")
        : fail("gate", "pnpm check", `exit ${exitCode}`, "pnpm check   # fix the red stage first"),
  })

/* ---------- 7. owner session ---------- */

export interface SessionStep {
  readonly command: string
  readonly done: boolean
}

const allOk = (checks: ReadonlyArray<Check>, prefix: string): boolean => {
  const matching = Arr.filter(checks, (c) => c.id === prefix || c.id.startsWith(`${prefix}.`))
  return Arr.isReadonlyArrayNonEmpty(matching) && Arr.every(matching, (c) => c.status === "ok")
}

/** deploy.md §1–§6 in order; a step is done only when a check proves it, the rest stay open. */
export const ownerSession = (checks: ReadonlyArray<Check>): ReadonlyArray<SessionStep> => [
  { command: "Resend: verify tanren.me, create the API key (dashboard)", done: false },
  { command: "cd apps/worker && pnpm exec wrangler login", done: allOk(checks, "whoami") },
  {
    command:
      "pnpm exec wrangler d1 create tanren && pnpm exec wrangler kv namespace create OAUTH_KV",
    done: allOk(checks, "prod.d1") && allOk(checks, "prod.kv"),
  },
  {
    command:
      "paste both ids, the EAS project id (NATIVE_RETURN_PREFIXES) and the Strava client id (STRAVA_CLIENT_ID) into wrangler.jsonc env.production",
    done: allOk(checks, "prod"),
  },
  {
    command: SECRETS.map((s) => `pnpm exec wrangler secret put ${s} --env production`).join(" && "),
    done: false,
  },
  {
    command: "pnpm exec wrangler d1 migrations apply tanren --env production --remote",
    done: false,
  },
  { command: "pnpm exec wrangler deploy --env production", done: false },
  { command: "curl -i https://api.tanren.me/health   # 200; then the /mcp 401 check", done: false },
  { command: EXPORT_CMD, done: allOk(checks, "export") },
  {
    command: "cd apps/worker && pnpm exec wrangler deploy -c wrangler.web.jsonc --env production",
    done: false,
  },
  {
    command: "open https://tanren.me, sign in; Claude app: add the connector (deploy.md §5)",
    done: false,
  },
  {
    command:
      "cd apps/mobile && EXPO_PUBLIC_API_URL=https://api.tanren.me pnpm exec eas update --branch production",
    done: false,
  },
]
