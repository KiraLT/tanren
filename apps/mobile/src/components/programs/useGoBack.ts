import { type Href, useRouter } from "expo-router"

/** Back, or `fallback` when the screen was opened by a direct load and has no history. */
export const useGoBack = (fallback: Href): (() => void) => {
  const router = useRouter()
  return () => (router.canGoBack() ? router.back() : router.replace(fallback))
}
