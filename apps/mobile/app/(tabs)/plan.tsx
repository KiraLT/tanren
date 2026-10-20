import { StyleSheet, Text, View } from "react-native"
import { Screen } from "../../src/components/Screen"
import { colors, space } from "../../src/components/theme"

// Stub: the real Plan screen (current week) is built in step 7.
export default function PlanScreen() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.heading} accessibilityRole="header">
          This week
        </Text>
        <Text style={styles.body}>Your plan for the week shows up here soon.</Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: 12 },
  heading: { color: colors.text, fontSize: 36, fontWeight: "900" },
  body: { color: colors.textMuted, fontSize: 20 },
})
