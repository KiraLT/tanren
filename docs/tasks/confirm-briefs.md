# CONFIRM — confirmation dialogs (owner ask 2026-10-27 17:55) · briefs

Spec: `docs/design/confirm-dialogs.md` (§1 inventory, §2 primitive, §3 rule + copy, §4 states).
Order: CONFIRM-1 → CONFIRM-2 → CONFIRM-R → commit. Permissions line in every brief: write only
your file set; `pnpm check` is the gate; no cloud-mutating commands.

## CONFIRM-1 — `useConfirm` primitive (engineer, opus, 15 min)
Files: `apps/mobile/src/ui/Confirm.tsx` (new), `apps/mobile/src/ui/confirmLayout.ts` + `.test.ts`
(new), `apps/mobile/src/ui/index.ts` (exports), `app/_layout.tsx` (mount `ConfirmProvider` inside
`ThemeProvider`, around `Stack`). Nothing else.
Build §2 exactly: `ConfirmRequest`, `useConfirm(): (r) => Promise<boolean>`, native `Alert.alert`
(cancel first, `style: "cancel"` / `"destructive"`, `cancelable`, `onDismiss` → false), web
`ConfirmDialog` (RN `Modal transparent animationType="fade"`, `onRequestClose` → cancel, scrim
`colors.overlay`, `Card` width `dialogWidth(w) = min(w − 32, 400)`, `title2` title, `body` muted
message, row of two `md` Buttons `flex: 1`: cancel `raised`, confirm `destructive`|`primary`,
`role="alertdialog"` + `aria-labelledby`/`aria-describedby`). Pattern: `src/library/FilterSheet.tsx`.
Pure + tested in `confirmLayout.ts`: `alertButtons(request)` (order, styles, default "Cancel"),
`stepPending` (Requested on Some resolves the old one `false`; Resolved → None), `dialogWidth`
(390 → 358, 1280 → 400, 320 → 288). Resolve the §5 VERIFY lines against installed types; record
the finding in the report.
Done: `pnpm check` green; ui-check at 390 and 1280, light and dark, via a temporary probe (a
`confirm()` call wired to a Settings row — remove before reporting): snapshot shows one
`alertdialog` with the title as its accessible name, two buttons ≥ 44 px
(`getBoundingClientRect`), Escape and scrim resolve `false`, the button `true`;
`document.querySelectorAll("h1").length` unchanged while open; four PNGs to the review gallery.
Report ends with `## Exports`: `ConfirmProvider`, `useConfirm`, `ConfirmRequest`, `Confirm`.
Time box: 15 min.

## CONFIRM-2 — wire the inventory (engineer, sonnet, 10 min; starts when CONFIRM-1's `## Exports` landed)
Files: the §1 call sites #1–#9 only: `DataSection.tsx`, `hooks/useAccountErasure.ts`,
`AccountSection.tsx` (+ `hooks/useAccount.ts` only if the request must move into the hook),
`StravaCard.tsx`, `GarminCard.tsx` (or `app/settings/integrations/[provider].tsx` where
`disconnect` is passed), `ProgramActions.tsx`, `app/programs/[programId].tsx`, `DayForm.tsx`,
`app/programs/edit/[programId]/day/[n].tsx`, `LocationEditor.tsx`, `settingsCopy.ts`.
Each row: `const confirm = useConfirm()`; `confirm({ …§3 copy })`.then(ok => ok && action())`.
Replace (not keep) the three inline confirms: `EraseState` loses `Confirming` (`open`/`cancel` →
`request`), `ProgramActions` loses `confirming` + its Banner/Button block, `DayForm` loses
`confirmRemove` ("Remove day" is one `text` Button). Delete the now-unused copy constants
(`DELETE_ACCOUNT_CONFIRM_TITLE`, `_CONFIRM`, `_CANCEL`, `_WORKING` if unused) — no dead exports.
Rows #10–#14 untouched. Update `apps/mobile/CLAUDE.md` lines that say "inline danger confirm" /
"inline Banner confirm (Alert is a no-op on web)" to "`useConfirm` dialog (§confirm-dialogs)".
Done: `pnpm check` green; `grep -rn "useConfirm" apps/mobile/src apps/mobile/app --include='*.tsx'
--include='*.ts' | grep -v "src/ui" | grep -v test` lists ≥ 9 call sites covering every §1
dialog row (paste the grep); `grep -rn "Confirming\|confirmRemove\|setConfirming" apps/mobile`
prints nothing; ui-check at 390: Settings → Sign out opens the dialog, Cancel leaves the session
signed in; Programs → a user program → Delete → confirm navigates to `/programs`.
Time box: 10 min.

## CONFIRM-R — review (reviewer, opus, 8 min; after CONFIRM-2)
Scope: the CONFIRM-1 + CONFIRM-2 diff against the spec. Blockers: a §1 dialog row without
`useConfirm`; any leftover inline confirm state; a hex literal or `letterSpacing` in `Confirm.tsx`;
a button < 44 px; `Promise` rejection path (a `confirm()` must never reject). Should: copy differs
from §3 without a reason. Then the Lead commits.
Time box: 8 min.
