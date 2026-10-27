import { Array as Arr, Option } from "effect"

/**
 * Hosts whose Client ID Metadata Documents we trust, with the name the consent page shows
 * (docs/design/oauth.md §6a). Exact hosts only, never subdomains: the provider's fetch follows
 * redirects and compares the document's `client_id` with the original URL only, so an open redirect
 * or a taken-over subdomain could otherwise serve a "trusted" document.
 */
export const TRUSTED_CLIENT_HOSTS: ReadonlyArray<readonly [host: string, name: string]> = [
  ["claude.ai", "Claude"],
  ["claude.com", "Claude"],
  ["chatgpt.com", "ChatGPT"],
]

/**
 * Documents live under this path on the trusted hosts (Claude Code `/oauth/claude-code-client-metadata`,
 * ChatGPT `/oauth/client.json`, `/oauth/{callback_id}/client.json`). Widen it only after the claude.ai
 * app's live document URL is observed (the Lead logs it from the first production consent); until then
 * a document elsewhere shows as Unknown, which is safe.
 */
const DOCUMENT_PATH_PREFIX = "/oauth/"

/** The only trusted document whose redirect may be loopback: Claude Code's local callback. */
export const CLAUDE_CODE_DOCUMENT = "https://claude.ai/oauth/claude-code-client-metadata"

/** Who the consent page says the client is. A worker-only view shape: it never crosses a boundary, so no Schema. */
export type ClientTrust =
  | { readonly _tag: "Known"; readonly name: string; readonly domain: string }
  | { readonly _tag: "Unknown" }

export interface ClientTrustInput {
  /** The client ID: for a CIMD client, the document URL. */
  readonly clientId: string
  /** Set by the provider only after it fetched and validated a CIMD document; `None` for registered clients. */
  readonly clientDomain: Option.Option<string>
  readonly redirectHost: string
  readonly redirectIsLoopback: boolean
}

const UNKNOWN: ClientTrust = { _tag: "Unknown" }

const parseUrl = Option.liftThrowable((raw: string) => new URL(raw))

/**
 * `Known` iff the provider verified the document (`clientDomain` is `Some`), its URL is `https://<host>`
 * on a trusted host exactly (no port, no subdomain) under `/oauth/`, and the redirect goes back to that
 * same host (or to loopback for Claude Code's document). A client's self-declared name never counts.
 */
export const clientTrust = (input: ClientTrustInput): ClientTrust =>
  Option.flatMap(input.clientDomain, (domain) =>
    Option.flatMap(parseUrl(input.clientId), (url) =>
      Option.filter(
        Arr.findFirst(TRUSTED_CLIENT_HOSTS, ([host]) => url.host === host),
        ([host]) =>
          url.protocol === "https:" &&
          domain === host &&
          url.pathname.startsWith(DOCUMENT_PATH_PREFIX) &&
          (input.redirectHost === host ||
            (input.redirectIsLoopback && input.clientId === CLAUDE_CODE_DOCUMENT)),
      ),
    ),
  ).pipe(
    Option.match({
      onNone: () => UNKNOWN,
      onSome: ([host, name]): ClientTrust => ({ _tag: "Known", name, domain: host }),
    }),
  )
