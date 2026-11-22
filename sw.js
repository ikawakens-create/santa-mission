// =============================================================
//  Service Worker
//  ★ config.js やコードを変えたら、CACHE_VERSION を1つ上げてデプロイ ★
// =============================================================
const CACHE_VERSION = "v4";
const CACHE_NAME = `santa-mission-${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./config.js",
  "./css/style.css",
  "./js/app.js",
  "./js/audio.js",
  "./js/storage.js",
  "./js/camera.js",
  "./js/admin.js",
  "./js/santa-rig.js",
  "./js/posegame.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("santa-mission-") && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // config.js だけは Network-First（オンラインなら最新）
  if (url.pathname.endsWith("/config.js")) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ページを開くとき（オフラインでも index.html を返す）
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then(hit => hit || fetch(req))
    );
    return;
  }

  // それ以外は Cache-First
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
