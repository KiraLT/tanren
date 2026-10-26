import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { WorkerConfig } from "../src/Config"
import {
  type Check,
  checkDns,
  checkExport,
  checkExportApiUrl,
  checkGate,
  checkProduction,
  checkSecrets,
  checkWeb,
  checkWhoami,
  ownerSession,
  parseWrangler,
  stripJsonc,
} from "./deployPreflight.checks"

const production = (overrides: {
  readonly vars?: Record<string, string>
  readonly d1?: string
  readonly kv?: string
  readonly routes?: ReadonlyArray<{ pattern: string; custom_domain: boolean }>
  /** `undefined` = the default cron; `"absent"` = no `triggers` block at all. */
  readonly crons?: ReadonlyArray<string> | "absent"
}) =>
  JSON.stringify({
    env: {
      production: {
        ...(overrides.crons === "absent"
          ? {}
          : { triggers: { crons: overrides.crons ?? ["*/5 * * * *"] } }),
        routes: overrides.routes ?? [
          { pattern: "api.tanren.me", custom_domain: true },
          { pattern: "mcp.tanren.me", custom_domain: true },
        ],
        vars: {
          ENVIRONMENT: "production",
          BETTER_AUTH_URL: "https://api.tanren.me",
          ALLOWED_ORIGINS: "https://tanren.me",
          EMAIL_MODE: "provider",
          EMAIL_FROM: "Tanren <login@tanren.me>",
          MCP_RESOURCE_URL: "https://mcp.tanren.me/mcp",
          NATIVE_RETURN_PREFIXES: "exps://u.expo.dev/3f2c1a9e-1111-4222-8333-444455556666/",
          STRAVA_MODE: "provider",
          STRAVA_CLIENT_ID: "123456",
          ...overrides.vars,
        },
        d1_databases: [
          { binding: "DB", database_id: overrides.d1 ?? "3f2c1a9e-1111-4222-8333-444455556666" },
        ],
        kv_namespaces: [
          { binding: "OAUTH_KV", id: overrides.kv ?? "abcdef0123456789abcdef0123456789" },
        ],
      },
    },
  })

const failing = (checks: ReadonlyArray<Check>) =>
  checks.filter((c) => c.status === "fail").map((c) => c.id)

describe("stripJsonc", () => {
  it("drops comments and trailing commas but keeps urls inside strings", () => {
    const text = '{\n // note\n "u": "https://x.y", /* b */ "a": [1,],\n}'
    expect(JSON.parse(stripJsonc(text))).toEqual({ u: "https://x.y", a: [1] })
  })
})

