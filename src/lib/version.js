const PREFIX = 'playground-version-'

export function parseVersionParam(search = location.search) {
  const v = new URLSearchParams(search).get('v')
  if (v === 'original' || v === 'edit') return v
  return null
}

export function readStoredVersion(slug) {
  try {
    const v = localStorage.getItem(`${PREFIX}${slug}`)
    if (v === 'original' || v === 'edit') return v
  } catch {
    /* private mode */
  }
  return null
}

export function writeStoredVersion(slug, version) {
  try {
    localStorage.setItem(`${PREFIX}${slug}`, version)
  } catch {
    /* private mode */
  }
}

export function resolveVersion(slug, { peek = false, still = false, search } = {}) {
  if (peek || still) return 'edit'
  const fromUrl = parseVersionParam(search)
  if (fromUrl) {
    writeStoredVersion(slug, fromUrl)
    return fromUrl
  }
  return readStoredVersion(slug) || 'edit'
}

export function setVersionInUrl(version) {
  const next = new URL(location.href)
  next.searchParams.set('v', version)
  history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`)
}
