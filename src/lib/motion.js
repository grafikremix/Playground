export const reduced =
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

export function raf(fn) {
  let id = 0
  let last = performance.now()
  const loop = (now) => {
    id = requestAnimationFrame(loop)
    const dt = Math.min(0.032, (now - last) / 1000)
    last = now
    fn(dt, now)
  }
  id = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(id)
}

export function spring(pos, vel, target, dt, k = 180, d = 16) {
  const a = -k * (pos - target) - d * vel
  vel += a * dt
  pos += vel * dt
  return [pos, vel]
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function rand(a, b) {
  return a + Math.random() * (b - a)
}

export function observeVisible(el, onChange) {
  if (typeof IntersectionObserver === 'undefined') {
    onChange(true)
    return () => {}
  }
  const io = new IntersectionObserver(
    ([entry]) => onChange(entry.isIntersecting),
    { rootMargin: '80px' },
  )
  io.observe(el)
  return () => io.disconnect()
}

export function pointer(el, handlers) {
  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return
    el.setPointerCapture?.(e.pointerId)
    handlers.down?.(e)
  }
  const onMove = (e) => handlers.move?.(e)
  const onUp = (e) => handlers.up?.(e)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('lostpointercapture', onUp)
  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('lostpointercapture', onUp)
  }
}

export function whenVisible(el, tick) {
  let visible = true
  let stopRaf = () => {}
  const start = () => {
    stopRaf()
    stopRaf = raf(tick)
  }
  const unobserve = observeVisible(el, (v) => {
    visible = v
    if (v) start()
    else stopRaf()
  })
  start()
  return () => {
    unobserve()
    stopRaf()
  }
}
