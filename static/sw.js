// Service worker: makes RestStop installable and opens the app shell offline.
// Network-first for pages/assets (so updates show immediately), never caches the API.

const CACHE = "reststop-v4";
const SHELL = [
  "/",
  "/add.html",
  "/dashboard.html",
  "/css/style.css",
  "/js/common.js",
  "/js/search.js",
  "/js/map.js",
  "/js/add.js",
  "/js/dashboard.js",
  "/icons.svg",
  "/manifest.json",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) {
    return; // let the browser handle it normally
  }
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
