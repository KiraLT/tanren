---
paths:
  - "**/scripts/**"
  - "**/*.ts"
  - "**/package.json"
---

# Owner-provided keys and other secrets

- A third-party key the owner supplies (OpenAI, Cloudflare, EAS, …) lives in a git-ignored
  `.env.<purpose>` file next to the package that uses it (`apps/mobile/.env.images` holds
  `OPENAI_API_KEY`), one file per purpose, never in `.env` shared by everything and never in code,
  `package.json`, `wrangler*.jsonc`, task sheets or reports.
- Only the process that needs the key loads it, via the script entry:
  `node --env-file-if-exists=.env.<purpose> scripts/<name>.ts` (pattern: `images:generate`). No
  `dotenv` import, no `source`, no `cat`/`grep`/`Read` of the file: agents never open `.env*` or
  `.dev.vars*`, and a brief that needs a key says "the owner creates `.env.<purpose>`; verify only
  that the script fails cleanly without it".
- A script that holds a key prints neither the key nor the raw API error: log model/size/file names,
  and pass every error string through a redactor that masks `sk-`-like tokens (see
  `apps/mobile/src/illustrations/imagePrompt.ts` `redactSecrets`). A test asserts the redaction.
- A paid API call is behind a run cap (`RUN_CAP` 8 unless `--all`), skips existing outputs, and the
  script header states the per-run cost estimate so the owner approves the full run knowingly.
