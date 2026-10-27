# Confirmation dialogs for dangerous operations

Owner ask (2026-10-27 17:55, verbatim): "Our app is missing simle popups to confirm dangerous
operations." Status: accepted (Lead delegation, Amendment 3). Tasks: `docs/tasks/confirm-briefs.md`.

## 1. Inventory (grep 2026-10-27 18:00; `grep -rn -i "delete|abandon|disconnect|erase|sign out|
clear|remove|reset|leave" apps/mobile/app apps/mobile/src --include='*.tsx' | grep -v test`)

| # | Operation | Call site (`file` → symbol) | Destroys | Reversible? | Confirm today | Rule (§3) |
|---|---|---|---|---|---|---|
| 1 | Delete account | `src/components/settings/DataSection.tsx` `DeleteAccount` → `useAccountErasure.confirm` | server account + every row + local DB | permanent | inline Banner + Delete everything / Cancel | dialog |
| 2 | Sign out | `src/components/settings/AccountSection.tsx` `SignOut` → `useAccount.requestSignOut` | session; web reloads to `/today` | re-sign-in by magic link | none | dialog |
| 3 | Disconnect AI clients | `AccountSection.tsx` `DisconnectAiClients` → `useAccount.requestDisconnect` | every MCP token (`POST /api/token/revoke-mcp`) | re-authorise each connector | none | dialog |
| 4 | Disconnect Strava | `src/components/integrations/StravaCard.tsx` `onDisconnect` → `useIntegrations` `Integrations.disconnect` | sealed tokens, export queue | re-connect via OAuth | none | dialog |
| 5 | Disconnect Garmin | `src/components/integrations/GarminCard.tsx` `onDisconnect` → `Integrations.disconnectGarmin` | the personal token (imports stop) | paste the token again | none | dialog |
| 6 | Delete program | `src/player/components/ProgramActions.tsx` `onDelete` → `app/programs/[programId].tsx` `remove` → `ProgramRepo` tombstone (`deletedAt`) | the user program (and its days) | tombstone, no UI to restore → treated as permanent | inline Banner "Delete X? This cannot be undone." + Delete / Cancel | dialog |
| 7 | Leave program | `ProgramActions.tsx` `onLeave` → `runningStatus("abandoned")` | the enrollment's progress (status `abandoned`) | re-enrol starts at day 1 | none | dialog |
| 8 | Remove day | `src/components/programs/DayForm.tsx` `onRemoveDay` → `app/programs/edit/[programId]/day/[n].tsx` `updateAndLeave` | a whole day of a user program (multi-item) | no (saved at once, no undo) | two-tap destructive Button "Remove X? Tap again" | dialog |
| 9 | Delete location | `src/components/settings/LocationEditor.tsx` `deleteRow` → `locationsState.ts` reducer `Remove` (filters the profile's `locations`) | a location and its equipment list; active falls back to the first | no (profile LWW, no tombstone) | none | dialog |
| 10 | Delete food entry | `src/components/health/FoodLog.tsx` `remove` → `useFoodEntryActions.softDelete` | one entry | yes: tombstone + 15 s Undo (`restore`) | undo banner | keep undo, no dialog |
| 11 | Remove item from a day | `src/components/programs/ItemCard.tsx` `onRemove` → `DayForm.onChangeOnce(removeItem)` | one item of a day being edited | re-add via `programs/pick` | none | none (editor edit) |
| 12 | Clear a nutrition target | `app/settings/nutrition.tsx` "Clear" Button → `onChange(Option.none())` | one optional number | re-enter | none | none |
| 13 | Clear filters | `src/library/FilterSheet.tsx`, `CatalogFilterBar.tsx` `Cleared` | view state only | yes | none | none |
| 14 | Close player | `app/programs/play.tsx` `close` (IconButton "Close player") | nothing (the session resumes) | n/a | none | none |

Not dangerous, out of scope: every `Banner tone="danger"` hit (error banners), `TodayReady` /
`swap.tsx` danger banners, "Finish workout" (`PlayerView.tsx` `send("finish")`).
Count: 9 rows get the dialog (#1–#9), 1 keeps undo (#10), 4 get nothing (#11–#14).

## 2. Primitive: `useConfirm` (one, in `src/ui`)

Files: `apps/mobile/src/ui/Confirm.tsx` (provider, hook, web dialog), `apps/mobile/src/ui/confirmLayout.ts`
(pure: sizes, button specs, pending-state step) + `confirmLayout.test.ts`. `ls src/ui | tr A-Z a-z |
sort | uniq -d` prints nothing (no `confirm.ts` beside `Confirm.tsx`). Both exported from `src/ui/index.ts`.
`.claude/rules/react.md`: components call hooks; this hook runs no Effect, so a Promise is the
right shape (components may use Promises; the call sites already `.then` on `remove`/`apply`).

```ts
export interface ConfirmRequest {
  readonly title: string            // sentence case, ≤ 2 lines at 326: "Delete this program?"
  readonly message: string          // what is lost + reversibility, ≤ 3 lines: "Its 12 days are gone for good."
  readonly confirmLabel: string     // verb, 1–2 words: "Delete", "Sign out", "Disconnect", "Leave"
  readonly cancelLabel?: string     // default "Cancel"
  readonly destructive?: boolean    // default true: confirm Button `destructive`; false → `primary`
}
export type Confirm = (request: ConfirmRequest) => Promise<boolean>
export function useConfirm(): Confirm          // throws (dev-only invariant, like useTheme) outside the provider
export function ConfirmProvider({ children }: { readonly children: ReactNode }): JSX.Element
```

Mounted once in `app/_layout.tsx` inside `ThemeProvider` (it needs `useTheme`), around the `Stack`.

- **Native** (`Platform.OS !== "web"`): `Alert.alert(title, message, [{ text: cancelLabel, style:
  "cancel", onPress: () => resolve(false) }, { text: confirmLabel, style: destructive ?
  "destructive" : "default", onPress: () => resolve(true) }], { cancelable: true, onDismiss: () =>
  resolve(false) })`. Cancel is first (iOS left). No React state involved.
- **Web**: `Alert.alert` is a no-op on react-native-web (three code comments say so; the inline
  confirms exist for that reason). The provider keeps `Option<Pending>` (`{ request, resolve }`) and
  renders `ConfirmDialog` while `Some`. A second `confirm()` while one is open resolves the first
  `false` and replaces it (`confirmLayout.ts` `stepPending`, tested). Resolve → `None`.
- Pure part (`confirmLayout.ts`): `alertButtons(request)` (the two-button array above, native and
  tested without `Alert`), `stepPending(pending, event)`, `dialogWidth(viewportWidth)` =
  `min(viewportWidth − 2·gutter.phone, 400)` and `DIALOG` constants below.

### Web `ConfirmDialog` (Forge)

RN `Modal` `transparent` `animationType="fade"` `onRequestClose` → cancel (react-native-web's
`ModalContent.js` closes on `Escape` and `ModalFocusTrap.js` traps focus — verified in
`node_modules/react-native-web/dist/exports/Modal/`). Pattern copied from `src/library/FilterSheet.tsx`
(scrim `Pressable` with `colors.overlay`, `accessibilityViewIsModal` box), centred instead of bottom.

| Part | Spec |
|---|---|
| Scrim | full-screen `Pressable`, `backgroundColor: colors.overlay` (light `rgba(0,0,0,0.18)`, dark `0.6`, `colors.ts`), `accessibilityLabel={cancelLabel}`, press → cancel |
| Box | `Card` (surface, radius 16, padding 16), `width: dialogWidth(w)`, `alignSelf: "center"`, `justifyContent: "center"` on the parent; `role="alertdialog"`, `aria-modal`, `aria-labelledby` = title id, `aria-describedby` = message id (`id`/`nativeID` on the two `Text`s; VERIFY the RN prop names in installed `react-native` types) |
| Title | `Text variant="title2"` (22/28, `tokens.ts`), `headingLevel={2}` is NOT used (a dialog title is not a page heading; the page keeps its one `h1`) |
| Message | `Text variant="body" tone="muted"` (17/22), `marginTop: space.sm` |
| Buttons | row, `marginTop: space.xl`, `gap: space.md`; each `Button size="md"` (48 ≥ 44) with `style={{ flex: 1 }}`; left = cancel `variant="raised"` (Button.tsx rule: a button inside a `Card` uses `raised`; the brief's `secondary` vanishes on the card fill), right = confirm `variant={destructive ? "destructive" : "primary"}`; `autoFocus` on cancel (VERIFY: RNW `Pressable` honours `autoFocus`; else `ref.focus()` in an effect) |

Width at 390: dialog 390 − 2·16 = 358; content 358 − 2·16 = 326; buttons (326 − 12) / 2 = 157 each
(a 157 px `md` pill holds "Delete everything" at headline 17: ≈ 150 px incl. 2·24 padding is
tight → the confirm label is ≤ 12 characters, "Delete everything" becomes "Delete all"; the
accessible name keeps the full phrase). At 1280: 400 wide, content 368, buttons 178. Height, 2-line
message: 16 + 28 + 8 + 44 + 24 + 48 + 16 = 184; 1-line title + 1-line message = 162.
Light / dark: all colours are `useTheme()` roles; no literal hex.

## 3. Rule

Dialog when the action (a) destroys more than one row or a row without a restore UI, (b) ends a
connection or session (sign out, disconnect, revoke), or (c) abandons progress. Undo (15 s Banner)
when a single tombstoned row has a `restore` writer (#10 `FoodEntryRepo.restore`). Nothing when
the action edits a draft the user is already inside (#11), clears a single re-enterable field
(#12), or touches only view state (#13). The three inline confirms (#1, #6, #8) are REPLACED by
`useConfirm` (Amendment 23: no dual pattern); `useAccountErasure` drops the `Confirming` state
(`EraseState` = Idle | Working | Failed; `open` + `cancel` → one `request()`), `ProgramActions`
drops `confirming`, `DayForm` drops `confirmRemove`; the copy constants
`DELETE_ACCOUNT_CONFIRM_TITLE/CONFIRM/CANCEL` move into the request. Why replace rather than keep:
the owner asked for popups, and an inline banner that pushes the list down is the pattern he
did not notice as a confirm.

Dialog copy (title / message / confirmLabel):
1 "Delete your account?" / "Every workout, program and food entry is erased on this device and the server. This cannot be undone." / "Delete all"
2 "Sign out?" / "You will need a new magic link to sign in again." / "Sign out"
3 "Disconnect AI clients?" / "Every connected Claude or ChatGPT loses access until you authorise it again." / "Disconnect"
4 "Disconnect Strava?" / "New workouts stop being sent to Strava. Already sent activities stay." / "Disconnect"
5 "Disconnect Garmin?" / "Imports stop and the stored token is removed. Imported activities stay." / "Disconnect"
6 `Delete ${name}?` / `Its ${days} days are gone for good.` / "Delete"
7 `Leave ${name}?` / "Your progress in it is lost; you can enrol again from day 1." / "Leave"
8 `Remove ${day.title}?` / "Its exercises are removed from the program." / "Remove"
9 `Delete ${location.name}?` / "Its equipment list is removed; the Library falls back to your next location." / "Delete"

## 4. UI state matrix (web `ConfirmProvider`)

| State | In when | Out when | Writer |
|---|---|---|---|
| Closed | `pending` is `None` | a `confirm()` call | initial state; `stepPending(_, Resolved)` |
| Open | `pending` is `Some` | cancel (button, scrim, Escape → `onRequestClose`) or confirm | `stepPending(None, Requested)` |
| Replaced | a second `confirm()` while `Some`: the first promise resolves `false`, the new request shows | same as Open | `stepPending(Some, Requested)` |
| Working (call site) | after `true`, the caller's own `busy`/`Working` state | unchanged from today | the caller's hook (`useAccountErasure`, `perform`, `remove`) |

Native has no state: `Alert.alert` owns the dialog. Loading never lives in the dialog: it closes
on confirm and the row shows its existing "Deleting…" / `loading` state.

## 5. Open VERIFY (engineer, against installed types)

- RN `role="alertdialog"` and `aria-labelledby`/`aria-describedby`/`id` prop names on `View`/`Text`.
- RNW `Pressable` `autoFocus`; `Alert.alert` `AlertOptions.onDismiss` present in RN types.
