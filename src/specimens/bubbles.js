import { taptic } from '../lib/haptics.js'
import { unlock, canPlay, getContext, getMaster } from '../lib/audio.js'
import { isLive } from '../lib/play.js'

const COLORS = [
  '#b7ecff',
  '#7fd4f0',
  '#9ad4ea',
  '#c9f2ff',
  '#6eb8d4',
  '#e7f8ff',
  '#a8c4ff',
  '#d4b7ff',
  '#ffc9b7',
  '#f0d48a',
  '#b7ffd8',
  '#7fb6cc',
]
const ANIMALS = ['dog', 'cat', 'cow', 'horse', 'lion', 'duck', 'sheep']
const MOVE = 12
const POP = 8

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function hexAlpha(hex, a) {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

function kindRoll() {
  const r = Math.random()
  if (r < 0.01) return 'critter'
  if (r < 0.03) return 'chorus'
  if (r < 0.05) return 'dye'
  return 'plain'
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0]
}

function unlockAudio() {
  unlock()
}

function when() {
  return getContext()?.currentTime ?? 0
}

function envGain(duration, peak = 0.9) {
  if (!canPlay()) return null
  const audio = getContext()
  const bus = getMaster()
  if (!audio || !bus) return null
  const g = audio.createGain()
  const t = audio.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.018)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  g.connect(bus)
  return { g, t }
}

function osc(type, freq, duration, peak = 0.5) {
  const audio = getContext()
  const env = envGain(duration, peak)
  if (!audio || !env) return null
  const o = audio.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, audio.currentTime)
  o.connect(env.g)
  o.start(env.t)
  o.stop(env.t + duration)
  return o
}

