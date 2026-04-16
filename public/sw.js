// Beyond Money Service Worker
const DISPLAY_VERSION = "1.6";
const BUILD_ID = "__BUILD_TIMESTAMP__";
const CACHE_NAME = `bm-cache-${DISPLAY_VERSION}-${BUILD_ID}`;

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-48x48.png",
  "/icon-72x72.png",
  "/icon-96x96.png",
  "/icon-128x128.png",
  "/icon-144x144.png",
  "/icon-152x152.png",
  "/icon-192x192.png",
  "/icon-256x256.png",
  "/icon-384x384.png",
  "/icon-512x512.png",
  "https://content.beyondmebtw.com/assets/bmb_logos/bmbmoney.png",
  "https://content.beyondmebtw.com/assets/bmb_logos/bmbmoney.ico"
];

// Install - pre-cache essential assets
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing v${DISPLAY_VERSION} (build: ${BUILD_ID})`);

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);

        // Cache index.html under multiple keys
        try {
          const indexResponse = await fetch("/index.html", { cache: "reload" });
          if (indexResponse.ok) {
            await cache.put("/index.html", indexResponse.clone());
            await cache.put("/", indexResponse.clone());
          }
        } catch (err) {
          console.error("[SW] Failed to cache index.html:", err);
        }

        // Cache other static assets
        for (const asset of PRECACHE_ASSETS) {
          if (asset === "/" || asset === "/index.html") continue;
          try {
            const isExternal = asset.startsWith("http");
            await cache.add(new Request(asset, isExternal ? {} : { cache: "reload" }));
          } catch (err) {
            console.warn(`[SW] Failed to cache ${asset}:`, err);
          }
        }

        self.skipWaiting();
      } catch (err) {
        console.error("[SW] Installation failed:", err);
        self.skipWaiting();
      }
    })()
  );
});

// Activate - clean old caches and re-cache app shell + chunks
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating v${DISPLAY_VERSION} (build: ${BUILD_ID})`);

  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
      await cacheAppShellAndChunks();

      // Notify clients
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => {
        client.postMessage({ type: "SW_ACTIVATED", version: DISPLAY_VERSION });
      });
    })()
  );
});

// Cache the app shell HTML and all JS/CSS chunks it references
async function cacheAppShellAndChunks() {
  try {
    const cache = await caches.open(CACHE_NAME);

    const indexResponse = await fetch("/index.html", { cache: "reload" });
    if (indexResponse.ok) {
      await cache.put("/index.html", indexResponse.clone());
      await cache.put("/", indexResponse.clone());
    }

    // Parse HTML for chunk URLs and cache them
    const html = await (await fetch("/", { cache: "reload" })).text();
    const chunkUrls = new Set();
    const patterns = [
      /src="([^"]*\/assets\/[^"]+)"/g,
      /href="([^"]*\/assets\/[^"]+)"/g,
    ];
    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        chunkUrls.add(match[1]);
      }
    }

    for (const url of chunkUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      } catch (e) {}
    }
  } catch (err) {
    console.warn("[SW] App shell/chunk caching failed:", err);
  }
}

// Helper to get cached app shell
async function getAppShell() {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match("/index.html")) ||
    (await cache.match("/")) ||
    null
  );
}

// Fetch handler
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // Google Fonts - cache first (they rarely change)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        }).catch(() => new Response("", { status: 503 }));
      })
    );
    return;
  }

  // API requests (Supabase) - network first with cache fallback
  if (url.hostname.includes("supabase")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: "You are offline", offline: true }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }

  // Navigation - serve app shell (SPA)
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        const cachedShell = await getAppShell();
        if (cachedShell) {
          // Update cache in background
          fetch("/index.html")
            .then((r) => {
              if (r && r.ok) {
                caches.open(CACHE_NAME).then((c) => {
                  c.put("/index.html", r.clone());
                  c.put("/", r.clone());
                });
              }
            })
            .catch(() => {});
          return cachedShell;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("/index.html", networkResponse.clone());
            cache.put("/", networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return new Response(
            "<html><body style='font-family:sans-serif;text-align:center;padding:60px 20px;background:#09111f;color:#f5f7fb'><h1>Offline</h1><p>Please connect to the internet and try again.</p></body></html>",
            { status: 503, headers: { "Content-Type": "text/html" } }
          );
        }
      })()
    );
    return;
  }

  // Static assets - cache first
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|json|mp3|wav)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        }).catch(() => new Response("", { status: 503 }));
      })
    );
    return;
  }

  // Same-origin - cache first with app shell fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        } catch (err) {
          const shell = await getAppShell();
          if (shell) return shell;
          return new Response("Offline", { status: 503 });
        }
      })
    );
    return;
  }

  // External - network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response("Unavailable offline", { status: 503 });
      })
  );
});

// Message handler
self.addEventListener("message", (event) => {
  const data = event.data;

  if (data === "getVersion" || data?.type === "GET_VERSION") {
    event.source.postMessage({ type: "VERSION", version: DISPLAY_VERSION });
  }

  if (data === "skipWaiting" || data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (data?.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        event.source.postMessage({ type: "CACHE_CLEARED" });
      })
    );
  }

  if (data?.type === "REFRESH_APP_CACHE") {
    event.waitUntil(
      cacheAppShellAndChunks().then(async () => {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        event.source.postMessage({
          type: "CACHE_STATUS",
          totalCached: keys.length,
          version: DISPLAY_VERSION,
        });
      })
    );
  }

  if (data?.type === "GET_CACHE_STATUS") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        event.source.postMessage({
          type: "CACHE_STATUS",
          totalCached: keys.length,
          version: DISPLAY_VERSION,
        });
      })()
    );
  }
});
