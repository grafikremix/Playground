let last = 0

export function taptic(ms = 12) {
  const now = performance.now()
  if (now - last < 32) return
  last = now
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported, including most iOS Safari */
  }
}

export function tapticPattern(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}
