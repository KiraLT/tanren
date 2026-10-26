import { Option } from "effect"

/** The only page an integration round trip may come back to (design §4). */
export const INTEGRATIONS_PATH = "/settings/integrations"
const NATIVE_SUFFIX = `/--${INTEGRATIONS_PATH}`
/**
 * Stricter than the `ConnectRequest.returnTo` schema (512): the signed `state` carries `returnTo`
 * in base64url and must stay under 600 chars (design §4); 300 → ≤ 563. Real targets are < 100.
 */
export const MAX_RETURN_TO = 300

/**
 * Expo Go shape: `exp(s)://<host>[:port][/<segment>…]/--/settings/integrations`, host letters,
 * digits, `.`, `-`; segments `[A-Za-z0-9_-]+`. No dot segments, escapes, userinfo, query or fragment.
 */
const NATIVE_SHAPE =
  /^exps?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9_-]+)*\/--\/settings\/integrations$/

export interface ReturnToConfig {
  readonly allowedOrigins: ReadonlyArray<string>
  readonly nativeReturnPrefixes: ReadonlyArray<string>
}

const parse = (raw: string): Option.Option<URL> => Option.liftThrowable(() => new URL(raw))()

/**
 * Design §4: `raw` is already WHATWG-serialised (`new URL(raw).href === raw`), carries no query,
 * fragment or credentials, and is either exactly `<allowed origin>/settings/integrations` or starts
 * with a configured native prefix and ends its path with `/--/settings/integrations`.
 */
export const isAllowedIntegrationReturnTo = (raw: string, config: ReturnToConfig): boolean =>
  raw.length <= MAX_RETURN_TO &&
  Option.match(parse(raw), {
    onNone: () => false,
    onSome: (url) =>
      url.href === raw &&
      url.search === "" &&
      url.hash === "" &&
      !raw.includes("#") &&
      !raw.includes("?") &&
      url.username === "" &&
      url.password === "" &&
      (config.allowedOrigins.some(
        (origin) => origin.length > 0 && raw === `${origin}${INTEGRATIONS_PATH}`,
      ) ||
        (NATIVE_SHAPE.test(raw) &&
          url.pathname.endsWith(NATIVE_SUFFIX) &&
          config.nativeReturnPrefixes.some(
            (prefix) => prefix.length > 0 && raw.startsWith(prefix),
          ))),
  })

/** `exp://` / `exps://` go back through an HTML link; `http(s)` through a 303. */
export const isNativeReturnTo = (raw: string): boolean => /^exps?:\/\//.test(raw)
