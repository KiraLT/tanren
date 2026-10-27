import { escapeHtml } from "../oauth/pages"

// The root of the MCP host (`GET /` on mcp.tanren.me): a one-screen pointer to the connector URL.
// Read-only and static: built from the configured resource URL only, never from request input, no
// scripts, no cookies. The MCP handler itself stays on `/mcp` (the RFC 8707 resource identifier).

const WEB_URL = "https://tanren.me"

/** Inline styles only: no scripts, no fetches, no forms, never framed. */
export const MCP_LANDING_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

/** Forge colours inline: graphite + off-white + amber (dark), paper + ink + burnt orange (light). */
export const mcpLandingPage = (mcpResourceUrl: string): string => {
  const url = escapeHtml(mcpResourceUrl)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tanren MCP</title>
<style>
:root{--bg:#16181D;--text:#F6F4EF;--muted:#8A919B;--accent:#F59E0B;--rule:#2A2D34}
@media (prefers-color-scheme: light){:root{--bg:#F6F4EF;--text:#16181D;--muted:#6B665E;--accent:#C2410C;--rule:#E4DFD4}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;line-height:1.5}
main{max-width:32rem;padding:2rem 1rem}
h1{font-size:1.5rem;margin:0 0 .5rem}
p{margin:.75rem 0;color:var(--muted)}
code{display:block;margin:1rem 0;padding:.75rem 1rem;border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:8px;color:var(--text);font-size:1rem;overflow-wrap:anywhere}
a{color:var(--accent)}
</style>
</head>
<body>
<main>
<h1>Tanren MCP server</h1>
<p>This host serves the Model Context Protocol endpoint for Tanren. Add it to Claude as a custom connector with this URL:</p>
<code>${url}</code>
<p>Claude signs you in with your Tanren account when you connect.</p>
<p><a href="${WEB_URL}">Open Tanren</a></p>
</main>
</body>
</html>
`
}

/** `GET`/`HEAD /` on the MCP host; the caller checks method and host. */
export const mcpLandingResponse = (request: Request, mcpResourceUrl: string): Response =>
  new Response(request.method === "HEAD" ? null : mcpLandingPage(mcpResourceUrl), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": MCP_LANDING_CSP,
    },
  })
