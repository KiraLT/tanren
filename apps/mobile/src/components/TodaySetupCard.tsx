import { useRouter } from "expo-router"
import { View } from "react-native"
import { Button, Card, Icon, sizes, space, Text, useTheme } from "../ui"
import { SETUP_BODY, SETUP_TITLE } from "./todaySetup"

/** One-line nudge at the top of Today until the profile has a location (equipment.md §6). */
export function TodaySetupCard() {
  const router = useRouter()
  const { colors } = useTheme()
  return (
    <Card accessibilityLabel={`${SETUP_TITLE}. ${SETUP_BODY}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Icon name="dumbbell" size={sizes.iconMd} color={colors.textMuted} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="headline">{SETUP_TITLE}</Text>
          <Text variant="subhead" tone="muted">
            {SETUP_BODY}
          </Text>
        </View>
        <Button
          label="Set up"
          accessibilityLabel="Set up your equipment"
          variant="secondary"
          onPress={() => router.navigate("/settings")}
        />
      </View>
    </Card>
  )
}