describe("checkProduction", () => {
  it("passes a complete block with real ids", () => {
    expect(failing(checkProduction(parseWrangler(production({}))))).toEqual([])
  })

  it("fails on the zero D1 placeholder and the owner KV placeholder", () => {
    const checks = checkProduction(
      parseWrangler(
        production({ d1: "00000000-0000-4000-8000-000000000000", kv: "<owner: wrangler kv>" }),
      ),
    )
    expect(failing(checks)).toEqual(["prod.d1", "prod.kv"])
    const d1 = checks.find((c) => c.id === "prod.d1")
    expect(Option.getOrElse(d1?.next ?? Option.none(), () => "")).toContain("wrangler d1 create")
  })

  it("fails when ALLOWED_ORIGINS contains localhost", () => {
    const config = parseWrangler(
      production({ vars: { ALLOWED_ORIGINS: "https://tanren.me,http://localhost:8081" } }),
    )
    expect(failing(checkProduction(config))).toEqual(["prod.var.ALLOWED_ORIGINS"])
  })

  it("fails on a wrong MCP_RESOURCE_URL and on console email", () => {
    const config = parseWrangler(
      production({
        vars: { MCP_RESOURCE_URL: "http://localhost:8787/mcp", EMAIL_MODE: "console" },
      }),
    )
    expect(failing(checkProduction(config))).toEqual([
      "prod.var.EMAIL_MODE",
      "prod.var.MCP_RESOURCE_URL",
    ])
  })

  it("reports a missing var and a missing route", () => {
    const text = production({ routes: [{ pattern: "api.tanren.me", custom_domain: true }] })
    const checks = checkProduction(parseWrangler(text.replace(/"EMAIL_FROM":"[^"]*",/, "")))
    expect(failing(checks)).toEqual(["prod.var.EMAIL_FROM", "prod.route.mcp.tanren.me"])
  })

  it("fails with one row when env.production is absent or the file is unreadable", () => {
    expect(failing(checkProduction(parseWrangler("{}")))).toEqual(["prod.block"])
    expect(failing(checkProduction(parseWrangler("not json")))).toEqual(["prod.block"])
  })
})

describe("checkProduction native sign-in and tightened vars", () => {
  const failingFor = (vars: Record<string, string>) =>
    failing(checkProduction(parseWrangler(production({ vars }))))

  it("fails NATIVE_RETURN_PREFIXES while the <owner: ...> placeholder is in it", () => {
    expect(
      failingFor({ NATIVE_RETURN_PREFIXES: "exps://u.expo.dev/<owner: eas projectId>/" }),
    ).toEqual(["prod.var.NATIVE_RETURN_PREFIXES"])
  })

  it("fails NATIVE_RETURN_PREFIXES for the wrong scheme, a host-only value or localhost", () => {
    const bad = ["exp://localhost:", "tanren://", "exps://u.expo.dev/", "exps://other.example/abc/"]
    expect(bad.map((value) => failingFor({ NATIVE_RETURN_PREFIXES: value }))).toEqual(
      bad.map(() => ["prod.var.NATIVE_RETURN_PREFIXES"]),
    )
  })

  it("fails when NATIVE_RETURN_PREFIXES is missing", () => {
    const text = production({}).replace(/"NATIVE_RETURN_PREFIXES":"[^"]*",?/, "")
    expect(failing(checkProduction(parseWrangler(text)))).toEqual([
      "prod.var.NATIVE_RETURN_PREFIXES",
    ])
  })

  it("requires EMAIL_MODE provider", () => {
    expect(failingFor({ EMAIL_MODE: "console" })).toEqual(["prod.var.EMAIL_MODE"])
  })

  it("requires EMAIL_FROM on tanren.me (bare or display-name form)", () => {
    expect(failingFor({ EMAIL_FROM: "login@tanren.me" })).toEqual([])
    expect(failingFor({ EMAIL_FROM: "Tanren <dev@tanren.local>" })).toEqual(["prod.var.EMAIL_FROM"])
    expect(failingFor({ EMAIL_FROM: "Tanren <login@tanren.me.evil.com>" })).toEqual([
      "prod.var.EMAIL_FROM",
    ])
  })

  it("requires ALLOWED_ORIGINS to be exactly https://tanren.me", () => {
    expect(failingFor({ ALLOWED_ORIGINS: "https://tanren.me,https://www.tanren.me" })).toEqual([
      "prod.var.ALLOWED_ORIGINS",
    ])
    expect(failingFor({ ALLOWED_ORIGINS: "https://example.com" })).toEqual([
      "prod.var.ALLOWED_ORIGINS",
    ])
  })

  it("fails the local KV id and the placeholder D1 id with the create commands as next", () => {
    const checks = checkProduction(
      parseWrangler(production({ kv: "local-oauth-kv", d1: "<owner: wrangler d1 create>" })),
    )
    expect(failing(checks)).toEqual(["prod.d1", "prod.kv"])
    const kv = checks.find((c) => c.id === "prod.kv")
    expect(Option.getOrElse(kv?.next ?? Option.none(), () => "")).toContain("kv namespace create")
  })
})

describe("checkProduction Strava export", () => {
  const failingFor = (overrides: Parameters<typeof production>[0]) =>
    failing(checkProduction(parseWrangler(production(overrides))))
  const nextOf = (overrides: Parameters<typeof production>[0], id: string) =>
    Option.getOrElse(
      checkProduction(parseWrangler(production(overrides))).find((c) => c.id === id)?.next ??
        Option.none(),
      () => "",
    )

  it("passes provider mode, a real client id, no secret vars and a cron", () => {
    const ids = checkProduction(parseWrangler(production({}))).map((c) => c.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        "prod.var.STRAVA_MODE",
        "prod.var.STRAVA_CLIENT_ID",
        "prod.novar.INTEGRATION_TOKEN_KEY",
        "prod.novar.STRAVA_CLIENT_SECRET",
        "prod.crons",
      ]),
    )
    expect(failingFor({})).toEqual([])
  })

  it("passes console mode with the client-id placeholder and says exports are only logged", () => {
    const overrides = {
      vars: { STRAVA_MODE: "console", STRAVA_CLIENT_ID: "<owner: strava client id>" },
    }
    expect(failingFor(overrides)).toEqual([])
    const row = checkProduction(parseWrangler(production(overrides))).find(
      (c) => c.id === "prod.var.STRAVA_CLIENT_ID",
    )
    expect(row?.status).toBe("ok")
    expect(row?.detail).toContain("console: exports are only logged until O1/O2")
  })

  it("fails provider mode with the client-id placeholder", () => {
    expect(
      failingFor({
        vars: { STRAVA_MODE: "provider", STRAVA_CLIENT_ID: "<owner: strava client id>" },
      }),
    ).toEqual(["prod.var.STRAVA_CLIENT_ID"])
  })

  it("fails an unknown STRAVA_MODE and a missing STRAVA_MODE", () => {
    expect(failingFor({ vars: { STRAVA_MODE: "live" } })).toEqual(["prod.var.STRAVA_MODE"])
    const text = production({}).replace(/"STRAVA_MODE":"[^"]*",/, "")
    expect(failing(checkProduction(parseWrangler(text)))).toEqual(["prod.var.STRAVA_MODE"])
  })

  it("fails STRAVA_CLIENT_ID while the owner placeholder or an empty value is in it", () => {
    expect(failingFor({ vars: { STRAVA_CLIENT_ID: "<owner: strava client id>" } })).toEqual([
      "prod.var.STRAVA_CLIENT_ID",
    ])
    expect(failingFor({ vars: { STRAVA_CLIENT_ID: "" } })).toEqual(["prod.var.STRAVA_CLIENT_ID"])
    const text = production({}).replace(/"STRAVA_CLIENT_ID":"[^"]*",?/, "")
    expect(failing(checkProduction(parseWrangler(text)))).toEqual(["prod.var.STRAVA_CLIENT_ID"])
  })

  it("fails INTEGRATION_TOKEN_KEY as a var and points at wrangler secret put", () => {
    const overrides = { vars: { INTEGRATION_TOKEN_KEY: "AAAA" } }
    expect(failingFor(overrides)).toEqual(["prod.novar.INTEGRATION_TOKEN_KEY"])
    expect(nextOf(overrides, "prod.novar.INTEGRATION_TOKEN_KEY")).toContain(
      "wrangler secret put INTEGRATION_TOKEN_KEY --env production",
    )
  })

  it("fails STRAVA_CLIENT_SECRET as a var and points at wrangler secret put", () => {
    const overrides = { vars: { STRAVA_CLIENT_SECRET: "shh" } }
    expect(failingFor(overrides)).toEqual(["prod.novar.STRAVA_CLIENT_SECRET"])
    expect(nextOf(overrides, "prod.novar.STRAVA_CLIENT_SECRET")).toContain(
      "wrangler secret put STRAVA_CLIENT_SECRET --env production",
    )
  })

  it("fails when env.production has no triggers.crons (missing block or empty list)", () => {
    expect(failingFor({ crons: "absent" })).toEqual(["prod.crons"])
    expect(failingFor({ crons: [] })).toEqual(["prod.crons"])
    expect(nextOf({ crons: "absent" }, "prod.crons")).toContain('"crons": ["*/5 * * * *"]')
  })
})

