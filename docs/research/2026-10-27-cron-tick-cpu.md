# GM-F3a: where the 28 ms CPU of an idle cron tick comes from

**Question.** Production `wrangler tail` shows an idle `*/5` cron tick at cpuTime 28–30 ms
(warm OPTIONS: 1 ms). Is that module evaluation of the bundle on a cold isolate?

## Setup

```
cd apps/worker && pnpm exec wrangler check startup --env production --outfile $S/startupN.cpuprofile   # 3 runs, wrangler 4.151.2
# the temp worker.bundle (multipart) copied before cleanup, index.js extracted with Response.formData()
node attr.mjs startupN.cpuprofile index.js   # self time per sample -> bundle line -> nearest esbuild "// <path>" comment
```

Note: `check startup` runs `deploy --dry-run` without forwarding `--env` (the bundle metadata
shows the top-level vars). The module code is the same, only the bindings differ.

## Observation

- Bundle: 4389.79 KiB / gzip 866.42 KiB (4.47 MB index.js plus a 15.9 MB source map, uploaded separately).
  Packages in it (count of esbuild file markers): effect 219, kysely 248, @better-auth/core 98, better-auth 79,
  jose 28, zod 28, @modelcontextprotocol 8, drizzle-orm 0. There are 318 lazy `__esm` wrappers.
- Local startup, active CPU: 127.3 / 100.4 / 101.3 ms (GC 10.8 / 9.1 / 8.3 ms). Measured on the
  Apple Silicon laptop with the profiler attached.
- Self time in run 4 (non-idle 101.3 ms): effect 38.2 (internal/effect.js 13.7, SchemaAST 4.1,
  schema/interpreter 3.8, schema/make 3.8, record 2.1), parse/compile of index.js 11.1,
  (program) 11.4, esbuild prelude/__init 11.3, zod 8.9 (pulled in by better-call and the MCP SDK),
  GC 8.3, @modelcontextprotocol/server 2.5, @better-auth/core 2.5, repo code (Config, Handlers, shared) about 4.
  Run 3 has the same shape: effect 44.4, zod 12.6.
- The entry point builds `var scheduledRun = makeScheduled(scheduledLayer(env2))` at module scope, and
  `scheduled()` only calls `ctx.waitUntil(scheduledRun.run())`.

## Docs (Cloudflare)

- Limits, CPU time: "CPU time measures how long the CPU spends executing your Worker code." The docs say
  nothing about startup in cpuTime.
- Limits, startup: "A Worker must parse and execute its global scope ... within 1 second." This is a separate limit.
- Dynamic Workers pricing: "Unlike standard Workers (where only execution time is billed), Dynamic Workers
  bill for two components of CPU time: Startup time ... Execution time".
- Limits: "Each isolate has some built-in flexibility to allow for cases where your Worker infrequently runs
  over the configured limit."

## Answer

Undocumented for trace `cpuTime`. Inferred: cpuTime does not include module evaluation. Two reasons:
(a) Cloudflare bills standard Workers for execution time only; (b) local startup is about 100 ms, more than
3x the 28 ms tick, so the tick would be at least that large if startup counted. The 28 ms is most likely
handler-time work in a fresh isolate: the Effect runtime and Schema code running unoptimised for the first
time, plus the lazy `__esm` inits the cron path triggers. The 1 ms OPTIONS was a warm isolate.
Confidence: startup numbers and module split `observed`; cpuTime semantics `inferred`.

## What it means for Tanren

- A dynamic import of the HTTP stack mainly shrinks startup (about 100 ms locally, far below the 1 s limit).
  It would not reliably lower the tick's cpuTime.
- Cheapest discriminating check (Lead, tail allowed): compare a cold `OPTIONS` (the first request after a
  deploy or an idle gap) with a warm one. If the cold one is about 28 ms, the cost comes from the cold isolate
  and not from the cron work.
- Until then: accept the soft limit. The outcome is `ok`, and the docs describe per-isolate flexibility.
  Workers Paid is the fallback if `exceededCpu` ever shows up.
