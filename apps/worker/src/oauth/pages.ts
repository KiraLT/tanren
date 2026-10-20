import type { ConsentDescription } from "@cloudflare/workers-oauth-provider"
import { MCP_SCOPES, type McpScope } from "@tanren/shared"
import { Array as Arr, Schema } from "effect"

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

/** Signed in: approve or deny. Every string in `consent` may come from the client. */
export const consentPage = (consent: ConsentDescription, handle: string): string => {
  const scopes = Arr.filter(consent.scope, isMcpScope)
  const domain =
    consent.clientDomain === undefined
      ? `<p class="muted">The app's name is self-declared and not verified.</p>`
      : `<p>Verified domain: <strong>${escapeHtml(consent.clientDomain)}</strong></p>`
  const loopback = consent.redirectIsLoopback
    ? `<p class="warn">The app receives access on this computer (${escapeHtml(consent.redirectHost)}); any local program could be listening.</p>`
    : ""
  return layout(
    "Allow access",
    `<h1>Allow <span>${escapeHtml(consent.clientName)}</span> to use your Tanren account?</h1>
${domain}
<p>Access will be sent to <strong>${escapeHtml(consent.redirectHost)}</strong>.</p>
${loopback}
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
${scopes.map(scopeRow).join("\n")}
<button type="submit" name="decision" value="approve">Approve</button>
<button type="submit" name="decision" value="deny">Deny</button>
</form>`,
  )
}

export const errorPage = (title: string, message: string): string =>
  layout(title, `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(message)}</p>`)