function noise(duration, peak, filterFreq, q = 1) {
  const audio = getContext()
  const env = envGain(duration, peak)
  if (!audio || !env) return
  const len = Math.max(1, Math.floor(audio.sampleRate * duration))
  const buf = audio.createBuffer(1, len, audio.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = audio.createBufferSource()
  src.buffer = buf
  const f = audio.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = filterFreq
  f.Q.value = q
  src.connect(f)
  f.connect(env.g)
  src.start(env.t)
  src.stop(env.t + duration)
}

function bark() {
  const o = osc('sawtooth', 180, 0.16, 0.45)
  o?.frequency.exponentialRampToValueAtTime(90, when() + 0.14)
  noise(0.12, 0.35, 900, 0.8)
  setTimeout(() => {
    if (!canPlay()) return
    const o2 = osc('sawtooth', 150, 0.12, 0.32)
    o2?.frequency.exponentialRampToValueAtTime(80, when() + 0.1)
  }, 90)
}

function meow() {
  const o = osc('triangle', 780, 0.38, 0.4)
  o?.frequency.exponentialRampToValueAtTime(420, when() + 0.22)
  o?.frequency.exponentialRampToValueAtTime(640, when() + 0.38)
}

function moo() {
  const o = osc('triangle', 130, 0.7, 0.55)
  o?.frequency.exponentialRampToValueAtTime(88, when() + 0.7)
  const o2 = osc('sine', 262, 0.55, 0.12)
  o2?.frequency.exponentialRampToValueAtTime(176, when() + 0.55)
}

function neigh() {
  const audio = getContext()
  const o = osc('sawtooth', 720, 0.55, 0.28)
  if (!audio || !o) return
  o.frequency.exponentialRampToValueAtTime(240, when() + 0.5)
  const lfo = osc('sine', 18, 0.5, 0.0001)
  if (!lfo) return
  const g = audio.createGain()
  g.gain.value = 40
  lfo.connect(g)
  g.connect(o.frequency)
}

function roar() {
  noise(0.7, 0.5, 380, 0.6)
  const o = osc('sine', 70, 0.65, 0.4)
  o?.frequency.exponentialRampToValueAtTime(48, when() + 0.65)
}

function quack() {
  const o = osc('square', 380, 0.12, 0.28)
  o?.frequency.exponentialRampToValueAtTime(260, when() + 0.12)
  setTimeout(() => {
    if (!canPlay()) return
    const o2 = osc('square', 360, 0.11, 0.22)
    o2?.frequency.exponentialRampToValueAtTime(240, when() + 0.1)
  }, 140)
}

function baa() {
  const o = osc('sawtooth', 320, 0.42, 0.28)
  o?.frequency.exponentialRampToValueAtTime(240, when() + 0.2)
  o?.frequency.exponentialRampToValueAtTime(300, when() + 0.42)
  noise(0.3, 0.2, 700, 1.2)
}

const VOICES = { dog: bark, cat: meow, cow: moo, horse: neigh, lion: roar, duck: quack, sheep: baa }

function playAnimal(name) {
  if (!canPlay()) return
  try {
    VOICES[name]?.()
  } catch {
    /* ignore */
  }
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  stage.replaceChildren(canvas)
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  canvas.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none;'

  const frame = stage.closest('.stage-frame') || stage
  let w = 1
  let h = 1
  let dpr = 1
  const bubbles = []
  const critters = []
  const pointers = new Map()
  let raf = 0
  let last = performance.now()
  let t0 = last
  const flock = still ? 10 : reduced ? 7 : 12

  function resize() {
    const r = frame.getBoundingClientRect()
    w = Math.max(1, r.width)
    h = Math.max(1, r.height)
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function spawn(onscreen) {
    const r = 18 + Math.random() * (still ? 38 : 44)
    const speed = (12 + Math.random() * 22) * (reduced ? 0.42 : 1)
    const animal = pick(ANIMALS)
    const color = pick(COLORS)
    const kind = still ? 'plain' : kindRoll()
    let x
    let y
    let vx
    let vy
    if (onscreen) {
      x = r + 8 + Math.random() * Math.max(1, w - 2 * r - 16)
      y = r + 8 + Math.random() * Math.max(1, h - 2 * r - 16)
      const a = Math.random() * Math.PI * 2
      vx = Math.cos(a) * speed
      vy = Math.sin(a) * speed
    } else {
      const edge = (Math.random() * 4) | 0
      const jitter = (Math.random() - 0.5) * 0.9
      if (edge === 0) {
        x = -r - 4
        y = Math.random() * h
        vx = speed * (0.7 + Math.random() * 0.5)
        vy = speed * jitter
      } else if (edge === 1) {
        x = w + r + 4
        y = Math.random() * h
        vx = -speed * (0.7 + Math.random() * 0.5)
        vy = speed * jitter
      } else if (edge === 2) {
        y = -r - 4
        x = Math.random() * w
        vy = speed * (0.7 + Math.random() * 0.5)
        vx = speed * jitter
      } else {
        y = h + r + 4
        x = Math.random() * w
        vy = -speed * (0.7 + Math.random() * 0.5)
        vx = speed * jitter
      }
    }
    bubbles.push({
      x,
      y,
      r,
      vx,
      vy,
      color,
      animal,
      kind,
      phase: Math.random() * Math.PI * 2,
      held: null,
    })
  }

  function hit(x, y) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      const dx = x - b.x
      const dy = y - b.y
      if (dx * dx + dy * dy <= b.r * b.r) return b
    }
    return null
  }

  function collide() {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i]
        const b = bubbles[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.0001
        const min = a.r + b.r
        if (dist >= min) continue
        const nx = dx / dist
        const ny = dy / dist
        const overlap = min - dist
        const ma = a.r * a.r
        const mb = b.r * b.r
        const s = overlap / (ma + mb)
        if (a.held == null) {
          a.x -= nx * s * mb
          a.y -= ny * s * mb
        }
        if (b.held == null) {
          b.x += nx * s * ma
          b.y += ny * s * mb
        }
        const dvx = a.vx - b.vx
        const dvy = a.vy - b.vy
        const rel = dvx * nx + dvy * ny
        if (rel > 0) continue
        const e = 0.92
        const jimp = (-(1 + e) * rel) / (1 / ma + 1 / mb)
        const ix = jimp * nx
        const iy = jimp * ny
        if (a.held == null) {
          a.vx += ix / ma
          a.vy += iy / ma
        }
        if (b.held == null) {
          b.vx -= ix / mb
          b.vy -= iy / mb
        }
      }
    }
  }

  function dropCritter(b) {
    critters.push({
      x: b.x,
      y: b.y,
      vy: 20,
      rot: (Math.random() - 0.5) * 0.4,
      spin: (Math.random() - 0.5) * 1.4,
      color: b.color,
      animal: b.animal,
    })
  }

  function pop(b, chain = false) {
    const idx = bubbles.indexOf(b)
    if (idx < 0) return
    bubbles.splice(idx, 1)
    playAnimal(b.animal)
    taptic(10)
    if (!chain) {
      if (b.kind === 'chorus') {
        for (const o of [...bubbles]) pop(o, true)
      } else if (b.kind === 'dye') {
        const c = pick(COLORS)
        for (const o of bubbles) o.color = c
      } else if (b.kind === 'critter') {
        dropCritter(b)
      }
    } else if (b.kind === 'critter') {
      dropCritter(b)
    }
  }

  function local(e) {
    const box = canvas.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  if (!peek) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button) return
      if (!isLive()) return
      unlockAudio()
      const p = local(e)
      const b = hit(p.x, p.y)
      if (!b || b.held != null) return
      canvas.setPointerCapture(e.pointerId)
      b.held = e.pointerId
      pointers.set(e.pointerId, {
        x: p.x,
        y: p.y,
        sx: p.x,
        sy: p.y,
        t: performance.now(),
        bubble: b,
        moved: false,
      })
    })

    canvas.addEventListener('pointermove', (e) => {
      const rec = pointers.get(e.pointerId)
      if (!rec) return
      const p = local(e)
      const dx = p.x - rec.sx
      const dy = p.y - rec.sy
      if (!rec.moved && Math.hypot(dx, dy) > MOVE) rec.moved = true
      if (rec.moved) {
        const b = rec.bubble
        const now = performance.now()
        const dt = Math.max(0.016, (now - rec.t) / 1000)
        rec.t = now
        b.vx = (p.x - rec.x) / dt
        b.vy = (p.y - rec.y) / dt
        b.x = p.x
        b.y = p.y
        canvas.style.cursor = 'grabbing'
      }
      rec.x = p.x
      rec.y = p.y
    })

    function release(e, doPop) {
      const rec = pointers.get(e.pointerId)
      if (!rec) return
      pointers.delete(e.pointerId)
      rec.bubble.held = null
      canvas.style.cursor = 'grab'
      if (doPop && !rec.moved) {
        const p = local(e)
        if (Math.hypot(p.x - rec.sx, p.y - rec.sy) <= POP) pop(rec.bubble)
      }
    }

    canvas.addEventListener('pointerup', (e) => release(e, true))
    canvas.addEventListener('pointercancel', (e) => release(e, false))
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('lostpointercapture', (e) => {
      if (pointers.has(e.pointerId)) release(e, false)
    })
  }

  function drawBubble(b, t) {
    const bob = reduced || still || !isLive() ? 0 : Math.sin(t * 0.0011 + b.phase) * 3.2
    const y = b.y + bob
    const g = ctx.createRadialGradient(
      b.x - b.r * 0.32,
      y - b.r * 0.38,
      b.r * 0.08,
      b.x,
      y,
      b.r,
    )
    g.addColorStop(0, 'rgba(255,255,255,0.7)')
    g.addColorStop(0.22, hexAlpha(b.color, 0.58))
    g.addColorStop(1, hexAlpha(b.color, 0.1))
    ctx.beginPath()
    ctx.arc(b.x, y, b.r, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = hexAlpha(b.color, 0.9)
    ctx.lineWidth = Math.max(1.2, b.r * 0.055)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(b.x - b.r * 0.28, y - b.r * 0.34, b.r * 0.22, b.r * 0.11, -0.55, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(231,248,255,0.38)'
    ctx.fill()
  }

  function drawCritter(c) {
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(c.rot)
    ctx.fillStyle = c.color
    ctx.beginPath()
    ctx.ellipse(0, 2, 9, 5.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(8, -1, 4.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(6.2, -5.2, 2.1, 3.2, -0.4, 0, Math.PI * 2)
    ctx.ellipse(10.2, -5.2, 2.1, 3.2, 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#02050c'
    ctx.beginPath()
    ctx.arc(9.4, -1.4, 0.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function step(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    const t = now - t0

    if (still) {
      for (const b of bubbles) {
        b.x += b.vx * dt * 0.25
        b.y += b.vy * dt * 0.25
        if (b.x < b.r) {
          b.x = b.r
          b.vx *= -1
        }
        if (b.x > w - b.r) {
          b.x = w - b.r
          b.vx *= -1
        }
        if (b.y < b.r) {
          b.y = b.r
          b.vy *= -1
        }
        if (b.y > h - b.r) {
          b.y = h - b.r
          b.vy *= -1
        }
      }
      collide()
    } else if (isLive()) {
      for (const b of bubbles) {
        if (b.held != null) continue
        b.vx += Math.sin(t * 0.0004 + b.phase) * 2.2 * dt
        b.vy += Math.cos(t * 0.00035 + b.phase * 1.3) * 1.8 * dt
        const sp = Math.hypot(b.vx, b.vy)
        const max = reduced ? 28 : 48
        if (sp > max) {
          b.vx = (b.vx / sp) * max
          b.vy = (b.vy / sp) * max
        }
        b.x += b.vx * dt
        b.y += b.vy * dt
      }
      collide()
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]
        if (b.held != null) continue
        const m = b.r + 72
        if (b.x < -m || b.x > w + m || b.y < -m || b.y > h + m) bubbles.splice(i, 1)
      }
      while (bubbles.length < flock) spawn(false)
    }

    for (let i = critters.length - 1; i >= 0; i--) {
      const c = critters[i]
      c.vy += 980 * dt
      c.y += c.vy * dt
      c.rot += c.spin * dt
      if (c.y > h + 40) critters.splice(i, 1)
    }

    ctx.clearRect(0, 0, w, h)
    for (const b of bubbles) drawBubble(b, t)
    for (const c of critters) drawCritter(c)

    raf = requestAnimationFrame(step)
  }

  const ro = new ResizeObserver(() => {
    resize()
    if (still && bubbles.length === 0) {
      for (let i = 0; i < flock; i++) spawn(true)
    }
  })
  ro.observe(frame)
  resize()
  if (still) {
    for (let i = 0; i < flock; i++) spawn(true)
  } else {
    const n = Math.max(4, Math.round(flock * 0.7))
    for (let i = 0; i < n; i++) spawn(Math.random() < 0.55)
  }
  raf = requestAnimationFrame(step)

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    pointers.clear()
  }
}
