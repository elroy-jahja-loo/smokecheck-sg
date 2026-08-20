const CACHE_NAME = "smokecheck-shell-v4";
const RULES_CACHE_NAME = "smokecheck-rules-v2";
const SHELL_URLS = ["/", "/search", "/rules", "/sources", "/offline.html", "/icon.svg", "/manifest.json"];
const PUBLIC_NAVIGATION_PATHS = new Set(["/", "/search", "/rules", "/sources"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RULES_CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (!PUBLIC_NAVIGATION_PATHS.has(url.pathname)) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/offline.html")),
        ),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/rules") {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (isCacheable(response)) {
              const copy = response.clone();
              event.waitUntil(caches.open(RULES_CACHE_NAME).then((cache) => cache.put(request, copy)));
            }
            return response;
          })
          .catch(() => caches.match(request)),
      );
      return;
    }

    if (url.pathname === "/api/geospatial/status") {
      event.respondWith(
        fetch(request).catch(() =>
          caches.match("/api/rules").then((cachedRules) => {
            if (cachedRules) return cachedRules;
            return new Response(JSON.stringify({ error: "offline", message: "No cached data available." }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            });
          }),
        ),
      );
      return;
    }

    if (url.pathname === "/api/geospatial/map-features") {
      event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(request);
          const networkFetch = fetch(request).then((response) => {
            if (isCacheable(response)) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached || new Response(JSON.stringify({ features: [], sanitized: true, offline: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }));
          return cached || networkFetch;
        }),
      );
      return;
    }

    return;
  }

  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (isCacheable(response)) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((response) => {
        if (!isCacheable(response)) return response;
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        return response;
      }).catch(() => caches.match("/offline.html")),
    ),
  );
});

function isCacheable(response) {
  if (!response || !response.ok) return false;
  const cacheControl = response.headers.get("cache-control") ?? "";
  return !/(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/i.test(cacheControl);
}
