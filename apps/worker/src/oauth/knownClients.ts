import { Array as Arr, Option, Schema } from "effect"

/**
 * Hosts whose Client ID Metadata Documents we trust, with the name the consent page shows
 * (docs/design/oauth.md §Identities). Matched by host, not exact URL: Anthropic does not publish the
 * claude.ai app's document URL, and ChatGPT's varies per connection (`/oauth/{callback_id}/client.json`).
 */
export const TRUSTED_CLIENT_HOSTS: ReadonlyArray<readonly [host: string, name: string]> = [
  ["claude.ai", "Claude"],
  ["claude.com", "Claude"],
  ["chatgpt.com", "ChatGPT"],
]

/** Who the consent page says the client is. `Known` only for a verified domain on the allowlist. */
export const ClientTrust = Schema.Union([
  Schema.TaggedStruct("Known", { name: Schema.String, domain: Schema.String }),
  Schema.TaggedStruct("Unknown", {}),
])
export type ClientTrust = typeof ClientTrust.Type

/** `domain` is `host` itself or one of its subdomains (`www.claude.ai`, never `claude.ai.evil.com`). */
const isHostOrSubdomain = (domain: string, host: string): boolean =>
  domain === host || domain.endsWith(`.${host}`)

/**
 * Trust from the provider's `clientDomain` alone: it is set only for CIMD clients, whose document
 * the provider fetched from that host. A registered client's name is self-declared, so it never counts.
 */
export const clientTrust = (clientDomain: Option.Option<string>): ClientTrust =>
  Option.flatMap(clientDomain, (domain) =>
    Option.map(
      Arr.findFirst(TRUSTED_CLIENT_HOSTS, ([host]) =>
        isHostOrSubdomain(domain.toLowerCase(), host),
      ),
      ([, name]): ClientTrust => ({ _tag: "Known", name, domain }),
    ),
  ).pipe(Option.getOrElse((): ClientTrust => ({ _tag: "Unknown" })))
