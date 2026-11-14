function localPoint(el, e) {
  const r = el.getBoundingClientRect()
  return {
    id: e.pointerId,
    x: e.clientX - r.left,
    y: e.clientY - r.top,
    cx: e.clientX,
    cy: e.clientY,
    t: performance.now(),
    vx: 0,
    vy: 0,
  }
}

function metrics(pts) {
  const arr = [...pts.values()]
  const n = arr.length
  if (!n) return { arr, n, cx: 0, cy: 0, dist: 0, angle: 0 }
  const cx = arr.reduce((s, p) => s + p.x, 0) / n
  const cy = arr.reduce((s, p) => s + p.y, 0) / n
  let dist = 0
  let angle = 0
  if (n >= 2) {
    dist = Math.hypot(arr[1].x - arr[0].x, arr[1].y - arr[0].y)
    angle = Math.atan2(arr[1].y - arr[0].y, arr[1].x - arr[0].x)
  }
  return { arr, n, cx, cy, dist, angle }
}

export function trackPointers(el, handlers = {}) {
  const pts = new Map()
  let last = { cx: 0, cy: 0, dist: 0, angle: 0 }
  let vx = 0
  let vy = 0

  el.style.touchAction = handlers.touchAction ?? 'none'

  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    el.setPointerCapture?.(e.pointerId)
    const p = localPoint(el, e)
    pts.set(e.pointerId, p)
    last = metrics(pts)
    handlers.down?.({ ...last, event: e, pointers: last.arr, vx, vy })
  }

  const move = (e) => {
    if (!pts.has(e.pointerId)) return
    const prev = pts.get(e.pointerId)
    const p = localPoint(el, e)
    const dt = Math.max(0.008, (p.t - prev.t) / 1000)
    p.vx = (p.x - prev.x) / dt
    p.vy = (p.y - prev.y) / dt
    vx = p.vx
    vy = p.vy
    pts.set(e.pointerId, p)
    const m = metrics(pts)
    const pinch = last.dist > 8 && m.n >= 2 ? m.dist / last.dist : 1
    const rotate = m.n >= 2 ? m.angle - last.angle : 0
    const dx = m.cx - last.cx
    const dy = m.cy - last.cy
    last = m
    handlers.move?.({
      ...m,
      event: e,
      pinch,
      rotate,
      dx,
      dy,
      vx,
      vy,
      pointers: m.arr,
    })
  }

  const up = (e) => {
    if (!pts.has(e.pointerId)) return
    const p = pts.get(e.pointerId)
    pts.delete(e.pointerId)
    const flick = Math.hypot(vx, vy)
    handlers.up?.({
      event: e,
      vx,
      vy,
      flick,
      n: pts.size,
      pointer: p,
      pointers: [...pts.values()],
    })
    if (!pts.size) {
      vx = 0
      vy = 0
    } else {
      last = metrics(pts)
    }
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)

  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
}

export async function requestTilt() {
  try {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const state = await DeviceOrientationEvent.requestPermission()
      return state === 'granted'
    }
    return 'ondeviceorientation' in window
  } catch {
    return false
  }
}

export function onTilt(fn) {
  const handler = (e) => {
    fn({
      beta: e.beta ?? 0,
      gamma: e.gamma ?? 0,
      alpha: e.alpha ?? 0,
    })
  }
  window.addEventListener('deviceorientation', handler)
  return () => window.removeEventListener('deviceorientation', handler)
}
