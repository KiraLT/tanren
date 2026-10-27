---
name: db-reset-and-scratch-d1-proofs
description: `pnpm db:reset` does NOT prompt (its rm -rf is script-internal) but wipes the shared local D1; with other agents live, prove a migration on a mktemp --persist-to scratch DB; `d1 execute --local --persist-to <scratch>` is an allowed read-only proof, `--remote`/shared state never
metadata:
  type: feedback
---

`pnpm db:reset` = `rm -rf .wrangler/state && db:migrate && db:seed` (apps/worker/package.json). The ask list
matches only commands the agent emits, so the script-internal `rm -rf` does not prompt (lead-playbook, engineer.md
rule 9 clarification a). It does wipe the local D1 every running `wrangler dev` shares.

**Why:** SF-1 (2026-10-27) skipped `db:reset` fearing a prompt (wrong reason, right outcome: five agents were live)
and ran `wrangler d1 execute --local` on a `--persist-to` scratch DB, then reported it as a rule slip. The EM
(batch 7) corrected the rule: the `d1 execute` ban is about the owner's data (`--remote`, or `--local` against the
shared `.wrangler/state`); a read-only PRAGMA on your own mktemp scratch DB is a legitimate proof.

**How to apply:** other agents live → `node_modules/.bin/wrangler d1 migrations apply tanren --local --persist-to
"$(mktemp -d "$S/<task>-d1-XXXX")"`, read the applied list, optionally `d1 execute --local --persist-to <same dir>
--command "PRAGMA table_info(<table>)"`; alone in the session → `pnpm db:reset` is fine. Name the DB in the report.
Never `wrangler deploy --dry-run` either (it is still `wrangler deploy`; `pnpm deploy:preflight --skip-gate` is the
config proof). Related: [[no-rm-r-probe-cleanup]]
