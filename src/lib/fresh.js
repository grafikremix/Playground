const KEY = 'playground-build'

function versionUrl() {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}version.json?t=${Date.now()}`
}

function killWorkers() {
  if ('serviceWorker' in navigator) {
    const base = import.meta.env.BASE_URL || '/'
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (regs.length) navigator.serviceWorker.register(`${base}sw.js`).catch(() => {})
      for (const r of regs) r.unregister()
    })
  }
  if (typeof caches === 'undefined') return
  caches.keys().then((keys) => {
    for (const k of keys) caches.delete(k)
  })
}

export function watchBuild() {
  killWorkers()
  fetch(versionUrl(), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      if (!v?.build) return
      const prev = sessionStorage.getItem(KEY)
      sessionStorage.setItem(KEY, v.build)
      if (prev && prev !== v.build) {
        const next = new URL(location.href)
        next.searchParams.set('_b', v.build)
        location.replace(next.href)
      }
    })
    .catch(() => {})
}
