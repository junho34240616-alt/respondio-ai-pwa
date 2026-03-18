self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => self.registration.unregister()).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', () => {
  // Offline caching is intentionally disabled to avoid stale webapp bundles.
})
