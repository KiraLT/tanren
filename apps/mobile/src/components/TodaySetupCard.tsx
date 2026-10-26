import { useRouter } from "expo-router"
import { Icon, ListGroup, ListRow, sizes, useTheme } from "../ui"
import { SETUP_BODY, SETUP_TITLE } from "./todaySetup"

/**
 * One-line nudge at the top of Today until the profile has a location (equipment.md §6): a single
 * 56-high row in a `surface` group (`surfaceRaised` equals the page background in light, so it
 * would vanish there), pressing it opens Settings.
 */
export function TodaySetupCard() {
  const router = useRouter()
  const { colors } = useTheme()
  return (
    <ListGroup style={{ paddingVertical: 0 }}>
      <ListRow
        title={SETUP_TITLE}
        subtitle={SETUP_BODY}
        leading={<Icon name="dumbbell" size={sizes.iconMd} color={colors.textMuted} />}
        chevron
        accessibilityLabel={`${SETUP_TITLE}. ${SETUP_BODY}`}
        onPress={() => router.navigate("/settings")}
        style={{ minHeight: sizes.controlLg }}
      />
    </ListGroup>
  )
}
