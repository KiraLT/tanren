import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect } from "react"
import { ActivityIndicator, View, type ViewStyle } from "react-native"
import { useNativeCallback } from "../../src/hooks/useNativeCallback"
import { Button, Page, space, Text, useTheme } from "../../src/ui"

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
  const { colors } = useTheme()

  useEffect(() => {
    if (state._tag === "Done") {
      router.replace("/today")
    }
  }, [state._tag, router])

  return (
    <Page>
      <View style={content}>
        {state._tag === "Failed" ? (
          <>
            <Text variant="title" accessibilityRole="header">
              Sign-in failed
            </Text>
            <Text tone="muted" accessibilityRole="alert">
              {state.message}
            </Text>
            <Button
              label="Back to sign-in"
              accessibilityLabel="Back to sign-in"
              variant="primary"
              onPress={() => router.replace("/sign-in")}
            />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text tone="muted">Signing you in…</Text>
          </>
        )}
      </View>
    </Page>
  )
}

const content: ViewStyle = { flex: 1, justifyContent: "center", gap: space.lg }
