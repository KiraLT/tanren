# Team strava — sheet
Charter: build the Integrations page and the Strava export (`docs/tasks/v4-strava.md`). Started 21:30, hard timeout 23:30. Review rounds: max 2.

## Assumes (cross-team, from the charter)
- Auth: bearer on native, cookie on web (`SessionsLive.ts:7`, `Account.ts:40`); `Sync.push` is a passthrough, no `ExecutionContext` (ADR-0018 §4).
- `apps/mobile/src/ui/**` is the desktop pair's; Today/Player/Plan/Programs mobile-A; feed/progress/activity the feed team; rest of `settings/*` mobile-B. Ports for this team: API 8793/8795, web 8794 (spare 8796/8797 for QA); never :8787/:8790/:8081.
- Mobile-B's `app/settings.tsx` imports `IntegrationsSection` (SV-6 file): SV-6 committed 8b66574.

## Tasks
| id | task | model | status |
| --- | --- | --- | --- |
| SV-1 | shared schemas | sonnet | done (committed by Lead) |
| SV-2 | db tables, 0004, repos | sonnet | done (committed) |
| SV-3 | config, TokenSeal, StravaApi | sonnet | done (committed) |
| SV-1b | `blocked` state (Lead addendum) | sonnet | done (committed) |
| SV-5 | export pipeline | opus | done; fix round in flight (REV-1) |
| SV-6 | app Integrations page | opus | done (committed 8b66574); SV-6b copy line + web param clearing in flight |
| SV-4 | connect/callback/endpoints | opus | done, unreviewed |
| SV-7 | docs + preflight | sonnet | done |
| SV-8 | production STRAVA_MODE=console | sonnet | done |
| REV-1 | review SV-1,1b,2,3,5,6 | opus | done: REQUEST CHANGES (1 blocking, 2 should) |
| REV-2 | delta review SV-4 + fix round + SV-8 | opus | todo |
| SV-Q1 | local e2e + screenshots | sonnet | todo |

## Log
- 21:30→21:32 · SV-1 · engineer/sonnet · a6eec18c8ce1112d6 · 106k · 27 · 1 · done
- 21:33→21:38 · SV-2 · engineer/sonnet · a2d3c2eb7cb847e2a · 144k · 35 · 1 · done
- 21:33→21:40 · SV-3 · engineer/sonnet · a4d1d8f30e04de43c · 177k · 65 · 1 · done
- 21:41→21:48 · SV-1b · engineer/sonnet · abd428d2b21c3bd87 · 160k · 64 · 1 · done
- 21:50→22:03 · SV-5 · engineer/opus · a9f39d575905f6472 · 223k · 78 · 1 · done
- 21:50→22:00 · SV-6 · engineer/opus · ac5674f777dc38b0c · 199k · 79 · 1 · done
- 22:05→22:17 · SV-4 · engineer/opus · a655320f2c29c0fb8 · 239k · 106 · 1 · done
- 22:05→22:08 · SV-7 · engineer/sonnet · ae7eaa6ce21702b8a · 111k · 14 · 1 · done
- 22:05→22:15 · REV-1 · reviewer/opus · a53df69844fb5e11f · 185k · 54 · 1 · REQUEST CHANGES
- 22:21→22:23 · SV-8 · engineer/sonnet · adea0f99fa4206648 · 118k · 27 · 1 · done
- 22:23→ · SV-5 fix r1 · a9f39d575905f6472 (resumed) · in flight
- 22:24→ · SV-6b · ac5674f777dc38b0c (resumed) · in flight

## Decisions
See the team report. Key: claimDue guard includes updated_at; RETURNING not changes; backoff dead on the 5th failure; blocked never dead, +12 h; returnTo ≤ 300; connect limiter keyed by user; production console mode (Lead decision); planned-session name deferred (no PlanRepo read-by-id).

## Integration checklist
- [ ] `apps/worker/wrangler.jsonc` · production `STRAVA_MODE` console → provider after O1/O2 (+ `STRAVA_CLIENT_ID`) · `pnpm -F @tanren/worker exec vitest run --root ../.. --project @tanren/worker scripts`
- [ ] `apps/worker/scripts/deployPreflight*` · learns Strava rows (done) · `pnpm deploy:preflight`
- [ ] Owner O1–O3 per `docs/design/deploy.md` §Strava secrets.
