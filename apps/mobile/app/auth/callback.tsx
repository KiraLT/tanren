import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { BigButton } from "../../src/components/BigButton"
import { Screen } from "../../src/components/Screen"
import { colors, space } from "../../src/components/theme"
import { useNativeCallback } from "../../src/hooks/useNativeCallback"

const first = (value: string | ReadonlyArray<string> | undefined): string | undefined =>
  typeof value === "string" ? value : value?.[0]

/**
 * Deep link target of the native sign-in (`exp://<host>/--/auth/callback?code=…` in Expo Go,
 * `tanren://auth/callback` in a build). Exchanges the one-time code, then goes to Today.
 */
export default function AuthCallbackScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string; error?: string }>()
  const state = useNativeCallback({ code: first(params.code), error: first(params.error) })

  useEffect(() => {
    if (state._tag === "Done") {
      router.replace("/today")
    }
  }, [state._tag, router])

  return (
    <Screen>
      <View style={styles.root}>
        {state._tag === "Failed" ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Sign-in failed
            </Text>
            <Text style={styles.message} accessibilityRole="alert">
              {state.message}
            </Text>
            <BigButton
              label="Back to sign-in"
              accessibilityLabel="Back to sign-in"
              variant="primary"
              onPress={() => router.replace("/sign-in")}
            />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.message}>Signing you in…</Text>
          </>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.md, gap: space.md, justifyContent: "center" },
  title: { color: colors.text, fontSize: 32, fontWeight: "900" },
  message: { color: colors.textMuted, fontSize: 20 },
})
