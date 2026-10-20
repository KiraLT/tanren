import { Effect, Option, pipe } from "effect"

export const DEV_API_PORT = 8787

export interface ApiBaseUrlInputs {
  /** `process.env.EXPO_PUBLIC_API_URL`, inlined at bundle time. */
  readonly envUrl: string | undefined
  /** `Constants.expoConfig?.hostUri`, e.g. `"192.168.1.5:8081"` in Expo Go dev. */
  readonly hostUri: string | undefined
  readonly isWeb: boolean
}

const nonEmpty = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0

/** Pure resolution (local-dev §6): env URL, else Metro's host on native, else localhost. */
export const resolveApiBaseUrl = ({ envUrl, hostUri, isWeb }: ApiBaseUrlInputs): string => {
  if (nonEmpty(envUrl)) {
    return envUrl.trim().replace(/\/+$/, "")
  }
  const host = hostUri === undefined ? Option.none() : hostOf(hostUri)
  return !isWeb && Option.isSome(host)
    ? `http://${host.value}:${DEV_API_PORT}`
    : `http://localhost:${DEV_API_PORT}`
}

/** URL parsing keeps IPv6 brackets (`[::1]:8081` → `[::1]`); unparsable or empty → `None`. */
const hostOf = (hostUri: string): Option.Option<string> =>
  pipe(
    parseUrl(`http://${hostUri.trim()}`),
    Option.map((url) => url.hostname),
    Option.filter(nonEmpty),
  )

const parseUrl = Option.liftThrowable((href: string) => new URL(href))

/**
 * The app's API base URL. `expo-constants` is imported lazily so this module loads under Node;
 * if it cannot load, resolution continues without a host URI.
 */
export const apiBaseUrl: Effect.Effect<string> = Effect.tryPromise(
  () => import("expo-constants"),
).pipe(
  Effect.map((module) => module.default.expoConfig?.hostUri),
  Effect.orElseSucceed(() => undefined),
  Effect.map((hostUri) =>
    resolveApiBaseUrl({
      // Static access only: Expo inlines `process.env.EXPO_PUBLIC_*` and `EXPO_OS` at bundle time.
      envUrl: process.env.EXPO_PUBLIC_API_URL,
      hostUri,
      isWeb: process.env.EXPO_OS === "web",
    }),
  ),
)
