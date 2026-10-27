/// <reference path="./fonts/fontModules.d.ts" />
// The reference: tsconfig.test.json includes only listed files, so it reaches the `*.woff2` module
// declaration through this import's owner.
import { Option } from "effect"
import { DISPLAY_FONT_PATH } from "./assets"
import displayFont from "./fonts/barlow-condensed-800.woff2"

// The Forge display face for the Worker's human-facing pages (OAUTH-FONT), served by this Worker
// so the pages load nothing from a third-party host. Kept apart from `assets.ts` because the Node
// test project imports `pages.ts` → `assets.ts` and cannot load a wrangler Data module.

const FONT_HEADERS = {
  "content-type": "font/woff2",
  "cache-control": "public, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
} as const

/**
 * `GET`/`HEAD /oauth/assets/*`: the one font file, or 404 for any other name. `none` for every
 * other path, which the caller hands to the router.
 */
export const serveOAuthAsset = (request: Request): Option.Option<Response> => {
  const { pathname } = new URL(request.url)
  if (!pathname.startsWith("/oauth/assets/")) {
    return Option.none()
  }
  const found =
    pathname === DISPLAY_FONT_PATH && (request.method === "GET" || request.method === "HEAD")
  return Option.some(
    found
      ? new Response(request.method === "HEAD" ? null : displayFont, {
          status: 200,
          headers: { ...FONT_HEADERS, "content-length": String(displayFont.byteLength) },
        })
      : new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } }),
  )
}
