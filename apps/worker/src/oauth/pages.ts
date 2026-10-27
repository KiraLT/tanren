import { MCP_SCOPES, type McpScope } from "@tanren/shared"
import { Array as Arr, Match, Schema } from "effect"
import { WORDMARK_ASPECT, WORDMARK_MASK_DATA_URI } from "./assets"
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

const WEB_URL = "https://tanren.me"

/**
 * The CSP every human-facing page of the OAuth server sends (OAUTH-UI): inline `<style>` only, the
 * wordmark as a `data:` mask image, no scripts, no fetches, never framed. No `form-action`: Chrome
 * applies it to the 302 after `POST /authorize`, which leaves for the client's redirect URI.
 */
export const PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'"

/**
 * Forge tokens (ui-direction-final §2), copied from `apps/mobile/src/ui/colors.ts`: light = bg
 * #FFFFFF, surface #F6F6F7, border #E6E6E8, text #141416, textMuted #5F5F66, accent #C2410C on
 * #FFFFFF, accentSoft #FCE9E0 (the loopback warning: `colors.ts` has no warning role, so the accent
 * pair carries it), success #1E7F3C / #E3F3E8, danger #B3261E / #FBE7E5, focus #1D4ED8; dark = bg #0F1113,
 * surface #181B1F, border #2C3137, text #F2F3F5, textMuted #A3A8B0, accent #FFB020 on #141210, accentSoft #3A2A10,
 * success #4ADE80 / #15301F, danger #FF6B6B / #3A1A19, focus #93C5FD. Space 4/8/12/16/24/48,
 * radius 12/16/999, controls 56 (primary) and 44 (text, links). Fonts: the platform stack, as the
 * app's body text (the condensed display face is not bundled here: no third-party fonts, and a
 * wrangler Data-module route was out of the box).
 */
const STYLE = `
:root{color-scheme:light dark;--bg:#FFFFFF;--surface:#F6F6F7;--border:#E6E6E8;--text:#141416;--muted:#5F5F66;--accent:#C2410C;--on-accent:#FFFFFF;--accent-soft:#FCE9E0;--success:#1E7F3C;--success-soft:#E3F3E8;--danger:#B3261E;--danger-soft:#FBE7E5;--focus:#1D4ED8;--wordmark-h:32px}
@media (prefers-color-scheme:dark){:root{--bg:#0F1113;--surface:#181B1F;--border:#2C3137;--text:#F2F3F5;--muted:#A3A8B0;--accent:#FFB020;--on-accent:#141210;--accent-soft:#3A2A10;--success:#4ADE80;--success-soft:#15301F;--danger:#FF6B6B;--danger-soft:#3A1A19;--focus:#93C5FD}}
@media (min-width:900px){:root{--wordmark-h:40px}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text)}
body{min-height:100svh;display:flex;flex-direction:column;align-items:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:22px;-webkit-font-smoothing:antialiased;overflow-x:hidden}
main{width:100%;max-width:28rem;flex:1;display:flex;flex-direction:column;gap:24px;padding:48px 16px 16px}
@media (min-width:900px){main{padding-top:72px}}
.wordmark{display:block;margin:0;height:var(--wordmark-h);width:calc(var(--wordmark-h) * ${WORDMARK_ASPECT});background:var(--text);-webkit-mask:url("${WORDMARK_MASK_DATA_URI}") center/contain no-repeat;mask:url("${WORDMARK_MASK_DATA_URI}") center/contain no-repeat}
h1{margin:0;font-size:28px;line-height:32px;font-weight:800;letter-spacing:-0.01em}
h1 span{color:var(--accent)}
h2{margin:0;font-size:17px;line-height:22px;font-weight:700}
p{margin:0}
.muted{color:var(--muted);font-size:15px;line-height:20px}
.card{display:flex;flex-direction:column;gap:16px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:16px}
@media (min-width:900px){.card{padding:24px}}
.verified,.warn,.danger{display:flex;gap:12px;padding:12px 16px 12px 12px;border-radius:12px;border-left:3px solid;font-size:15px;line-height:20px}
.verified{border-color:var(--success);background:var(--success-soft)}
.verified svg{flex:none;width:20px;height:20px;color:var(--success)}
.danger{flex-direction:column;gap:4px;border-color:var(--danger);background:var(--danger-soft)}
.danger h2{color:var(--danger)}
.warn{border-color:var(--accent);background:var(--accent-soft);color:var(--text)}
.scopes{display:flex;flex-direction:column;border-top:1px solid var(--border)}
.scope{display:flex;align-items:flex-start;gap:12px;min-height:44px;padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer}
.scope input{flex:none;width:20px;height:20px;margin:1px 0 0;accent-color:var(--accent)}
.scope code{display:block;margin-top:2px;color:var(--muted);font-size:13px;line-height:18px}
.actions{display:flex;flex-direction:column;gap:8px}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;padding:0 24px;border:0;border-radius:999px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
.btn-primary{background:var(--accent);color:var(--on-accent)}
.btn-text{min-height:44px;background:transparent;color:var(--muted);font-weight:600}
.field{display:flex;flex-direction:column;gap:8px}
.field span{font-size:15px;line-height:20px;font-weight:600}
input[type=email]{width:100%;min-height:56px;padding:0 16px;border:1px solid var(--border);border-radius:16px;background:var(--bg);color:var(--text);font:inherit}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.chip{display:block;padding:16px;border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:12px;background:var(--surface);font-size:15px;line-height:20px;overflow-wrap:anywhere;user-select:all}
footer{display:flex;justify-content:center;align-items:center;gap:4px;margin-top:auto;padding-top:24px;color:var(--muted);font-size:15px;line-height:20px}
footer a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;color:var(--muted);text-decoration:none;font-weight:600}
footer a:hover{color:var(--text)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
`

