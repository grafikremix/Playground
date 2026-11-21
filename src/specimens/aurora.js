import { taptic } from '../lib/haptics.js'
import {
  unlock,
  canPlay,
  getMaster,
  tone,
  noise,
} from '../lib/audio.js'
import { isLive } from '../lib/play.js'
import { fitCanvas, observeFrame } from '../lib/canvas.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const N = 32
const CURTAINS = 4
const HOLD = 5
const REACH = 0.9
const K_SPRING = 180
const K_ANCHOR = 28
const DAMP = 2.4
const MASS_DAMP = 0.18

function hsl(h, s, l, a = 1) {
  return `hsla(${h % 360},${s}%,${l}%,${a})`
}

function maxReach(x, y, w, h) {
  return Math.max(
    Math.hypot(x, y),
    Math.hypot(w - x, y),
    Math.hypot(x, h - y),
    Math.hypot(w - x, h - y),
  )
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  canvas.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none;'
  stage.replaceChildren(canvas)

  const frame = stage.closest('.stage-frame') || stage
  let w = 1
  let h = 1
  let dpr = 1
  const stars = []
  const curtains = []
  const sparks = []
  const trails = []
  const fog = []
  let t = 0
  let raf = 0
  let last = performance.now()
  let grab = null
  let hapticAt = 0
  let pad = null
  let tense = null

  function layout() {
    const next = fitCanvas(canvas, ctx, frame)
    if (!next.ok) return
    w = next.w
    h = next.h
    dpr = next.dpr
    if (!stars.length) seedStars()
    if (!curtains.length) {
      for (let i = 0; i < CURTAINS; i++) curtains.push(makeCurtain(i, false))
    } else {
      for (const c of curtains) layoutCurtain(c)
    }
  }

  function seedStars() {
    const n = 90
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.82,
        s: Math.random() < 0.15 ? 2 : 1,
        tw: Math.random() * Math.PI * 2,
        d: 0.15 + Math.random() * 0.8,
      })
    }
  }

  function makeCurtain(slot, creep) {
    const c = {
      slot,
      hue: Math.random() * 360,
      hueV: 10 + Math.random() * 16,
      phase: Math.random() * Math.PI * 2,
      alpha: creep ? 0 : 1,
      creep: creep ? 0 : 1,
      gone: false,
      nodes: [],
    }
    layoutCurtain(c)
    if (creep) {
      for (const n of c.nodes) {
        n.y = n.restY - h * 0.42
        n.x = n.restX
      }
    }
    return c
  }

  function layoutCurtain(c) {
    const y0 = h * (0.16 + (c.slot % CURTAINS) * 0.07)
    const x0 = -w * 0.04
    const x1 = w * 1.04
    const span = (x1 - x0) / (N - 1)
    if (!c.nodes.length) {
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1)
        const restX = x0 + span * i
        const restY = y0 + Math.sin(u * Math.PI * 2 + c.phase) * h * 0.035
        c.nodes.push({ x: restX, y: restY, vx: 0, vy: 0, restX, restY, restLen: span })
      }
    } else {
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1)
        const n = c.nodes[i]
        n.restX = x0 + span * i
        n.restY = y0 + Math.sin(u * Math.PI * 2 + c.phase) * h * 0.035
        n.restLen = span
      }
    }
  }

  function nearest(x, y) {
    let best = null
    let bd = 48
    for (const c of curtains) {
      if (c.gone || c.creep < 0.7) continue
      for (let i = 0; i < c.nodes.length; i++) {
        const n = c.nodes[i]
        const d = Math.hypot(n.x - x, n.y - y)
        if (d < bd) {
          bd = d
          best = { c, i, n }
        }
      }
    }
    return best
  }

  function tensionOf(g, px, py) {
    const dist = Math.hypot(px - g.ox, py - g.oy)
    const reach = Math.max(64, g.reach)
    const distN = Math.min(1, dist / reach)
    const timeN = Math.min(1, g.held / HOLD)
    return { dist, reach, distN, timeN, value: distN * (0.35 + 0.65 * (g.held / Math.max(0.2, HOLD))) }
  }

  function ensureFx() {
    if (peek || still || pad) return
    const a = unlock()
    const bus = getMaster()
    if (!a || !bus || !canPlay()) return
    const o1 = a.createOscillator()
    const o2 = a.createOscillator()
    o1.type = 'sine'
    o2.type = 'sine'
    o1.frequency.value = 196
    o2.frequency.value = 294
    const g = a.createGain()
    g.gain.value = 0.0001
    const lfo = a.createOscillator()
    const lg = a.createGain()
    lfo.frequency.value = 0.12
    lg.gain.value = 0.012
    lfo.connect(lg)
    lg.connect(g.gain)
    o1.connect(g)
    o2.connect(g)
    g.connect(bus)
    o1.start()
    o2.start()
    lfo.start()
    const nlen = Math.floor(a.sampleRate * 0.4)
    const buf = a.createBuffer(1, nlen, a.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < nlen; i++) data[i] = Math.random() * 2 - 1
    const src = a.createBufferSource()
    src.buffer = buf
    src.loop = true
    const bp = a.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 0.6
    const ng = a.createGain()
    ng.gain.value = 0.018
    src.connect(bp)
    bp.connect(ng)
    ng.connect(bus)
    src.start()

    const to = a.createOscillator()
    to.type = 'sawtooth'
    to.frequency.value = 90
    const tg = a.createGain()
    tg.gain.value = 0
    const tr = a.createOscillator()
    const trg = a.createGain()
    tr.frequency.value = 6
    trg.gain.value = 0
    tr.connect(trg)
    trg.connect(tg.gain)
    to.connect(tg)
    tg.connect(bus)
    to.start()
    tr.start()

    pad = {
      setTension(v) {
        const t0 = a.currentTime
        g.gain.setTargetAtTime(0.028 + v * 0.02, t0, 0.08)
        ng.gain.setTargetAtTime(0.018 + v * 0.03, t0, 0.08)
        to.frequency.setTargetAtTime(90 + v * 420, t0, 0.05)
        tr.frequency.setTargetAtTime(5 + v * 14, t0, 0.05)
        trg.gain.setTargetAtTime(v * 0.045, t0, 0.05)
        tg.gain.setTargetAtTime(v * 0.0001, t0, 0.04)
        tg.gain.setTargetAtTime(v * 0.07, t0, 0.08)
      },
      stop() {
        try {
          o1.stop()
          o2.stop()
          lfo.stop()
          src.stop()
          to.stop()
          tr.stop()
        } catch {
          /* already */
        }
      },
    }
    tense = pad
    pad.setTension(0)
  }

  function sfxBoing() {
    tone({ type: 'triangle', freq: 280, duration: 0.22, peak: 0.09, slide: 92 })
    tone({ type: 'sine', freq: 420, duration: 0.14, peak: 0.05, slide: 180 })
  }

  function sfxBoom(x) {
    const pan = 0.85 + (x / w) * 0.15
    noise({ duration: 0.38, peak: 0.1 * pan, freq: 140, q: 0.6, type: 'lowpass', slide: 50 })
    tone({ type: 'sine', freq: 72, duration: 0.32, peak: 0.08, slide: 32 })
  }

  function sfxCrack() {
    noise({ duration: 0.07, peak: 0.06, freq: 2400, q: 0.9, type: 'highpass' })
  }

  function sfxLaunch() {
    noise({ duration: 0.22, peak: 0.055, freq: 900, q: 0.7, type: 'bandpass', slide: 1800 })
    tone({ type: 'sine', freq: 540, duration: 0.18, peak: 0.05, slide: 880 })
  }

  function sfxFog() {
    noise({ duration: 0.9, peak: 0.05, freq: 280, q: 0.5, type: 'lowpass', slide: 90 })
  }

  function burstAt(x, y, hue) {
    sfxLaunch()
    sfxBoom(x)
    const count = reduced ? 22 : 52
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 80 + Math.random() * 260
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 1.15 + Math.random() * 1.1,
        age: 0,
        hue: hue + Math.random() * 50 - 25,
        r: 1.6 + Math.random() * 2.4,
      })
    }
  }

  function explode(c, px, py) {
    sfxLaunch()
    for (let i = 0; i < c.nodes.length; i += 2) {
      const n = c.nodes[i]
      burstAt(n.x, n.y, c.hue + i * 8)
    }
    burstAt(px, py, c.hue)
    c.gone = true
    c.bursting = true
    for (let i = 0; i < 18; i++) {
      fog.push({
        x: c.nodes[i % c.nodes.length].x,
        y: c.nodes[i % c.nodes.length].y,
        vx: (Math.random() - 0.5) * 12,
        vy: -8 - Math.random() * 18,
        r: 30 + Math.random() * 50,
        a: 0.18,
        life: 1.8 + Math.random() * 0.8,
        age: 0,
      })
    }
    sfxFog()
    window.setTimeout(() => {
      if (still) return
      curtains.push(makeCurtain(c.slot, true))
    }, 700)
    const idx = curtains.indexOf(c)
    if (idx >= 0) window.setTimeout(() => {
      const at = curtains.indexOf(c)
      if (at >= 0) curtains.splice(at, 1)
    }, 80)
  }

  function onDown(e) {
    if (e.button || peek || still || !isLive()) return
    unlock()
    ensureFx()
    canvas.setPointerCapture?.(e.pointerId)
    const box = canvas.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const hit = nearest(x, y)
    if (!hit) return
    grab = {
      id: e.pointerId,
      c: hit.c,
      i: hit.i,
      ox: x,
      oy: y,
      reach: maxReach(x, y, w, h),
      held: 0,
    }
    canvas.style.cursor = 'grabbing'
  }

  function onMove(e) {
    if (!grab || e.pointerId !== grab.id) return
    const box = canvas.getBoundingClientRect()
    grab.px = e.clientX - box.left
    grab.py = e.clientY - box.top
  }

  function onUp(e) {
    if (!grab || e.pointerId !== grab.id) return
    unlock()
    const g = grab
    grab = null
    canvas.style.cursor = 'grab'
    if (tense) tense.setTension(0)
    const n = g.c.nodes[g.i]
    if (n && !g.c.gone) {
      n.vx *= 0.2
      n.vy *= 0.2
      sfxBoing()
    }
  }

  if (!peek) {
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  function stepCurtain(c, dt) {
    if (c.bursting) {
      c.alpha = Math.max(0, c.alpha - dt * 1.4)
      return
    }
    if (c.gone) return
    if (c.creep < 1) {
      c.creep = Math.min(1, c.creep + dt * 0.35)
      c.alpha = c.creep * c.creep * (3 - 2 * c.creep)
    }
    c.hue += c.hueV * dt
    const wind = reduced ? 4 : 18
    const nodes = c.nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const pinned = grab && grab.c === c && grab.i === i
      if (pinned) {
        const px = grab.px ?? grab.ox
        const py = grab.py ?? grab.oy
        n.vx = (px - n.x) / Math.max(dt, 0.008)
        n.vy = (py - n.y) / Math.max(dt, 0.008)
        n.x = px
        n.y = py
        continue
      }
      let ax = (n.restX - n.x) * K_ANCHOR
      let ay = (n.restY - n.y) * K_ANCHOR
      ay += Math.sin(t * 0.7 + n.restX * 0.012 + c.phase) * wind
      ax += Math.sin(t * 0.45 + n.restY * 0.01) * wind * 0.35
      if (c.creep < 1) ay += (1 - c.creep) * 40
      n.vx += ax * dt
      n.vy += ay * dt
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i]
      const b = nodes[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 0.0001
      const f = (d - a.restLen) * K_SPRING
      const nx = dx / d
      const ny = dy / d
      const pinA = grab && grab.c === c && grab.i === i
      const pinB = grab && grab.c === c && grab.i === i + 1
      if (!pinA) {
        a.vx += nx * f * dt
        a.vy += ny * f * dt
      }
      if (!pinB) {
        b.vx -= nx * f * dt
        b.vy -= ny * f * dt
      }
    }
    const drag = Math.exp(-DAMP * dt)
    const bounce = 1 - MASS_DAMP * dt
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (grab && grab.c === c && grab.i === i) continue
      n.vx *= drag
      n.vy *= drag
      n.vx = Math.max(-1400, Math.min(1400, n.vx))
      n.vy = Math.max(-1400, Math.min(1400, n.vy))
      n.x += n.vx * dt * bounce
      n.y += n.vy * dt * bounce
    }
  }

  function stepFx(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]
      p.age += dt
      p.vy += 420 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.995
      if (p.age > p.life * 0.45 && Math.random() < 0.08) {
        trails.push({ x: p.x, y: p.y, hue: p.hue, a: 0.5, r: 1.2 })
        if (Math.random() < 0.35) sfxCrack()
      }
      if (p.age > p.life) sparks.splice(i, 1)
    }
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].a -= dt * 1.8
      trails[i].r += dt * 8
      if (trails[i].a <= 0) trails.splice(i, 1)
    }
    for (let i = fog.length - 1; i >= 0; i--) {
      const f = fog[i]
      f.age += dt
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.r += dt * 22
      f.a = 0.16 * (1 - f.age / f.life)
      if (f.age > f.life) fog.splice(i, 1)
    }
  }

  function drawStars() {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#02050c'
    ctx.fillRect(0, 0, w, h)
    for (const s of stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.8 + s.d) + s.tw))
      ctx.globalAlpha = 0.25 + 0.75 * tw * s.d
      ctx.fillStyle = '#b7ecff'
      ctx.fillRect((s.x * w) | 0, (s.y * h) | 0, s.s, s.s)
    }
    ctx.globalAlpha = 1
  }

  function drawCurtain(c) {
    if (c.gone || c.alpha < 0.02) return
    const nodes = c.nodes
    let jitter = 0
    if (grab && grab.c === c) {
      const ten = tensionOf(grab, grab.px ?? grab.ox, grab.py ?? grab.oy)
      jitter = (ten.distN * 6 + ten.timeN * 10) * ten.distN
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = c.alpha
    const ray = h * 0.38
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const u = i / (nodes.length - 1)
      const hue = c.hue + u * 140 + Math.sin(t * 0.4 + i * 0.2) * 18
      const jx = jitter ? Math.sin(t * 38 + i) * jitter : 0
      const jy = jitter ? Math.cos(t * 41 + i * 1.3) * jitter * 0.6 : 0
      const x = n.x + jx
      const y = n.y + jy
      const g = ctx.createLinearGradient(x, y - ray * 0.15, x, y + ray)
      g.addColorStop(0, hsl(hue, 80, 72, 0))
      g.addColorStop(0.18, hsl(hue + 20, 90, 68, 0.22))
      g.addColorStop(0.4, hsl(hue, 85, 58, 0.16))
      g.addColorStop(1, hsl(hue - 20, 70, 40, 0))
      ctx.fillStyle = g
      const ww = Math.max(6, n.restLen * 1.15)
      ctx.beginPath()
      ctx.ellipse(x, y + ray * 0.28, ww, ray * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const jx = jitter ? Math.sin(t * 38 + i) * jitter : 0
      const jy = jitter ? Math.cos(t * 41 + i * 1.3) * jitter * 0.6 : 0
      if (i === 0) ctx.moveTo(n.x + jx, n.y + jy)
      else ctx.lineTo(n.x + jx, n.y + jy)
    }
    ctx.strokeStyle = hsl(c.hue + 40, 90, 78, 0.45)
    ctx.lineWidth = 2.2
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  function drawSparks() {
    ctx.globalCompositeOperation = 'lighter'
    for (const p of sparks) {
      const k = 1 - p.age / p.life
      ctx.fillStyle = hsl(p.hue, 90, 70, 0.15 + 0.7 * k)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * (0.6 + k), 0, Math.PI * 2)
      ctx.fill()
    }
    for (const tr of trails) {
      ctx.fillStyle = hsl(tr.hue, 80, 75, tr.a)
      ctx.beginPath()
      ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    for (const f of fog) {
      ctx.fillStyle = `rgba(183,236,255,${f.a * 0.45})`
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function poseStill() {
    const c = curtains[1] || curtains[0]
    if (!c) return
    const n = c.nodes[(N * 0.55) | 0]
    n.x += w * 0.18
    n.y += h * 0.16
    for (let i = 0; i < c.nodes.length; i++) {
      const p = c.nodes[i]
      const k = Math.exp(-Math.abs(i - ((N * 0.55) | 0)) * 0.22)
      p.x += w * 0.18 * k
      p.y += h * 0.16 * k
    }
    burstAt(w * 0.62, h * 0.28, 40)
    burstAt(w * 0.38, h * 0.22, 200)
    for (const p of sparks) {
      p.age = p.life * 0.25
    }
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    if (still || isLive()) t += dt
    if (!still && isLive()) {
      if (grab && !grab.c.gone) {
        grab.held += dt
        const px = grab.px ?? grab.ox
        const py = grab.py ?? grab.oy
        const ten = tensionOf(grab, px, py)
        if (tense) tense.setTension(Math.min(1, ten.value))
        const interval = 220 - Math.min(180, ten.value * 160)
        if (now - hapticAt > interval) {
          hapticAt = now
          taptic(6 + ten.value * 18)
        }
        if (ten.distN >= REACH && grab.held >= HOLD) {
          explode(grab.c, px, py)
          if (tense) tense.setTension(0)
          grab = null
          canvas.style.cursor = 'grab'
        }
      }
      for (const c of curtains) stepCurtain(c, dt)
      stepFx(dt)
    }
    drawStars()
    ctx.globalCompositeOperation = 'lighter'
    for (const c of curtains) drawCurtain(c)
    drawSparks()
    raf = requestAnimationFrame(tick)
  }

  const ro = observeFrame(frame, () => layout())
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
    pad?.stop()
  }
}
