import { Match, Option } from "effect"
import { useRouter } from "expo-router"
import { useCallback } from "react"
import { View } from "react-native"
import { type EraseState, useAccountErasure } from "../../hooks/useAccountErasure"
import { useExportData } from "../../hooks/useExportData"
import { Banner, ListRow, space } from "../../ui"
import { SettingsSection } from "./SettingsSection"
import {
  DELETE_ACCOUNT_NOTE,
  DELETE_ACCOUNT_TITLE,
  DELETE_ACCOUNT_WORKING,
  deleteAccountFailure,
  EXPORT_NATIVE_NOTE,
  EXPORT_NATIVE_TITLE,
} from "./settingsCopy"

const IS_WEB = process.env.EXPO_OS === "web"

interface DeleteAccountProps {
  readonly state: EraseState
  readonly request: () => void
}

/** Danger row; tapping it opens the confirm dialog, then the row shows "Deleting…". */
function DeleteAccount({ state, request }: DeleteAccountProps) {
  const working = state._tag === "Working"
  return (
    <View>
      <ListRow
        tone="danger"
        icon="trash"
        title={working ? DELETE_ACCOUNT_WORKING : DELETE_ACCOUNT_TITLE}
        subtitle={DELETE_ACCOUNT_NOTE}
        accessibilityLabel={DELETE_ACCOUNT_TITLE}
        disabled={working}
        onPress={request}
      />
      {state._tag === "Failed" ? (
        <View style={{ padding: space.lg }}>
          <Banner tone="danger" title={deleteAccountFailure(state.reason)} />
        </View>
      ) : null}
    </View>
  )
}

/**
 * Settings > Data: "Export my data" downloads JSON on web (native points at the web app);
 * "Delete account" erases the account on the server and this device, then shows sign-in.
 */
export function DataSection() {
  const exportData = useExportData()
  const router = useRouter()
  // Web reloads so the runtime (signed-in owner, sync loop) is rebuilt on the empty store; native
  // cannot rebuild it in place and replaces the route.
  const onErased = useCallback(
    () => (IS_WEB ? window.location.assign("/sign-in") : router.replace("/sign-in")),
    [router],
  )
  const erasure = useAccountErasure(onErased)
  return (
    <SettingsSection title="Data">
      {[
        Option.match(exportData, {
          onNone: () => (
            <ListRow
              key="export"
              icon="list"
              title={EXPORT_NATIVE_TITLE}
              subtitle={EXPORT_NATIVE_NOTE}
            />
          ),
          onSome: ({ state, start }) => (
            <ListRow
              key="export"
              icon="download"
              title="Export my data"
              accessibilityLabel="Export my data"
              subtitle={Match.value(state).pipe(
                Match.tagsExhaustive({
                  Idle: () => "Download everything on this device as a JSON file",
                  Working: () => "Preparing the file…",
                  Done: ({ fileName }) => `Saved ${fileName}`,
                  Failed: () => "Could not read this device's data. Try again.",
                }),
              )}
              // A second tap while the file is being built would download it twice.
              onPress={() => (state._tag === "Working" ? undefined : start())}
            />
          ),
        }),
        <DeleteAccount key="delete" {...erasure} />,
      ]}
    </SettingsSection>
  )
}
