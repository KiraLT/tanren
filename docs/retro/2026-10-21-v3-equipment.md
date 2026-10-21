# Retro — v3 equipment & locations (2026-10-21 10:50 → 11:31, Lead-run, no teams)

Sources: 12 agent transcripts (13 runs, `tasks/*.output`, UTC+3 applied), step-2 Log 10:48–11:33, `docs/tasks/v3-equipment.md` Log. Previous: `2026-10-21-v2-night.md` (ratio 0.16), `2026-10-20-steps-4-7-parallel.md` (0.96).

## Numbers (transcript clock; the Log's times lag it by 0–7 min in the 11:00–11:12 burst)
| run | role/model | start → end | active | turns | tool uses | uncached / cache-read tokens | box → used |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EQ-A | architect/fable | 10:51:23 → 10:57:31 | 6.1 | 10 | 10 | 94 k / 0.6 M | 15 → 6 |
| EQ-C | engineer/sonnet | 10:51:23 → 11:00:31 | 9.1 | 48 | 91 | 175 k / 6.3 M | 20 → 9 |
| EQ-2 (run 1) | engineer/opus | 10:59:47 → 11:08:03 | 8.3 | 51 | ≈ 90 | 243 k / 15.0 M (both runs) | 40 → 8 "box hit" |
| EQ-I | engineer/sonnet | 11:02:34 → 11:08:52 | 6.3 | 15 | 18 | 60 k / 1.0 M | 20 → 6 |
| EQ-1 | engineer/opus | 11:05:35 → 11:20:05 | 14.5 | 89 | 151 | 194 k / 13.3 M | 30 → 14.5 |
| EQ-2a (resume) | engineer/opus | 11:10:45 → 11:16:51 | 6.1 | 37 | ≈ 53 | (above) | 30 → 6 |
| EQ-2b | engineer/opus | 11:10:45 → 11:19:08 | 8.4 | 57 | 97 | 141 k / 7.1 M | 30 → 8 |
| UI-A | architect/fable | 11:18:34 → 11:26:45 | 8.2 | 14 | 40 | 139 k / 1.3 M | 30 → 8 |
| EQ-R1 | reviewer/opus | 11:20:29 → 11:22:39 | 2.2 | 15 | 17 | 102 k / 1.1 M | 20 → 2 |
| EQ-R2 | reviewer/opus | 11:22:09 → 11:25:12 | 3.0 | 25 | 27 | 84 k / 2.1 M | 20 → 3 |
| EQ-X | qa/sonnet | 11:22:09 → 11:25:41 | 3.5 | 25 | 26 | 81 k / 1.6 M | 25 → 3.5 |
| EQ-F1 | engineer/opus | 11:23:34 → 11:30:07 | 6.6 | 33 | 76 | 140 k / 3.8 M | 20 → 7 |
| EQ-F2 | engineer/sonnet | 11:25:59 → 11:31:03 | 5.1 | 32 | 56 | 104 k / 3.1 M | 15 → 5 |

