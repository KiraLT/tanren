import { Match, Option } from "effect"
import { useExportData } from "../../hooks/useExportData"
import { ListRow } from "../../ui"
import { SettingsSection } from "./SettingsSection"
import { EXPORT_NATIVE_NOTE, EXPORT_NATIVE_TITLE } from "./settingsCopy"

/** Settings > Data: "Export my data" downloads JSON on web; native points at the web app. */
export function DataSection() {
  const exportData = useExportData()
  return (
    <SettingsSection title="Data">
      {Option.match(exportData, {
        onNone: () => <ListRow title={EXPORT_NATIVE_TITLE} subtitle={EXPORT_NATIVE_NOTE} />,
        onSome: ({ state, start }) => (
          <ListRow
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
      })}
    </SettingsSection>
  )
}
