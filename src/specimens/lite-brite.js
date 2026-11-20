import { taptic } from '../lib/haptics.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const FADE = 1
const DIM = 0.1

function hsl(h, s, l) {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function candy() {
  const h = Math.random() < 0.18 ? 48 + Math.random() * 12 : Math.random() * 360
  return hsl(h, 86 + Math.random() * 10, 54 + Math.random() * 10)
}

function rgb(c, k) {
  return `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  canvas.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;-webkit-user-select:none;user-select:none;'

  let refresh = null
  if (!peek && !still) {
    refresh = document.createElement('button')
    refresh.type = 'button'
    refresh.className = 'refresh'
    refresh.textContent = 'Refresh'
    refresh.addEventListener('click', () => location.reload())
    stage.replaceChildren(canvas, refresh)
  } else {
    stage.replaceChildren(canvas)
  }

  const frame = stage.closest('.stage-frame') || stage
  const r = still ? 9.2 : 5 + Math.random() * 8.5
  const gap = r * 0.7 + 5
  const step = r * 2 + gap
  let w = 1
  let h = 1
  let dpr = 1
  let cols = 0
  let rows = 0
  let ox = 0
  let oy = 0
  let n = 0
  const colors = []
  let light = new Float32Array(0)
  const lastPt = new Map()
  let raf = 0
  let last = performance.now()
  let wanderT = 0
  let wanderPrev = null

  function layout() {
    const box = frame.getBoundingClientRect()
    w = Math.max(1, box.width)
    h = Math.max(1, box.height)
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const pad = Math.max(10, r)
    cols = Math.max(1, Math.floor((w - pad * 2) / step) + 1)
    rows = Math.max(1, Math.floor((h - pad * 2) / step) + 1)
    ox = (w - (cols - 1) * step) / 2
    oy = (h - (rows - 1) * step) / 2
    n = cols * rows
    while (colors.length < n) colors.push(candy())
    if (light.length !== n) {
      const next = new Float32Array(n)
      next.set(light.subarray(0, Math.min(light.length, n)))
      light = next
    }
  }

  function poseStill() {
    const cx = (cols / 2) | 0
    const cy = (rows / 2) | 0
    const pts = []
    for (let i = 0; i < Math.min(cols, rows) * 0.9; i++) {
      const t = i / 8
      const gx = Math.max(0, Math.min(cols - 1, (cx - cols * 0.28 + i * 0.72) | 0))
      const gy = Math.max(0, Math.min(rows - 1, (cy + Math.sin(t) * rows * 0.22) | 0))
      pts.push(gy * cols + gx)
    }
    pts.forEach((idx, i) => {
      light[idx] = Math.max(light[idx], 1 - i * 0.045)
    })
  }

  function lightCell(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return
    const i = gy * cols + gx
    const was = light[i]
    light[i] = 1
    if (!peek && !still && was < 0.22) taptic(8)
  }

  function stamp(x, y) {
    const gx = Math.round((x - ox) / step)
    const gy = Math.round((y - oy) / step)
    const hit = r + 1.25
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = gx + dx
        const iy = gy + dy
        const cx = ox + ix * step
        const cy = oy + iy * step
        if (Math.hypot(x - cx, y - cy) <= hit) lightCell(ix, iy)
      }
    }
  }

  function stroke(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0)
    const nStep = Math.max(1, Math.ceil(dist / Math.max(1.6, r * 0.45)))
    for (let i = 0; i <= nStep; i++) {
      const t = i / nStep
      stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
    }
  }

  function local(e) {
    const box = canvas.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  function track(e, start) {
    const p = local(e)
    const prev = lastPt.get(e.pointerId)
    if (start || !prev) stamp(p.x, p.y)
    else stroke(prev.x, prev.y, p.x, p.y)
    lastPt.set(e.pointerId, p)
  }

  function onDown(e) {
    if (e.button) return
    canvas.setPointerCapture?.(e.pointerId)
    track(e, true)
  }

  function onMove(e) {
    const hovering = e.pointerType === 'mouse'
    const dragging = lastPt.has(e.pointerId) || e.buttons
    if (!hovering && !dragging) return
    track(e, false)
  }

  function onUp(e) {
    lastPt.delete(e.pointerId)
  }

  if (!peek) {
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave', (e) => lastPt.delete(e.pointerId))
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  function wander(dt) {
    wanderT += dt
    const x = ox + (0.5 + 0.42 * Math.sin(wanderT * 2.15)) * (cols - 1) * step
    const y = oy + (0.5 + 0.38 * Math.sin(wanderT * 1.62 + 1.2)) * (rows - 1) * step
    if (wanderPrev) stroke(wanderPrev.x, wanderPrev.y, x, y)
    else stamp(x, y)
    wanderPrev = { x, y }
  }

  function draw() {
    ctx.fillStyle = '#02050c'
    ctx.fillRect(0, 0, w, h)
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const i = gy * cols + gx
        const L = light[i]
        const c = colors[i]
        const x = ox + gx * step
        const y = oy + gy * step
        if (L > 0.02) {
          ctx.fillStyle = rgb(c, 0.35 * L)
          ctx.beginPath()
          ctx.arc(x, y, r * (1.15 + 0.55 * L), 0, Math.PI * 2)
          ctx.fill()
        }
        const k = DIM + (1 - DIM) * (L * L * (3 - 2 * L))
        ctx.fillStyle = rgb(c, k)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    if (!still) {
      const decay = dt / FADE
      for (let i = 0; i < n; i++) {
        if (light[i] > 0) light[i] = Math.max(0, light[i] - decay)
      }
      if (peek && !reduced) wander(dt)
    }
    draw()
    raf = requestAnimationFrame(tick)
  }

  const ro = new ResizeObserver(() => {
    layout()
    if (still) poseStill()
  })
  ro.observe(frame)
  layout()
  if (still) poseStill()
  last = performance.now()
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
  }
}
