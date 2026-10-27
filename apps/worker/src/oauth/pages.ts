import { MCP_SCOPES, type McpScope } from "@tanren/shared"
import { Array as Arr, Match, Schema } from "effect"
import type { ConsentDescription } from "./consent"
import type { ClientTrust } from "./knownClients"

/** What each scope lets Claude do, as shown on the consent page (docs/design/oauth.md §4). */
export const SCOPE_DESCRIPTIONS: Readonly<Record<McpScope, string>> = {
  "tanren:read": "Read your training history and current plan",
  "tanren:write": "Write plan weeks, log sessions and update your profile",
}

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Escapes text for HTML element content and double- or single-quoted attributes. */
export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char)

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · Tanren</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a;background:#fafafa}
h1{font-size:1.4rem}label{display:block;margin:.5rem 0}input[type=email]{width:100%;padding:.5rem;font-size:1rem;box-sizing:border-box}
button{padding:.6rem 1.2rem;font-size:1rem;margin:.5rem .5rem 0 0}.warn{color:#8a4b00}.muted{color:#666}
.verified{color:#067647;font-weight:600}.danger{color:#7a271a;background:#fef3f2;border:1px solid #b42318;border-radius:.5rem;padding:.25rem 1rem;margin:1rem 0}.danger h2{font-size:1.1rem;margin:.5rem 0}
</style>
</head>
<body>
${body}
</body>
</html>`

/** Signed out: ask for the email; `next` is the `/authorize?…` URL to return to. */
export const loginPage = (next: string): string =>
  layout(
    "Sign in",
    `<h1>Sign in to Tanren</h1>
<p>An app wants to connect to your Tanren account. Sign in first; we will email you a link.</p>
<form method="post" action="/authorize/login">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label>Email <input type="email" name="email" required autocomplete="email"></label>
<button type="submit">Email me a sign-in link</button>
</form>`,
  )

export const checkEmailPage = (email: string): string =>
  layout(
    "Check your email",
    `<h1>Check your email</h1>
<p>We sent a sign-in link to <strong>${escapeHtml(email)}</strong>. Open it in this browser to continue.</p>`,
  )

const isMcpScope = Schema.is(Schema.Literals(MCP_SCOPES))

const scopeRow = (scope: McpScope): string =>
  `<label><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked> <strong>${escapeHtml(scope)}</strong>: ${escapeHtml(SCOPE_DESCRIPTIONS[scope])}</label>`

/** The provider's description plus who we say the client is (`clientTrust` of its `clientDomain`). */
export interface ConsentView extends ConsentDescription {
  readonly trust: ClientTrust
}

/** The heading name and the line under it: a known app by our name, anyone else by its own claim. */
const identity = (
  consent: ConsentView,
): { readonly name: string; readonly line: string; readonly allow: string } =>
  Match.value(consent.trust).pipe(
    Match.tagsExhaustive({
      Known: ({ name, domain }) => ({
        name,
        line: `<p class="verified">Verified app · ${escapeHtml(domain)}. Only continue if you just started this in ${escapeHtml(name)}.</p>`,
        allow: "Approve",
      }),
      Unknown: () => ({
        name: consent.clientName,
        allow: "Allow anyway",
        line: `<div class="danger" role="alert">
<h2>Unknown app</h2>
<p>Tanren can't verify who built this app. It calls itself "${escapeHtml(consent.clientName)}" and will return you to ${escapeHtml(consent.redirectHost)}. Only continue if you started this from an app you trust.</p>
${consent.clientDomain === undefined ? "" : `<p>Its identity document is hosted on ${escapeHtml(consent.clientDomain)}.</p>`}
</div>`,
      }),
    }),
  )

/** Signed in: approve or deny. Every string in `consent` may come from the client. */
export const consentPage = (consent: ConsentView, handle: string): string => {
  const scopes = Arr.filter(consent.scope, isMcpScope)
  const { name, line, allow } = identity(consent)
  const loopback = consent.redirectIsLoopback
    ? `<p class="warn">The app receives access on this computer (${escapeHtml(consent.redirectHost)}); any local program could be listening.</p>`
    : ""
  return layout(
    "Allow access",
    `<h1>Allow <span>${escapeHtml(name)}</span> to use your Tanren account?</h1>
${line}
<p>Access will be sent to <strong>${escapeHtml(consent.redirectHost)}</strong>.</p>
${loopback}
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
${scopes.map(scopeRow).join("\n")}
<button type="submit" name="decision" value="approve">${allow}</button>
<button type="submit" name="decision" value="deny">Deny</button>
</form>`,
  )
}

export const errorPage = (title: string, message: string): string =>
  layout(title, `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(message)}</p>`)