describe("checkExportApiUrl", () => {
  it("is ok when the bundle mentions api.tanren.me", () => {
    expect(checkExportApiUrl(Option.some(true)).status).toBe("ok")
  })

  it("fails with the export command when the bundle was built without the API url", () => {
    const row = checkExportApiUrl(Option.some(false))
    expect(row.status).toBe("fail")
    expect(Option.getOrElse(row.next, () => "")).toBe(
      "EXPO_PUBLIC_API_URL=https://api.tanren.me pnpm web:export",
    )
  })

  it("is only info when there is no dist (the export row fails instead)", () => {
    expect(checkExportApiUrl(Option.none()).status).toBe("info")
  })
})

describe("checkWeb", () => {
  it("needs the mobile dist directory and the tanren.me route", () => {
    const good = parseWrangler(
      '{ // c\n "assets": {"directory": "../mobile/dist"}, "env": {"production": {"routes": [{"pattern": "tanren.me", "custom_domain": true}]}} }',
    )
    expect(failing(checkWeb(good))).toEqual([])
    expect(failing(checkWeb(parseWrangler("{}")))).toEqual(["web.assets", "web.route"])
  })
})

describe("checkExport", () => {
  const now = Date.UTC(2026, 9, 21, 12)
  it("is ok when fresh, failing when stale or missing", () => {
    expect(checkExport(Option.some(now - 30 * 60_000), now).status).toBe("ok")
    const stale = checkExport(Option.some(now - 3 * 60 * 60_000), now)
    expect(stale.status).toBe("fail")
    expect(stale.detail).toContain("stale")
    expect(Option.getOrElse(stale.next, () => "")).toBe(
      "EXPO_PUBLIC_API_URL=https://api.tanren.me pnpm web:export",
    )
    expect(checkExport(Option.none(), now).status).toBe("fail")
  })
})

