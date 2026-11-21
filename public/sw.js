// Kill-switch. This repo never shipped a service worker; if an old
// registration still controls /Playground/, this replaces it and leaves.
self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(Promise.resolve())
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.registration.unregister()
      const windows = await self.clients.matchAll({ type: 'window' })
      for (const c of windows) c.navigate(c.url)
    })(),
  )
})
