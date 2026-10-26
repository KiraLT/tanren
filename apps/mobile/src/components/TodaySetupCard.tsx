import { useRouter } from "expo-router"
import { View } from "react-native"
import { Icon, ListRow, radius, sizes, useTheme } from "../ui"
import { SETUP_BODY, SETUP_TITLE } from "./todaySetup"

/**
 * One-line nudge at the top of Today until the profile has a location (equipment.md §6): a single
 * 56-high row on `surfaceRaised` (ui-polish §3 Today 1), pressing it opens Settings.
 */
export function TodaySetupCard() {
  const router = useRouter()
  const { colors } = useTheme()
  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderCurve: "continuous",
        backgroundColor: colors.surfaceRaised,
        overflow: "hidden",
      }}
    >
      <ListRow
        title={SETUP_TITLE}
        subtitle={SETUP_BODY}
        leading={<Icon name="dumbbell" size={sizes.iconMd} color={colors.textMuted} />}
        chevron
        accessibilityLabel={`${SETUP_TITLE}. ${SETUP_BODY}`}
        onPress={() => router.navigate("/settings")}
        style={{ minHeight: sizes.controlLg, borderBottomWidth: 0 }}
      />
    </View>
  )
}