describe("checkDns", () => {
  it("maps resolved to ok and unresolved to a non-fatal info", () => {
    expect(checkDns("tanren.me", { _tag: "Resolved", addresses: ["1.2.3.4"] }).status).toBe("ok")
    const miss = checkDns("api.tanren.me", { _tag: "Unresolved", code: "ENOTFOUND" })
    expect(miss.status).toBe("info")
    expect(miss.detail).toContain("ENOTFOUND")
  })
})

describe("checkWhoami", () => {
  it("classifies logged in, logged out, timeout and prompts", () => {
    const run = (stdout: string, exitCode = 0, timedOut = false) =>
      checkWhoami({ stdout, exitCode, timedOut }).status
    expect(run("You are logged in with an OAuth Token\nAccount Name: me")).toBe("ok")
    expect(run("You are not authenticated. Please run `wrangler login`.")).toBe("fail")
    expect(run("", 1, true)).toBe("fail")
    expect(run("Open the browser to log in? (y/n)")).toBe("fail")
  })
})

describe("checkSecrets, checkGate and ownerSession", () => {
  it("lists every secret command as info and warns about .dev.vars.production", () => {
    const rows = checkSecrets(["/x/.dev.vars.production"])
    expect(rows.map((r) => r.status)).toEqual(["info", "info", "info", "info", "info"])
    const nextOf = (index: number) => Option.getOrElse(rows[index]?.next ?? Option.none(), () => "")
    expect(nextOf(0)).toContain("secret put BETTER_AUTH_SECRET --env production")
    expect(nextOf(1)).toContain("secret put RESEND_API_KEY --env production")
    expect(nextOf(2)).toContain("secret put STRAVA_CLIENT_SECRET --env production")
    expect(nextOf(2)).toContain('not needed while STRAVA_MODE is "console"')
    expect(nextOf(3)).toContain("secret put INTEGRATION_TOKEN_KEY --env production")
    expect(nextOf(3)).toContain("openssl rand -base64 32")
    expect(checkSecrets([]).at(-1)?.status).toBe("ok")
  })

  it("skip-gate is info, a red gate fails", () => {
    expect(checkGate(Option.none()).status).toBe("info")
    expect(checkGate(Option.some({ exitCode: 1 })).status).toBe("fail")
  })

  it("strikes only the steps a check proves", () => {
    const checks = [
      ...checkProduction(parseWrangler(production({}))),
      checkExport(Option.some(0), 0),
    ]
    const steps = ownerSession(checks)
    expect(steps.filter((s) => s.done).length).toBe(3)
    expect(steps.find((s) => s.command.includes("secret put"))?.done).toBe(false)
  })
})

describe("wrangler.jsonc env.production.vars", () => {
  it.effect("load through WorkerConfig with ENVIRONMENT=production and fake secrets", () =>
    Effect.gen(function* () {
      const text = yield* Effect.promise(() =>
        readFile(join(import.meta.dirname, "..", "wrangler.jsonc"), "utf8"),
      )
      const vars = Option.match(parseWrangler(text), {
        onNone: () => ({}),
        onSome: (config) => config.env?.production?.vars ?? {},
      })
      const config = yield* WorkerConfig.pipe(
        Effect.provide(
          WorkerConfig.layerFromEnv({
            ...vars,
            BETTER_AUTH_SECRET: "test-only-auth-secret",
            RESEND_API_KEY: "re_test_only_not_a_key",
            INTEGRATION_TOKEN_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", // 32 x 0x01, test only
          }),
        ),
      )
      expect(config.environment).toBe("production")
      expect(config.stravaMode).toBe("console")
      expect(
        failing(checkProduction(parseWrangler(text)).filter((c) => c.id.includes("STRAVA"))),
      ).toEqual([])
    }),
  )
})
