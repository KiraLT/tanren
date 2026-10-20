// ESM on purpose (package.json "type": "module"): Metro >= 0.82 loads it with `import()`, and
// building a new object instead of mutating `getDefaultConfig`'s result keeps the functional lint.
import { getDefaultConfig } from "expo/metro-config"

const base = getDefaultConfig(import.meta.dirname)

/**
 * expo-sqlite on web runs wa-sqlite in a worker: Metro must treat `.wasm` as an asset, and the
 * page must be cross-origin isolated (SharedArrayBuffer), hence COOP/COEP on the dev server.
 * Production hosting sets the same headers (step 7).
 */
const withIsolationHeaders = (middleware) => (request, response, next) => {
  response.setHeader("Cross-Origin-Embedder-Policy", "credentialless")
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin")
  return middleware(request, response, next)
}

export default {
  ...base,
  resolver: { ...base.resolver, assetExts: [...base.resolver.assetExts, "wasm"] },
  server: { ...base.server, enhanceMiddleware: withIsolationHeaders },
}
