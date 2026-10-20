import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { colors, sizes } from "./theme"

interface ScreenProps {
  readonly children: ReactNode
}

/** Dark full-bleed screen with a centred, width-capped column (step 7 adds a second column). */
export function Screen({ children }: ScreenProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <View style={styles.column}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: "center" },
  column: { flex: 1, width: "100%", maxWidth: sizes.contentMaxWidth },
})
