import { escapeHtml, PAGE_CSP, shell } from "../oauth/pages"

// The root of the MCP host (`GET /` on mcp.tanren.me): a one-screen pointer to the connector URL.
// Read-only and static: built from the configured resource URL only, never from request input, no
// scripts, no cookies. The MCP handler itself stays on `/mcp` (the RFC 8707 resource identifier).

const WEB_URL = "https://tanren.me"

/** Inline styles and the `data:` wordmark only: no scripts, no fetches, no forms, never framed. */
export const MCP_LANDING_CSP = `${PAGE_CSP}; form-action 'none'`

/** The shared Forge page frame (`oauth/pages.ts` `shell`): wordmark, column, legal footer. */
export const mcpLandingPage = (mcpResourceUrl: string): string =>
  shell(
    "MCP",
    `<h1>Tanren MCP server</h1>
<p class="muted">This host serves the Model Context Protocol endpoint for Tanren. Add it to Claude as a custom connector with this URL:</p>
<div class="card">
<div class="chip"><code>${escapeHtml(mcpResourceUrl)}</code></div>
<p class="muted">Claude signs you in with your Tanren account when you connect.</p>
<a class="btn btn-primary" href="${WEB_URL}">Open Tanren</a>
</div>`,
  )

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
