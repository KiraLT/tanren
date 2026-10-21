/**
 * Owner-run, read-only checklist before the first production deploy (docs/design/deploy.md).
 * Never deploys, never logs in, never writes a secret. Usage (from the repo root):
 *   pnpm deploy:preflight [--skip-gate]
 * Exit code 1 when any row is a failure. Entry point: this is where the Effect program is run.
 */
import { execFile } from "node:child_process"
import { promises as dns } from "node:dns"
import { access, readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { Array as Arr, Console, Effect, Option } from "effect"
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
  type WhoamiRun,
} from "./deployPreflight.checks"

const workerDir = join(import.meta.dirname, "..")
const repoRoot = join(workerDir, "..", "..")
const skipGate = process.argv.includes("--skip-gate")

interface Run {
  readonly stdout: string
  readonly exitCode: number
  readonly timedOut: boolean
}

const run = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  timeoutMs: number,
): Effect.Effect<Run> =>
  Effect.promise(
    () =>
      new Promise<Run>((resolve) => {
        const child = execFile(
          command,
          [...args],
          {
            cwd,
            timeout: timeoutMs,
            maxBuffer: 64 * 1024 * 1024,
            env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
          },
          (error, stdout, stderr) =>
            resolve({
              stdout: `${stdout}${stderr}`,
              exitCode: error === null ? 0 : typeof error.code === "number" ? error.code : 1,
              timedOut: error !== null && error.killed === true,
            }),
        )
        child.stdin?.end() // a prompt gets EOF instead of waiting for the owner
      }),
  )

const readConfig = (file: string) =>
  Effect.tryPromise(() => readFile(join(workerDir, file), "utf8")).pipe(
    Effect.map(parseWrangler),
    Effect.orElseSucceed(() => Option.none()),
  )

const exists = (path: string) =>
  Effect.tryPromise(() => access(path)).pipe(
    Effect.match({ onFailure: () => false, onSuccess: () => true }),
  )

const distDir = join(repoRoot, "apps/mobile/dist")

/** `Some(found)` when the export exists: does any file in it mention `api.tanren.me`? */
const scanDist = Effect.tryPromise(() =>
  readdir(distDir, { recursive: true, withFileTypes: true }),
).pipe(
  Effect.flatMap((entries) =>
    Effect.forEach(
      Arr.filter(entries, (e) => e.isFile() && /\.(js|html|json)$/.test(e.name)),
      (e) =>
        Effect.tryPromise(() => readFile(join(e.parentPath, e.name), "utf8")).pipe(
          Effect.map((text) => text.includes("api.tanren.me")),
          Effect.orElseSucceed(() => false),
        ),
      { concurrency: 8 },
    ),
  ),
  Effect.map((hits) => Option.some(Arr.some(hits, (hit) => hit))),
  Effect.orElseSucceed(() => Option.none<boolean>()),
)

const resolveHost = (host: string) =>
  Effect.tryPromise({
    try: () => dns.resolve4(host),
    catch: (cause) => (cause instanceof Error && "code" in cause ? String(cause.code) : "ERROR"),
  }).pipe(
    Effect.timeoutOption("5 seconds"),
    Effect.match({
      onFailure: (code) => checkDns(host, { _tag: "Unresolved", code }),
      onSuccess: (result) =>
        Option.match(result, {
          onNone: () => checkDns(host, { _tag: "Unresolved", code: "TIMEOUT" }),
          onSome: (addresses) => checkDns(host, { _tag: "Resolved", addresses }),
        }),
    }),
  )

const program = Effect.gen(function* () {
  const gate = skipGate
    ? Option.none<Run>()
    : Option.some(yield* run("pnpm", ["check"], repoRoot, 15 * 60_000))
  const api = yield* readConfig("wrangler.jsonc")
  const web = yield* readConfig("wrangler.web.jsonc")
  const devVars = yield* Effect.forEach(
    [join(workerDir, ".dev.vars.production"), join(repoRoot, ".dev.vars.production")],
    (path) => exists(path).pipe(Effect.map((found) => (found ? [path] : []))),
  )
  const indexMtime = yield* Effect.tryPromise(() =>
    stat(join(repoRoot, "apps/mobile/dist/index.html")),
  ).pipe(
    Effect.map((s) => Option.some(s.mtimeMs)),
    Effect.orElseSucceed(() => Option.none<number>()),
  )
  const distScan = yield* scanDist
  const dnsRows = yield* Effect.forEach(
    ["tanren.me", "api.tanren.me", "mcp.tanren.me"],
    resolveHost,
    { concurrency: 3 },
  )
  const whoami = yield* run("pnpm", ["exec", "wrangler", "whoami"], workerDir, 10_000)
  const nowMs = Date.now() // entry point, not library code

  const sections: ReadonlyArray<readonly [string, ReadonlyArray<Check>]> = [
    ["1. Gate", [checkGate(Option.map(gate, ({ exitCode }) => ({ exitCode })))]],
    ["2. wrangler config", [...checkProduction(api), ...checkWeb(web)]],
    ["3. Secrets", checkSecrets(Arr.flatten(devVars))],
    ["4. DNS", dnsRows],
    ["5. Web export", [checkExport(indexMtime, nowMs), checkExportApiUrl(distScan)]],
    ["6. Cloudflare login", [checkWhoami(whoami satisfies WhoamiRun)]],
  ]
  const all = Arr.flatMap(sections, ([, checks]) => checks)

  yield* Effect.forEach(sections, ([title, checks]) =>
    Console.log(`\n${title}`).pipe(
      Effect.andThen(
        Effect.forEach(checks, (c) =>
          Console.log(
            `  ${c.status === "ok" ? "✓" : c.status === "fail" ? "✗" : "·"} ${c.label}${c.detail === "" ? "" : `: ${c.detail}`}` +
              Option.match(c.next, {
                onNone: () => "",
                onSome: (next) => `\n      → ${next}`,
              }),
          ),
        ),
      ),
    ),
  )
  if (Option.isSome(gate) && gate.value.exitCode !== 0) {
    yield* Console.log(
      `\n--- pnpm check tail ---\n${gate.value.stdout.split("\n").slice(-15).join("\n")}`,
    )
  }

  const strike = process.stdout.isTTY ? (s: string) => `\x1b[9m${s}\x1b[0m` : (s: string) => s
  yield* Console.log("\n7. Owner session (docs/design/deploy.md, in order; [x] = proven done)")
  yield* Effect.forEach(
    Arr.map(ownerSession(all), (step, index) => ({ step, index })),
    ({ step, index }) =>
      Console.log(
        `  ${step.done ? "[x]" : "[ ]"} ${index + 1}. ${step.done ? strike(step.command) : step.command}`,
      ),
  )

  const failures = Arr.filter(all, (c) => c.status === "fail").length
  yield* Console.log(`\n${failures === 0 ? "preflight passed" : `${failures} failing check(s)`}`)
  return failures
})

const failures = await Effect.runPromise(program)
process.exit(failures === 0 ? 0 : 1)
