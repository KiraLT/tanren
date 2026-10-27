// Tanren web service worker (PWA-1). TEMPLATE: `scripts/serviceWorker.ts` writes it into
// `dist/sw.js` after `expo export --platform web`, replacing VERSION and PRECACHE with the export's
// content hash and file list (`src/pwa/precache.ts`). Never served as is: no `public/sw.js` exists,
// so an export without that step has no worker and the page's registration fails quietly.
//
// - install: precache the shell (`/`), every bundle, font, wasm, sound, icon and the manifest into
//   `tanren-precache-<VERSION>`. No skipWaiting: a new export waits until no page of the old one is
//   open (the next launch), so a running page never loses the chunks it was built with.
// - activate: delete older precaches, claim the open pages.
// - navigations: network first (fresh index.html → newest bundle hashes when online), the precached
//   shell when the network fails or is slower than NAVIGATION_TIMEOUT_MS. Responses are stored
//   with their headers, so the cached shell keeps COOP/COEP and the page stays crossOriginIsolated
//   (sqlite wasm + OPFS) offline.
// - same-origin `/_expo/` and `/assets/` GETs: cache first. Illustrations and muscle maps are not
//   precached; each is kept in `tanren-media` on first view. Range requests (audio) and every
//   other origin (the API) pass through untouched.
const VERSION = "__TANREN_SW_VERSION__"
const PRECACHE = ["__TANREN_SW_PRECACHE__"]

const PRECACHE_NAME = `tanren-precache-${VERSION}`
const PRECACHE_PREFIX = "tanren-precache-"
const MEDIA_CACHE = "tanren-media"
const MEDIA_PREFIXES = ["/assets/assets/illustrations/", "/assets/assets/musclemaps/"]
const CACHE_FIRST_PREFIXES = ["/_expo/", "/assets/"]
const NAVIGATION_TIMEOUT_MS = 4000

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })))),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PRECACHE_PREFIX) && key !== PRECACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("navigation timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

const cachedShell = () =>
  caches
    .open(PRECACHE_NAME)
    .then((cache) => cache.match("/"))
    .then((response) => response ?? Response.error())

const navigate = (request) =>
  withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS).catch(() => cachedShell())

const cacheFirst = (request, path) =>
  caches.match(request).then(
    (cached) =>
      cached ??
      fetch(request).then((response) =>
        response.ok && MEDIA_PREFIXES.some((prefix) => path.startsWith(prefix))
          ? caches
              .open(MEDIA_CACHE)
              .then((cache) => cache.put(request, response.clone()))
              .then(() => response)
          : response,
      ),
  )

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return
  }
  if (request.mode === "navigate") {
    event.respondWith(navigate(request))
    return
  }
  if (
    !request.headers.has("range") &&
    CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    event.respondWith(cacheFirst(request, url.pathname))
  }
})
