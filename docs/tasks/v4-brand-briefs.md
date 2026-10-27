# Briefs: LOGO-4 (W1 wordmark + the T mark, plan Amendment 15) and BRAND-2b (OG image)
Status: owner picked **W1** 2026-10-27 10:18 ("I like the T. Lets use W1 when we need full text and replace icon
with only that T from W1"). LOGO-4 dispatched 10:25 (engineer/opus); BRAND-2b resumes the same engineer after.
Facts grep-verified by the Lead 10:22.

## Brief: LOGO-4 — final W1 wordmark, the T mark, icon set and wiring
Role: engineer   Model: opus   Step: brand (plan Amendments 10, 12, 14, 15)   Task sheet Log: docs/tasks/step-2.md
Time box: 25 min (one paid image run ≈ 3 min + pipeline + wiring; `date` at start; at the box stop and report) · Report ≤ 40 lines

### Goal
W1 becomes the final wordmark (full text), and its **T** letterform becomes the standalone mark that replaces the
力 kanji everywhere the mark appears alone: iOS icon, adaptive icon, splash, favicon, PWA icons, the in-app mark on
sign-in and the landing. Sign-in and the landing hero show the W1 lockup. The brandbook and `brand.md` follow.
The 力 set is kept for the record, not deleted.

### Read first
- CLAUDE.md, `apps/mobile/CLAUDE.md`, skill `expo-mobile`; `docs/design/brand.md` (logo system, line 23 OG row);
  `docs/design/brandbook/project/assets/Logo/README.md`.
- `apps/mobile/scripts/generateLogo.ts`: `argv`/`flag`/`argValue` (lines 22–24); `--final` (LOGO-2) wrote `F-icon.png`,
  `F-paper.png`, `F-mark.png` at quality `high` (102–125) and then built the icon set with sharp:
  `keyGlyph(rawDir/F-icon.png, DARK_PALETTE)`, `keyGlyph(F-paper.png, PAPER_PALETTE)`, `tile(dark, 1024, 0.6, graphite)`
  → `icon.png`, `tile(dark, 1024, 0.58, graphite)` → `adaptive-icon.png`, `tile(dark, 512, 0.76, none)` → `splash-icon.png`
  (lines 446–531); `--wordmark` (LOGO-3) wrote `assets/brand/candidates/wordmark/W1.png … W6.png` (1536×1024,
  transparent, git-ignored), prompts near line 167. The key loads only via `node --env-file-if-exists=.env.images`
  (never read `.env*`). `sharp` is in `apps/mobile/package.json` devDeps (catalog). BRAND-2a traced the mark with potrace
  (`assets/brand/mark-ink.svg` #16181D + #C2410C hook, `mark-paper.svg`, `mark.svg` currentColor; 7.6 KB, 0.19 % alpha diff).
- Icon wiring: `apps/mobile/app.json` lines 9–22 (`icon`, `splash.image`, `android.adaptiveIcon.foregroundImage`, `web.favicon`
  → `./assets/brand/{icon,splash-icon,adaptive-icon,favicon}.png`); PWA: `apps/mobile/public/icons/{apple-touch-180,icon-192,
  icon-512,maskable-512}.png`, referenced by `public/manifest.json:10–19` and `public/index.html:25–26`.
- In-app mark: `app/sign-in.tsx:117–145` (`MARK`/`MARK_PAPER` 48 px + literal "TANREN" at line 129; doc comment line 28);
  `src/components/landing/Landing.tsx:19–30` (same pair, `scheme === "dark" ? MARK : MARK_PAPER`).
- The magic-link email: `grep -rn "mark\|logo\|\.png" apps/worker/src/auth` found no image reference (Lead, 10:22) — confirm
  with your own grep and report; if the email embeds no mark, nothing to do there.

### Scope
In: `apps/mobile/scripts/generateLogo.ts` (new `--wordmark-final` and `--t-mark` steps, or one `--w1-final`), `apps/mobile/assets/brand/**`
(new files + the moved 力 set), `apps/mobile/public/icons/*.png`, `app/sign-in.tsx`, `src/components/landing/Landing.tsx`
(header lockup + mark only), `docs/design/brand.md` (logo section), `docs/design/brandbook/project/assets/Logo/README.md`,
`docs/design/screens/LOGO-4-*.png` + `docs/design/screens/LOGO-4-rows.html`.
Out: every other `apps/mobile/src/**` path (polish round 5 is live in `src/ui`, library, progress, feed, settings, player,
plan — do not touch), `app.json` paths (same filenames, new pixels), worker, shared, the Design System artifact (Lead).

### Decisions already made (apply)
1. **One paid run**: W1's prompt at quality `high`, 1536×1024 transparent, ink colourway (#16181D strokes, one amber #C2410C hook
   as in W1). The paper colourway is derived (recolour the keyed glyph like `keyGlyph` + `PAPER_PALETTE`), not a second run.
   If the high run drifts from the W1 the owner saw (different letterforms), report with a side-by-side and use W1.png itself.
2. **The T mark** is cut from that final: alpha-scan the leftmost glyph's columns (sharp), crop to the T's bounding box with the
   crossbar included, key it, and feed the existing `tile()` pipeline → `icon.png` (1024, graphite), `adaptive-icon.png`,
   `splash-icon.png`, `favicon.png` (48, transparent → match the current favicon's size and background), PWA icons
   (`icon-192`, `icon-512`, `maskable-512` with safe-zone padding, `apple-touch-180` on graphite). Trace the T crop with potrace
   to `mark.svg` (currentColor + amber), `mark-ink.svg`, `mark-paper.svg` and write `mark.png` / `mark-paper.png` as today
   (same names, so `require`s keep working). Trace the whole wordmark to `wordmark-ink.svg` + `wordmark-paper.svg`
   (+ `wordmark.png`, `wordmark-paper.png` 2× at 640 wide).
3. **The old 力 set** moves to `assets/brand/candidates/final-kanji/` (`git mv`, tracked; the icon PNG names in `assets/brand/`
   are reused by the new T set).
4. **Wiring**: sign-in shows the lockup (`wordmark` 56 px high at 390, scheme-switched) instead of mark + literal "TANREN";
   the landing header shows the lockup at 32 px high (if the ligature does not read at 32, use the T mark 32 px + the
   wordmark only in the hero, and say so). The doc comments at `sign-in.tsx:28` and `Landing.tsx:8` are rewritten to match.
5. **Contact sheet** `docs/design/screens/LOGO-4-sheet.png`: the icon at 1024 / 180 / 60 / 32, the mark on light and dark, the
   lockup on light and dark; rows fragment `LOGO-4-rows.html` with badges **T1–Tn** (unique; K, M, A, X, P, D, DW, W, F, S, LA,
   FW, R, LW, LM, L, MW, Q are taken), gallery markup as in `docs/design/screens/UI-Pdesktop-r4-rows.html`.
6. Size budget: `du -ch apps/mobile/assets/brand/*.png apps/mobile/assets/brand/*.svg | tail -1` ≤ 1.2 MB;
   `du -ch apps/mobile/public/icons/*.png | tail -1` ≤ 400 KB.

### Done when
- [ ] Assets listed with sizes; alpha-diff of each trace ≤ 0.5 %; the sheet shows the T legible at 32 (say if it is not)
- [ ] `ui-check` 390 light + dark on `/sign-in` and the landing: the lockup's bounding box and its neighbours' pasted
      (prev.bottom ≤ new.top; new.bottom ≤ next.top), PNG opened; 1280 light for the landing (Columns)
- [ ] `grep -rn "brand/" apps/mobile/app apps/mobile/src` shows every `require` resolving to an existing file
- [ ] brand.md + Logo README: W1 wordmark, the T mark, colourways, clear space, minimum sizes, three don'ts; the 力 noted as superseded
- [ ] `pnpm -F @tanren/mobile check` green (paste tail); root `pnpm check` with any `apps/mobile` reds from round 5 named `foreign: r5`
Forbidden: `git commit|push|reset|checkout`, `rm -r*`, `wrangler *`, `eas *`, reading `.env*`, a second paid run without reporting first, any file of polish round 5.

## Brief: BRAND-2b — OG / social image from the W1 lockup
Role: engineer (resume the LOGO-4 engineer)   Model: opus   Time box: 10 min · Report ≤ 25 lines
Goal: `apps/mobile/public/og.png` 1200×630 (graphite #16181D background, the paper lockup centred, amber hook; ≤ 200 KB,
`wc -c`) composed with sharp from `wordmark-paper.svg` (no paid run). Wire `<meta property="og:image"
content="https://tanren.me/og.png">`, `og:title` "Tanren", `og:description` (the one-liner from
`src/components/landing/landingCopy.ts`), `twitter:card summary_large_image` into `apps/mobile/public/index.html` after the
theme-color meta. Update `docs/design/brand.md:23` (OG row: missing → path).
Done when: file + size; metas present in the exported `dist/index.html` (`EXPO_PUBLIC_API_URL=https://api.tanren.me CI=1 pnpm -F
@tanren/mobile export:web`, then `grep og: apps/mobile/dist/index.html`); mobile gate green. The Lead checks `curl -sI
https://tanren.me/og.png` after DEPLOY-5.
