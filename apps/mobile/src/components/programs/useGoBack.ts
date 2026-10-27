import { type Href, useFocusEffect, useRouter } from "expo-router"
import { useCallback, useRef } from "react"

/**
 * Runs a navigation at most once per time the screen has focus: a double tap on Back, Save or a
 * row must not pop two screens or push the same one twice. Focus returning (a pushed screen
 * closed) re-arms it. The flag is a ref, so it is set before React re-renders.
 */
export const useNavGuard = (): ((navigate: () => void) => void) => {
  const used = useRef(false)
  useFocusEffect(
    useCallback(() => {
      // biome-ignore lint/plugin/noMutation: a ref flag, not an array mutation
      used.current = false
    }, []),
  )
  return useCallback((navigate: () => void) => {
    if (used.current) {
      return
    }
    // biome-ignore lint/plugin/noMutation: a ref flag, not an array mutation
    used.current = true
    navigate()
  }, [])
}

/** Back (once), or `fallback` when the screen was opened by a direct load and has no history. */
export const useGoBack = (fallback: Href): (() => void) => {
  const router = useRouter()
  const once = useNavGuard()
  return () => once(() => (router.canGoBack() ? router.back() : router.replace(fallback)))
}
