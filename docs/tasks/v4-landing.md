# v4 — Signed-out landing page (tanren.me)
Source: plan Amendment 13 (owner, 2026-10-26 22:25) · Status: planned · Updated: 2026-10-26 22:50 · Baseline commit: 9d09fcd
Design: `docs/design/landing.md` (normative; §2–§5 frozen on dispatch) · ADR-0021 (accepted, Lead delegation)

## Decisions
- ADR-0021 Web: every gated route renders `<Landing />` in `_layout.tsx` instead of redirecting; native unchanged; `gateFor`/`useAuthGate` untouched — accepted (Lead delegation)
- D1 One illustration colour set (slate #64748B + amber) for both schemes, 5 files, ≤ 1.5 MB — accepted (Lead delegation)
- D2 `display` stays 34 px at desktop (no `src/ui` change this round; desktop pair owns `src/ui/*`) — accepted (Lead delegation)

## Tasks
| id | title | role / model | depends on | files (exclusive) | time box | status |
| --- | --- | --- | --- | --- | --- | --- |
| ILL-1 | Landing illustrations: `generateLanding.ts`, `landing:generate` + `landing:shrink` scripts, 5 webps, size proof | engineer / sonnet | — | `apps/mobile/scripts/generateLanding.ts`, `apps/mobile/package.json` (two script lines only), `.gitignore` (one line: `apps/mobile/assets/landing/raw/`), `apps/mobile/assets/landing/*.webp` (new dir) | generation run + 10 min | todo |
| LAND-1 | Landing page + gate render change + screenshots | engineer / opus | — | `apps/mobile/app/_layout.tsx`, `apps/mobile/src/components/landing/{Landing.tsx,LandingFeature.tsx,landingCopy.ts,landingCopy.test.ts,landingImages.ts}` (new dir), `docs/design/screens/UI-LAND-*.png` | 20 min | todo |
| LAND-2 | Wire the webps into `landingImages.ts`, re-capture, size proof in Log | engineer / sonnet | ILL-1, LAND-1 | `apps/mobile/src/components/landing/landingImages.ts`, `docs/design/screens/UI-LAND-*.png` | 10 min | todo |
| LAND-R | Designer review: section scores at 390/1280 both schemes, probe table, PASS bar (design §7) | reviewer (designer) / fable | LAND-2 | read-only; feedback by SendMessage to the LAND-2 engineer; ≤ 2 fix rounds | 10 min | todo |

Parallel groups: {ILL-1 ∥ LAND-1} → LAND-2 → LAND-R → fixes (LAND-2 engineer).
Disjoint sets: ILL-1 never writes under `src/` or `app/`; LAND-1 never writes under `assets/`, `scripts/` or `package.json`. Adjacent live streams (do not touch): `app/sign-in.tsx` (LOGO-2), `app/settings*.tsx` + `src/library/*` + `src/components/progress/*` (mobile-B), `src/ui/*` + screen desktop branches (desktop pair), `src/player/*` (PROG), `src/components/feed/*` (feed), `src/components/integrations/*` + `settings/IntegrationsSection` (strava). `_layout.tsx` is LAND-1's alone: `git log --oneline -3 -- apps/mobile/app/_layout.tsx` before editing and report if another stream touched it since 9d09fcd.
Case-collision check 2026-10-26 22:48: `ls apps/mobile/src/components | tr A-Z a-z | sort | uniq -d` → nothing; new names `Landing.tsx`, `LandingFeature.tsx`, `landingCopy.ts`, `landingImages.ts` differ by more than case.

## Frozen contracts
- `landingCopy.ts`: `export const LANDING` with the keys of design §2 (`eyebrow`, `meaning`, `headline`, `promise`, `cta`, `ctaNote`, `features: ReadonlyArray<{ icon: IconName; title: string; body: string }>` of length 4, `closing`, `footer: { brand: string; domain: string }`), texts verbatim.
- `landingImages.ts`: `LandingImageId = "hero" | "log" | "program" | "feed" | "plan"`; `LANDING_IMAGES: { readonly [K in LandingImageId]: Option.Option<ImageSourcePropType> }` (design §5).
- Files `apps/mobile/assets/landing/{hero,log,program,feed,plan}.webp`, hero 1024², others 512², transparent.
- Root `View testID="landing"`; no `[role=navigation]` rendered while gated.

## Assumes (cited)
- `gateFor` returns `"sign-in"` iff no account, zero sets and `!isSignInRoute(route)`: `apps/mobile/src/services/authGate.ts:26–27` (`Option.isSome(account) || localSets > 0 || isSignInRoute(route) ? "allow" : "sign-in"`).
- `_layout.tsx` today hides the Stack with `opacity: 0` and renders `<Redirect href="/sign-in" />` when `gate === "sign-in"`: `apps/mobile/app/_layout.tsx:59–62`, `hidden` at line 68.
- `router.replace("/sign-in")` is the proven navigation call: `apps/mobile/app/sign-in.tsx:44` uses `router.replace("/today")`; `.push` is flagged by the noMutation plugin (`apps/mobile/CLAUDE.md` "Local store contract").
- Brand files `mark.png`, `mark-paper.png`, `icon.png` exist (`ls apps/mobile/assets/brand`, 22:35); LOGO-2 replaces their content under the same names (Lead brief). LAND-1 re-runs `ls` before wiring.
- Image API body (`model`, `prompt`, `size`, `quality`, `output_format: "png"`, `background`) and the `.env.images` key handling: `apps/mobile/scripts/generateLogo.ts:165–180`; `redactSecrets` exported at `src/illustrations/imagePrompt.ts:296`.
- webp requires bundle on Metro and web: `src/illustrations/images.ts` (generated map in use by `ExerciseIllustration`).
- `Page` `wide` gives page 1216 / inner 1152 at 1280: `docs/design/ui-desktop.md:9,72`; `Columns` gap `space.xl`: `src/ui/ColumnsView.tsx:60`.
- `ui-measure.js` skips `display:none` subtrees: `docs/design/ui-measure.js:2`.

## Briefs (paste-ready)

### ILL-1 — Landing illustrations
Role engineer, model sonnet. Time box: one generation run + 10 min. Permissions: unattended; the key only via `node --env-file-if-exists=.env.images`; never read or print `.env*`.
Files (exclusive): `apps/mobile/scripts/generateLanding.ts`, `apps/mobile/package.json` (add `"landing:generate": "node --env-file-if-exists=.env.images scripts/generateLanding.ts"`, `"landing:shrink": "node scripts/generateLanding.ts --shrink"`), `.gitignore` (+ `apps/mobile/assets/landing/raw/`), `apps/mobile/assets/landing/*.webp`.
Spec: `docs/design/landing.md` §5 — STYLE prefix + the 5 motif prompts verbatim, `gpt-image-1.5`, 1024, `quality "high"`, `output_format "png"`, `background "transparent"`; copy the fetch/retry/redaction structure of `scripts/generateLogo.ts:165–200` (`grep -n "const post\|redactSecrets\|Schedule" apps/mobile/scripts/generateLogo.ts`). Skip ids whose raw PNG exists. `--shrink`: sharp `fit: "contain"` with transparent background, hero 1024, others 512, `.webp({ quality: 82, alphaQuality: 90 })`.
Done when: 5 webps exist; `du -sh apps/mobile/assets/landing` ≤ 1.5 MB and each file within its §5 budget (output in the report); `node -e` prints width/height/hasAlpha per file via sharp metadata (all `hasAlpha: true`); `pnpm check` green; report names the cost (count × $0.20) and any prompt that needed a retry.

### LAND-1 — Landing page and gate render
Role engineer, model opus. Time box: 20 min. Permissions: unattended; agent-browser `--session LAND-1` only.
Files (exclusive): `apps/mobile/app/_layout.tsx`, `apps/mobile/src/components/landing/{Landing.tsx,LandingFeature.tsx,landingCopy.ts,landingCopy.test.ts,landingImages.ts}`, `docs/design/screens/UI-LAND-*.png`.
Spec: `docs/design/landing.md` §1–§4, §6 (copy verbatim from §2; every entry of `LANDING_IMAGES` is `Option.none()` and renders the §4 placeholder tile). Routing per ADR-0021: in `_layout.tsx` replace `{gate === "sign-in" ? <Redirect href="/sign-in" /> : null}` by `Platform.OS === "web" ? <Landing /> : <Redirect …/>` and give the Stack wrapper `display: "none"` while gated (VERIFY in design §VERIFY; fallback stated there). Do not edit `authGate.ts`, `useAuthGate.ts`, `index.tsx`, `sign-in.tsx`.
Done when: `pnpm check` green (copy test covers 4 features and non-empty strings); `pnpm -F @tanren/mobile export:web` with `EXPO_PUBLIC_DEV_USER_ID` unset, `serve:web` on :8790, fresh session → every route in design §7 shows `[data-testid=landing]` and no `[role=navigation]`; `/sign-in` shows the form; probe rows of §7 recorded (docH, small, page-frame width, cols) at 390 and 1280 per scheme; screenshots `UI-LAND-{390,1280}-{light,dark}.png` saved with the capture lines `Data state:`, `Scheme:`, `Commit:`, `Routes:` in the report; `git log --oneline -3 -- apps/mobile/app/_layout.tsx` output in the report.

### LAND-2 — Wire the illustrations
Role engineer, model sonnet. Time box: 10 min. Depends on ILL-1 and LAND-1 accepted.
Files (exclusive): `apps/mobile/src/components/landing/landingImages.ts`, `docs/design/screens/UI-LAND-*.png` (overwrite).
Do: replace each `Option.none()` with `Option.some(require("../../../assets/landing/<id>.webp"))` (`ls apps/mobile/assets/landing` first; output in the report). Re-run the LAND-1 export + capture + probe table.
Done when: `pnpm check` green; the four screenshots show illustrations (no placeholder tiles); probe table within design §7 PASS bands; `du -sh apps/mobile/assets/landing` repeated in the report.

### LAND-R — Designer review
Role reviewer (design direction is fable-only, plan Amendment 6), model fable. Time box: 10 min. Read-only.
Do: score hero, features, CTA, footer 1–5 at 390 and 1280, light and dark, against ui-polish §1 principles and design §3 arithmetic; check the §7 probe table line by line. Verdict PASS iff no section < 3 and every probe row green; otherwise a ≤ 10-line fix list by SendMessage to the LAND-2 engineer, at most 2 rounds.

## Log
- 22:50 · LAND-0 (fable): ADR-0021, `docs/design/landing.md`, this sheet. Route-inventory line added to `apps/mobile/CLAUDE.md`.
- 22:53 · ILL-1 ∥ LAND-1 dispatched by the Lead (ports 8893/8894 for LAND-1, not :8790 — owner's); _layout.tsx confirmed unowned; brand file names final (fb7094a)