const FOOTER = `<footer><a href="${WEB_URL}/privacy">Privacy</a><span aria-hidden="true">·</span><a href="${WEB_URL}/terms">Terms</a></footer>`

/** The page frame every human-facing page shares: wordmark, one column, the legal footer. */
export const shell = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Tanren</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<a class="wordmark" href="${WEB_URL}" aria-label="Tanren"></a>
${body}
${FOOTER}
</main>
</body>
</html>`

/** Signed out: ask for the email; `next` is the `/authorize?…` URL to return to. */
export const loginPage = (next: string): string =>
  shell(
    "Sign in",
    `<h1>Sign in to Tanren</h1>
<p class="muted">An app wants to connect to your Tanren account. Sign in first; we will email you a link.</p>
<form class="card" method="post" action="/authorize/login">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>
<button class="btn btn-primary" type="submit">Email me a sign-in link</button>
</form>`,
  )

export const checkEmailPage = (email: string): string =>
  shell(
    "Check your email",
    `<h1>Check your email</h1>
<div class="card"><p>We sent a sign-in link to <strong>${escapeHtml(email)}</strong>. Open it in this browser to continue.</p></div>`,
  )

const isMcpScope = Schema.is(Schema.Literals(MCP_SCOPES))

const scopeRow = (scope: McpScope): string =>
  `<label class="scope"><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked><span>${escapeHtml(SCOPE_DESCRIPTIONS[scope])}<code>${escapeHtml(scope)}</code></span></label>`

const CHECK_ICON =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M6 10.5l2.5 2.5L14 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

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
        line: `<p class="verified">${CHECK_ICON}<span>Verified app · ${escapeHtml(domain)}. Only continue if you just started this in ${escapeHtml(name)}.</span></p>`,
        allow: "Allow",
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
  return shell(
    "Allow access",
    `<h1>Allow <span>${escapeHtml(name)}</span> to use your Tanren account?</h1>
<form class="card" method="post" action="/authorize">
${line}
<p class="muted">Access will be sent to <strong>${escapeHtml(consent.redirectHost)}</strong>.</p>
${loopback}
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<div class="scopes">
${scopes.map(scopeRow).join("\n")}
</div>
<div class="actions">
<button class="btn btn-primary" type="submit" name="decision" value="approve">${allow}</button>
<button class="btn btn-text" type="submit" name="decision" value="deny">Deny</button>
</div>
</form>`,
  )
}

export const errorPage = (title: string, message: string): string =>
  shell(
    title,
    `<h1>${escapeHtml(title)}</h1>
<div class="card"><p>${escapeHtml(message)}</p><a class="btn btn-text" href="${WEB_URL}">Open Tanren</a></div>`,
  )