- Wall-clock owner ask 10:50 → fix commit 229fbdb 11:31: **41 min** for a 6-stream feature (schema, catalog +56, images +57, migration, MCP tool, 4 mobile surfaces). Critical chain: EQ-A 6.1 → EQ-2 shared-additive step (to 11:04, 4.3) → EQ-1 14.5 → EQ-R2 3.0 → EQ-F2 5.1 = 33 agent-min; **ratio ≈ 0.80**. Lead edges on the chain: 1.4 / 2.3 / 1.5 (EQ-1 waited for EQ-2's additive step after EQ-C had reported at 11:00:31) / 2.1 / 0.8 = 8.1 min; median dispatch edge 2.1 min, none > 2.7.
- 13 runs, 87 agent-min active, 1.56 M uncached + 56.5 M cache-read tokens (≈ 0.2 M uncached per task, same as v2). Peak concurrency 5 (11:22–11:25). Boxes used: 20–50 % everywhere except EQ-1 (48 %); 0 gate failures; 0 harness nudges; 0 permission prompts.
- Review: R1 (mobile half, 3 min) ∥ R2 (server half, 4 min), both APPROVE-WITH-FIXES, fix waits 0.9 / 0.8 min; a third round (EQ-R3) after the "done" commit because R2 missed `ProfilePatch` and `ExercisePatch` has the same bug (EQ-F3 running).
- Measured gains of the two Lead tactics: half-reviews R1+F1 (11:20:29 → 11:30:07) overlapping R2+F2 (11:22:09 → 11:31:03) saved ≈ 9 min vs one review after EQ-1; splitting the stopped EQ-2 into 2a ∥ 2b saved ≈ 6 min (6.1 ∥ 8.4 instead of 14.5 serial). ≈ 15 of 41 min.

## Top three wastes
1. **EQ-2 stopped at 8.3 min claiming a 40-min box** (51/120 turns, no `date` call): the sheet said 75 min, the brief 40, the harness can carry ≈ 20 min of opus tool use. Cost: 2.7 min of Lead re-plan + a resume; the UI half idled 2.7 min. Fixed: engineer.md rule 11 (clock evidence, "turn cap" named). Proposal P1 sizes the box.
2. **Derived Patch wiped defaulted fields; the reviewer read the diff only.** `ProfilePatch = mapFields(Struct.map(optionalKey))` over fields with decode defaults (introduced 11:04 for compile-compat) turned every `update_profile` into a wipe of `locations`; R2 approved in 3 min, F2 found it by test, `ExercisePatch` repeats it → round 3 after the commit (≥ 10 min of the next step). Fixed: convention rewritten (packages/shared/CLAUDE.md, effect-conventions §2), `{}`→zero-keys test (rules/tests.md), reviewer "Derived schemas" check. P4 for docs/design.
3. **Dev-server friction on the critical path**: EQ-1 killed its wrangler twice (pnpm shim in `$!`), hit 401 `Invalid audience` until `--var MCP_RESOURCE_URL` (≈ 1.3 min of 14.5); EQ-2a restarted Metro for a stale bundle; orphan ports from INT-X3 invisible to `lsof`. Fixed: engineer.md rule 9, ui-check, cloudflare-workers.
Also: the Lead let EQ-2 own the shared additive step that the sheet gave to EQ-1 → EQ-1 waited 5 min after EQ-C's report and inherited the decode defaults that caused waste 2 (P3).

## Changes applied (EM, 11:38–11:45)
- `.claude/agents/engineer.md`: rule 11 clock discipline; rule 9 `node_modules/.bin/wrangler`, ps+curl port check, `MCP_RESOURCE_URL` on non-8787, ps re-check before the report; rule 6 heredoc-append exception with `biome check --write`.
- `.claude/agents/architect.md` Output 4: behaviour Assumes cite the return-path grep. `.claude/agents/reviewer.md`: "Derived schemas" checklist item.
- `.claude/skills/expo-mobile/SKILL.md`: `aria-checked`, dev-server restart, innerText. `.claude/skills/effect-conventions/SKILL.md`: §2 patch comment rewritten; §9 yielding-store race test. `.claude/skills/monorepo/SKILL.md`: `useImportType` hook trap. `.claude/skills/cloudflare-workers/SKILL.md`: MCP_RESOURCE_URL + binary start. `.claude/skills/ui-check/SKILL.md`: recipe uses the binary + var; macOS facts.
- `.claude/rules/tests.md`: every Patch `{}`→zero keys. `packages/shared/CLAUDE.md`: patch convention + catalog cap 300 / `row` coupling. `docs/retro/incidents.md`: EQ-2 correction (not the turn cap) + EQ-R2 entry; `em-log.md` 9 lines.

## Proposals for the Lead (exact text) — see the EM report
P1 lead-playbook Cost discipline box sizing (opus 120 turns ≈ 20 min; brief box ≤ 20 or split before dispatch). P2 lead-playbook "Speed tactics": half-reviews and resume-splits as the default. P3 lead-playbook: the task that owns a file set also owns its additive step; a compile-compat default is a reviewer flag. P4 docs/design/data-model.md:295–297 patch derivation → explicit Struct.

## Experiment for the next step (UI redesign, owner picks a direction first)
Owner round-trips to a chosen direction ≤ 1 (one contact sheet, ≤ 4 directions, UI-B); from "owner picked" to UI-X screenshots ≤ 30 min wall-clock; every engineer box ≤ 20 min and every report carries two `date` lines; each half reviewed within 2 min of its commit while the other half codes; 0 review findings on a derived schema.
