import { Option } from "effect"
import {
  type ComponentRef,
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
} from "react"
import { Alert, Modal, Platform, Pressable, useWindowDimensions, View } from "react-native"
import { Button } from "./Button"
import { Card } from "./Card"
import {
  alertButtons,
  type Confirm,
  type ConfirmRequest,
  closedState,
  DEFAULT_CANCEL_LABEL,
  DIALOG,
  dialogWidth,
  type Pending,
  stepPending,
} from "./confirmLayout"
import { Text } from "./Text"
import { useTheme } from "./theme"

export type { Confirm, ConfirmRequest } from "./confirmLayout"

/**
 * Without a provider (isolated renders) every confirmation reads as cancelled: the dangerous action
 * does not run. The app mounts `ConfirmProvider` once in `app/_layout.tsx`.
 */
const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false))

/** `confirm(request)` → `Promise<boolean>`; never rejects (docs/design/confirm-dialogs.md §2). */
export function useConfirm(): Confirm {
  return use(ConfirmContext)
}

/** Native: the system alert owns the dialog; no React state (§2). */
const nativeConfirm: Confirm = (request) =>
  new Promise((resolve) => {
    const [cancel, confirm] = alertButtons(request)
    Alert.alert(
      request.title,
      request.message,
      [cancel, confirm].map((button) => ({
        text: button.text,
        style: button.style,
        onPress: () => resolve(button.value),
      })),
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })

/**
 * Provides `useConfirm()`; must render inside `ThemeProvider`. On web `Alert.alert` is a no-op, so
 * the provider keeps the open request and renders the Forge `ConfirmDialog` (§4 state matrix).
 */
export function ConfirmProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(stepPending, closedState)
  // Requests replaced by a later `confirm()` resolve `false` once committed, then leave the state.
  useEffect(() => {
    if (state.dismissed.length > 0) {
      state.dismissed.forEach((replaced) => {
        replaced.resolve(false)
      })
      dispatch({ _tag: "Flushed", flushed: state.dismissed })
    }
  }, [state.dismissed])
  const webConfirm = useCallback<Confirm>(
    (request) =>
      new Promise((resolve) => dispatch({ _tag: "Requested", pending: { request, resolve } })),
    [],
  )
  const settle = (open: Pending, confirmed: boolean) => {
    open.resolve(confirmed)
    dispatch({ _tag: "Resolved" })
  }
  return (
    <ConfirmContext value={Platform.OS === "web" ? webConfirm : nativeConfirm}>
      {children}
      {Option.match(state.open, {
        onNone: () => null,
        onSome: (open) => (
          <ConfirmDialog
            request={open.request}
            onCancel={() => settle(open, false)}
            onConfirm={() => settle(open, true)}
          />
        ),
      })}
    </ConfirmContext>
  )
}

interface ConfirmDialogProps {
  readonly request: ConfirmRequest
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/**
 * `aria-describedby` is not on react-native's View props, but react-native-web reads it
 * (createDOMProps) and native ignores it; spread as an object so no cast is needed (as `Text`'s
 * `aria-level`).
 */
const describedBy = (id: string): { readonly "aria-describedby": string } => ({
  "aria-describedby": id,
})

/** The web dialog (§2 table): scrim, centred `Card`, title, muted message, Cancel · confirm. */
function ConfirmDialog({ request, onCancel, onConfirm }: ConfirmDialogProps) {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const titleId = useId()
  const messageId = useId()
  const box = useRef<ComponentRef<typeof View>>(null)
  const cancelLabel = request.cancelLabel ?? DEFAULT_CANCEL_LABEL
  // react-native-web's Pressable has no `autoFocus` and its Modal focus trap only reacts to focus
  // events, so focus moves to the dialog itself on open; Tab then reaches Cancel first.
  useEffect(() => {
    box.current?.focus()
  }, [])
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onCancel}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.overlay,
          }}
        />
        <View
          ref={box}
          role="alertdialog"
          aria-modal
          aria-labelledby={titleId}
          {...describedBy(messageId)}
          accessibilityViewIsModal
          tabIndex={-1}
          // The box takes focus only to move it into the dialog; the browser ring on it is noise.
          style={{ width: dialogWidth(width), alignSelf: "center", outlineWidth: 0 }}
        >
          <Card padding={DIALOG.padding}>
            <Text variant="title2" id={titleId}>
              {request.title}
            </Text>
            <Text
              variant="body"
              tone="muted"
              id={messageId}
              style={{ marginTop: DIALOG.messageGap }}
            >
              {request.message}
            </Text>
            {/* Each button sits in a `flex: 1` slot and stretches to it: `flex: 1` on the pill itself
                made the `raised` one (1 px border per side) 2 px wider than the confirm pill. */}
            <View
              style={{ flexDirection: "row", marginTop: DIALOG.buttonsGap, gap: DIALOG.buttonGap }}
            >
              <View style={{ flex: 1 }}>
                <Button label={cancelLabel} variant="raised" size="md" onPress={onCancel} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={request.confirmLabel}
                  accessibilityLabel={request.confirmAccessibilityLabel ?? request.confirmLabel}
                  variant={(request.destructive ?? true) ? "destructive" : "primary"}
                  size="md"
                  onPress={onConfirm}
                />
              </View>
            </View>
          </Card>
        </View>
      </View>
    </Modal>
  )
}
