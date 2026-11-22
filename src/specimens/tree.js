import { taptic } from '../lib/haptics.js'
import { unlock, tone, noise, canPlay, getMaster, loopNoise } from '../lib/audio.js'
import { isLive } from '../lib/play.js'
import { fitCanvas, clearBacking, watchFrame } from '../lib/canvas.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const ICE = '#b7ecff'
const GOLD = '#ffe08a'
const ORANGE = '#ff9a3a'
const BG = '#02050c'
const FALL_MAX = 96
const SETTLED_MAX = 90
const RAIN_N = 42
const SNOW_N = 56
const SLICE_SPEED = 1.15
const GRAB_SPEED = 0.62
const KINDS = ['spring', 'summer', 'autumn', 'winter', 'pine']

const PAL = {
  spring: { wood: ICE, leaf: '#c8ffb0', leaf2: '#8dff9a', pine: false, weather: 'rain' },
  summer: { wood: '#9ee4f6', leaf: '#5ee87a', leaf2: '#c4ff6a', pine: false, weather: 'breeze' },
  autumn: { wood: '#ffc07a', leaf: ORANGE, leaf2: GOLD, pine: false, weather: 'wind' },
  winter: { wood: '#8fb6cc', leaf: '#e7f8ff', leaf2: ICE, pine: false, weather: 'snow' },
  pine: { wood: '#7fb6cc', leaf: '#7dffea', leaf2: ICE, pine: true, weather: 'snow' },
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy || 1
  let t = ((px - ax) * dx + (py - ay) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return { t, x: ax + dx * t, y: ay + dy * t, d: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) }
}

function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const den = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx)
  if (Math.abs(den) < 1e-6) return null
  const t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / den
  const u = ((ax - cx) * (ay - by) - (ay - cy) * (ax - bx)) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: ax + t * (bx - ax), y: ay + t * (by - ay), t, u }
}

function safe(fn) {
  try {
    return fn()
  } catch {
    return null
  }
}

function sfxRustle(amp = 0.05) {
  safe(() => noise({ duration: 0.09, peak: Math.min(0.08, amp), freq: 920, q: 0.7, type: 'bandpass', slide: 420 }))
}

function sfxCreak() {
  safe(() => tone({ type: 'sawtooth', freq: 70 + Math.random() * 30, duration: 0.16, peak: 0.045, slide: 48 }))
}

function sfxSnap() {
  safe(() => noise({ duration: 0.12, peak: 0.1, freq: 1800, q: 0.8, type: 'highpass', slide: 700 }))
  safe(() => tone({ type: 'triangle', freq: 220, duration: 0.14, peak: 0.06, slide: 90 }))
}

function sfxSlice() {
  safe(() => noise({ duration: 0.08, peak: 0.09, freq: 2400, q: 0.6, type: 'highpass', slide: 900 }))
  safe(() => tone({ type: 'sine', freq: 1480, duration: 0.07, peak: 0.05, slide: 420 }))
}

function sfxLand() {
  safe(() => tone({ type: 'sine', freq: 240 + Math.random() * 80, duration: 0.04, peak: 0.02 }))
}

function sfxReset() {
  safe(() => noise({ duration: 0.18, peak: 0.05, freq: 640, q: 0.7, type: 'bandpass', slide: 280 }))
  safe(() => tone({ type: 'sine', freq: 392, duration: 0.16, peak: 0.05, slide: 523 }))
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d', { alpha: false })
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
  canvas.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none;position:relative;z-index:0;'

  const frame = stage.closest('.stage-frame') || stage
  let resetBtn = null
  stage.replaceChildren(canvas)
  if (!peek && !still) {
    resetBtn = document.createElement('button')
    resetBtn.type = 'button'
    resetBtn.className = 'refresh'
    resetBtn.textContent = 'New tree'
    resetBtn.addEventListener('click', onReset)
    resetBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
    frame.appendChild(resetBtn)
  }

  let w = 1
  let h = 1
  let dpr = 1
  let u = 10
  let ground = 0
  let sky = 0
  let treeH = 1
  let kind = 'summer'
  let pal = PAL.summer
  let seed = 1
  let lastKind = null
  const nodes = []
  const sticks = []
  const falling = []
  const settled = []
  const pool = []
  const rain = []
  const snow = []
  const puddles = []
  const groundSnow = []
  const trail = []
  const grabs = new Map()
  const recoils = []
  let lastTip = null
  let gust = 0
  let t = 0
  let raf = 0
  let frames = 0
  let last = performance.now()
  let creakT = 0
  let peekT = 0
  let peekDir = 1
  let ambient = null
  let chirpT = 0
  let sliceArmed = false
  const swipe = { x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, pt: 0, speed: 0, active: false }

  function promptOpen() {
    return document.body.classList.contains('is-prompt')
  }

  function live() {
    return isLive() && !promptOpen()
  }

  function syncHits() {
    const on = !peek && !still && live()
    canvas.style.pointerEvents = on ? 'auto' : 'none'
  }

  function layout() {
    const next = fitCanvas(canvas, ctx, frame)
    if (!next.ok) return false
    w = next.w
    h = next.h
    dpr = next.dpr
    u = Math.max(7, Math.min(w, h) / 28)
    ground = h * 0.88
    sky = peek || still ? Math.max(8, h * 0.05) : Math.max(64, h * 0.1)
    treeH = Math.max(80, (ground - sky) * 0.82)
    return true
  }

  function takeBit() {
    return (
      pool.pop() || {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rot: 0,
        rv: 0,
        pine: false,
        wood: false,
        snow: false,
        rain: false,
        len: 0,
        thick: 0,
        size: 0,
        age: 0,
        sleep: false,
        hue: GOLD,
      }
    )
  }

  function freeBit(p) {
    p.sleep = false
    p.wood = false
    p.snow = false
    p.rain = false
    pool.push(p)
  }

  function drain(list) {
    while (list.length) freeBit(list.pop())
  }

  function spawnFall(x, y, vx, vy, opts = {}) {
    if (falling.length >= FALL_MAX) freeBit(falling.shift())
    const p = takeBit()
    p.x = x
    p.y = y
    p.vx = vx
    p.vy = vy
    p.rot = Math.random() * Math.PI
    p.rv = (Math.random() - 0.5) * 8
    p.pine = !!opts.pine
    p.wood = !!opts.wood
    p.snow = !!opts.snow
    p.rain = !!opts.rain
    p.len = opts.len || 0
    p.thick = opts.thick || 0
    p.size = opts.size || u * 0.14
    p.age = 0
    p.sleep = false
    p.hue = opts.hue || pal.leaf
    falling.push(p)
    return p
  }

  function addNode(x, y, role, pin = false) {
    const n = {
      i: nodes.length,
      x,
      y,
      px: x,
      py: y,
      restX: x,
      restY: y,
      pin,
      falling: false,
      role,
      grab: false,
    }
    nodes.push(n)
    return n
  }

  function addStick(a, b, role, thick) {
    const s = {
      i: sticks.length,
      a,
      b,
      rest: Math.hypot(b.x - a.x, b.y - a.y) || 8,
      stiff: role === 'trunk' ? 0.42 : role === 'limb' ? 0.22 : role === 'branch' ? 0.16 : 0.12,
      role,
      thick,
      alive: true,
      falling: false,
      leaves: [],
      snow: pal.weather === 'snow' ? 0.4 + Math.random() * 0.6 : 0,
      parent: -1,
      kids: [],
    }
    sticks.push(s)
    return s
  }

  function leafN(depth) {
    if (pal.pine) {
      if (depth < 2) return 2
      if (depth === 2) return 6
      return 7
    }
    const winter = kind === 'winter'
    if (depth < 2) return winter ? 0 : 2
    if (depth === 2) return winter ? 2 : 5
    return winter ? 2 : 4
  }

  function sprinkle(s, n, rnd) {
    for (let i = 0; i < n; i++) {
      s.leaves.push({
        along: 0.2 + rnd() * 0.78,
        side: rnd() < 0.5 ? -1 : 1,
        size: pal.pine ? u * (0.11 + rnd() * 0.1) : u * (0.13 + rnd() * 0.15),
        rot: (rnd() - 0.5) * 0.9,
        on: true,
        pine: pal.pine,
        hue: rnd() < 0.55 ? pal.leaf : pal.leaf2,
        phase: rnd() * Math.PI * 2,
      })
    }
  }

  function growBranch(parentNode, depth, maxD, ang, len, thick, rnd, parentStick) {
    const role = depth === 1 ? 'limb' : depth === 2 ? 'branch' : 'twig'
    const steps = depth === 1 ? 4 : depth === 2 ? 3 : 2
    let prev = parentNode
    let first = null
    const segs = []
    for (let i = 0; i < steps; i++) {
      const step = len / steps
      const wob = ang + (rnd() - 0.5) * 0.08
      const n = addNode(prev.x + Math.cos(wob) * step, prev.y + Math.sin(wob) * step, role)
      const s = addStick(prev, n, role, Math.max(1.05, thick * (1 - i * 0.12)))
      if (i === 0 && parentStick) {
        s.parent = parentStick.i
        parentStick.kids.push(s.i)
      } else if (segs.length) {
        const prevS = segs[segs.length - 1]
        s.parent = prevS.i
        prevS.kids.push(s.i)
      }
      if (!first) first = s
      segs.push(s)
      sprinkle(s, i === steps - 1 ? leafN(depth) : Math.max(0, leafN(depth) - 2), rnd)
      prev = n
    }
    if (depth >= maxD) return first
    const kids = depth === 1 ? 2 + (rnd() < 0.4 ? 1 : 0) : depth === 2 ? 1 + (rnd() < 0.7 ? 1 : 0) : 1
    for (let i = 0; i < kids; i++) {
      const side = (i + depth) % 2 === 0 ? -1 : 1
      const childAng = ang + side * (0.38 + rnd() * 0.5)
      const from = segs[Math.min(segs.length - 1, 1 + (i % Math.max(1, segs.length - 1)))]
      growBranch(from.b, depth + 1, maxD, childAng, len * (0.52 + rnd() * 0.14), thick * 0.58, rnd, from)
    }
    return first
  }

  function storeRest() {
    for (const n of nodes) {
      n.restX = n.x
      n.restY = n.y
      n.px = n.x
      n.py = n.y
    }
  }

  function grow(kindName, forcedSeed) {
    nodes.length = 0
    sticks.length = 0
    drain(falling)
    drain(settled)
    trail.length = 0
    grabs.clear()
    recoils.length = 0
    lastTip = null
    kind = kindName
    pal = PAL[kind] || PAL.summer
    lastKind = kind
    seed = (forcedSeed ?? ((Math.random() * 0x7fffffff) | 0)) || 1
    let s = seed >>> 0
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 4294967296
    }
    const rootX = w * 0.5
    const root = addNode(rootX, ground, 'trunk', true)
    const trunkN = 6
    const tLen = treeH * 0.52
    let prev = root
    const trunk = []
    for (let i = 0; i < trunkN; i++) {
      const n = addNode(prev.x + (rnd() - 0.5) * 2, prev.y - tLen / trunkN, 'trunk', false)
      const st = addStick(prev, n, 'trunk', Math.max(3.6, 10.2 - i * 1.15))
      if (trunk.length) {
        st.parent = trunk[trunk.length - 1].i
        trunk[trunk.length - 1].kids.push(st.i)
      }
      trunk.push(st)
      prev = n
    }
    for (let i = 1; i < trunkN; i++) {
      const nLimbs = i === 1 ? 2 : i >= 4 ? 3 : 2
      const maxD = i >= 4 ? 4 : 3
      for (let j = 0; j < nLimbs; j++) {
        const side = (i + j) % 2 === 0 ? -1 : 1
        const ang = -Math.PI / 2 + side * (0.42 + rnd() * 0.5 + (i === 1 ? 0.12 : 0))
        const len = treeH * (0.22 + rnd() * 0.08 + (i >= 4 ? 0.04 : 0))
        growBranch(trunk[i].b, 1, maxD, ang, len, 5.4 - i * 0.32, rnd, trunk[i])
      }
    }
    growBranch(prev, 1, 4, -Math.PI / 2 + (rnd() - 0.5) * 0.2, treeH * 0.2, 4.6, rnd, trunk[trunk.length - 1])
    storeRest()
    seedWeather()
  }

  function seedWeather() {
    rain.length = 0
    snow.length = 0
    puddles.length = 0
    groundSnow.length = 0
    if (pal.weather === 'rain') {
      for (let i = 0; i < RAIN_N; i++) {
        rain.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vy: 320 + Math.random() * 180,
          len: 10 + Math.random() * 10,
        })
      }
      for (let i = 0; i < 7; i++) {
        puddles.push({
          x: w * (0.12 + i * 0.12) + (Math.random() - 0.5) * 18,
          y: ground + 6,
          r: 6 + Math.random() * 8,
          a: 0.18,
        })
      }
    }
    if (pal.weather === 'snow') {
      for (let i = 0; i < SNOW_N; i++) {
        snow.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 18,
          vy: 28 + Math.random() * 26,
          r: 1.1 + Math.random() * 1.6,
        })
      }
      const bins = 28
      for (let i = 0; i < bins; i++) groundSnow.push(0)
    }
  }

  function leafWorld(s, leaf) {
    const ax = s.a.x
    const ay = s.a.y
    const wa = Math.atan2(s.b.y - ay, s.b.x - ax)
    const ang = wa + leaf.rot
    const spread = s.thick * 1.5 + leaf.size * 0.85
    const breeze = Math.sin(t * (pal.weather === 'wind' ? 4.2 : 2.4) + leaf.phase) * gust * (pal.pine ? 3.2 : 5.5)
    const x = ax + Math.cos(wa) * s.rest * leaf.along + Math.cos(ang + Math.PI / 2) * leaf.side * spread + breeze
    const y = ay + Math.sin(wa) * s.rest * leaf.along + Math.sin(ang + Math.PI / 2) * leaf.side * spread
    return { x, y, ang }
  }

  function nearest(px, py) {
    let best = null
    let bestScore = Infinity
    for (const s of sticks) {
      if (!s.alive || s.falling) continue
      const hit = distSeg(px, py, s.a.x, s.a.y, s.b.x, s.b.y)
      let d = hit.d
      for (const leaf of s.leaves) {
        if (!leaf.on) continue
        const lp = leafWorld(s, leaf)
        const ld = Math.hypot(px - lp.x, py - lp.y) - leaf.size * 1.8
        if (ld < d) d = Math.max(0, ld)
      }
      const pad = s.role === 'trunk' ? 70 : s.role === 'limb' ? 150 : 100
      if (d > pad) continue
      const prefer = s.role === 'limb' ? 28 : s.role === 'branch' ? 12 : s.role === 'trunk' ? 8 : 0
      const onWood = hit.d < Math.max(16, s.thick * 2.2) ? 40 : 0
      const nearTip = hit.t > 0.72 ? 18 : 0
      const score = d - prefer - onWood - nearTip
      if (score < bestScore) {
        bestScore = score
        best = {
          s,
          t: Math.max(0.2, hit.t),
          node: s.role === 'trunk' ? (hit.t < 0.5 ? s.a : s.b) : s.b,
        }
      }
    }
    return best
  }

  function heldSet() {
    const held = new Set()
    for (const g of grabs.values()) if (g.node) held.add(g.node)
    return held
  }

  function drivenSet() {
    const driven = heldSet()
    for (const r of recoils) if (r.node) driven.add(r.node)
    return driven
  }

  function startRecoil(node) {
    if (!node || node.pin) return
    for (let i = recoils.length - 1; i >= 0; i--) {
      if (recoils[i].node === node) recoils.splice(i, 1)
    }
    const omega = 13.2
    const zeta = 0.1
    const wd = omega * Math.sqrt(1 - zeta * zeta)
    let n = node
    let delay = 0
    const seen = new Set()
    for (let hop = 0; hop < 6 && n && !n.pin && !seen.has(n); hop++) {
      seen.add(n)
      const x0 = n.x - n.restX
      const y0 = n.y - n.restY
      const vx0 = -x0 * 0.85
      const vy0 = -y0 * 0.85
      recoils.push({
        node: n,
        t: -delay,
        ax: x0,
        ay: y0,
        bx: (vx0 + zeta * omega * x0) / wd,
        by: (vy0 + zeta * omega * y0) / wd,
      })
      const stick = sticks.find((s) => s.alive && s.b === n)
      if (!stick) break
      n = stick.a
      delay += 0.028
    }
  }

  function stepTree(dt) {
    const held = heldSet()
    const driven = drivenSet()
    const interacting = held.size > 0
    if (pal.weather === 'wind') gust = 0.65 + Math.sin(t * 0.7) * Math.sin(t * 1.3) * 0.7
    else if (pal.weather === 'breeze') gust = 0.28 + Math.sin(t * 0.9) * 0.18
    else gust = 0.12 + Math.sin(t * 0.55) * 0.08

    const g = pal.weather === 'snow' ? 420 : 520
    const damp = interacting ? 0.999 : 0.968
    const spring = interacting ? 0 : 0.032
    const windX = gust * (pal.weather === 'wind' ? 22 : pal.weather === 'breeze' ? 12 : 5) * (interacting ? 0.25 : 1)

    for (const n of nodes) {
      if (n.pin || n.grab || driven.has(n)) continue
      const vx = (n.x - n.px) * damp
      const vy = (n.y - n.py) * damp
      const ox = n.x
      const oy = n.y
      n.x += vx + windX * dt * (n.role === 'trunk' ? 0.12 : 1)
      n.y += vy + (n.falling ? g : 70) * dt * dt
      if (!n.falling && spring) {
        n.x += (n.restX - n.x) * spring
        n.y += (n.restY - n.y) * spring
      }
      n.px = ox
      n.py = oy
      if (n.y > ground) {
        n.y = ground
        n.py = n.y - vy * 0.35
        if (n.falling) n.px = n.x - vx * 0.4
      }
    }

    const iters = interacting ? 8 : 3
    for (let k = 0; k < iters; k++) {
      for (const s of sticks) {
        if (!s.alive && !s.falling) continue
        const a = s.a
        const b = s.b
        let dx = b.x - a.x
        let dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.001
        const diff = (dist - s.rest) / dist
        const stiff = s.falling ? 0.85 : interacting ? Math.min(0.12, s.stiff) : s.stiff
        const ex = dx * 0.5 * diff * stiff
        const ey = dy * 0.5 * diff * stiff
        if (!a.pin && !a.grab && !driven.has(a)) {
          a.x += ex
          a.y += ey
        }
        if (!b.pin && !b.grab && !driven.has(b)) {
          b.x -= ex
          b.y -= ey
        }
      }
      const root = nodes[0]
      if (root) {
        root.x = w * 0.5
        root.y = ground
        root.px = root.x
        root.py = root.y
      }
    }

    const omega = 13.2
    const zeta = 0.1
    const wd = omega * Math.sqrt(1 - zeta * zeta)
    const decay = zeta * omega
    for (let i = recoils.length - 1; i >= 0; i--) {
      const r = recoils[i]
      const n = r.node
      if (!n || n.grab) {
        recoils.splice(i, 1)
        continue
      }
      r.t += dt
      if (r.t < 0) continue
      const env = Math.exp(-decay * r.t)
      const ct = Math.cos(wd * r.t)
      const st = Math.sin(wd * r.t)
      const x = env * (r.ax * ct + r.bx * st)
      const y = env * (r.ay * ct + r.by * st)
      const vx = env * ((r.bx * wd - decay * r.ax) * ct + (-r.ax * wd - decay * r.bx) * st)
      const vy = env * ((r.by * wd - decay * r.ay) * ct + (-r.ay * wd - decay * r.by) * st)
      n.x = n.restX + x
      n.y = Math.min(ground, n.restY + y)
      n.px = n.x - vx * dt
      n.py = n.y - vy * dt
      if (env * Math.hypot(r.ax, r.ay) < 2.2 && Math.hypot(vx, vy) < 14) recoils.splice(i, 1)
    }

    if (pal.weather === 'wind') shedWind(dt)
    if (interacting) flingWeather()
  }

  function shedWind(dt) {
    if (kind === 'summer') return
    for (const s of sticks) {
      if (!s.alive || s.falling) continue
      const vx = s.b.x - s.b.px
      const force = Math.abs(gust) * 0.012 + Math.hypot(vx, s.b.y - s.b.py) * 0.02
      if (force < 0.01) continue
      for (const leaf of s.leaves) {
        if (!leaf.on) continue
        if (Math.random() > force * dt * 14) continue
        leaf.on = false
        const p = leafWorld(s, leaf)
        spawnFall(p.x, p.y, gust * 40 + (Math.random() - 0.5) * 30, -20 + Math.random() * 20, {
          pine: leaf.pine,
          hue: leaf.hue,
          size: leaf.size,
        })
      }
    }
  }

  function flingWeather() {
    for (const s of sticks) {
      if (!s.alive) continue
      const spd = Math.hypot(s.b.x - s.b.px, s.b.y - s.b.py)
      if (spd < 2.2) continue
      if (pal.weather === 'snow' && s.snow > 0) {
        s.snow = Math.max(0, s.snow - 0.18)
        const mx = (s.a.x + s.b.x) * 0.5
        const my = (s.a.y + s.b.y) * 0.5
        spawnFall(mx, my, (s.b.x - s.b.px) * 18, (s.b.y - s.b.py) * 12 - 30, { snow: true, size: 2.2 })
      }
      if (pal.weather === 'rain' && Math.random() < 0.35) {
        spawnFall((s.a.x + s.b.x) * 0.5, (s.a.y + s.b.y) * 0.5, (s.b.x - s.b.px) * 10, 40, { rain: true, size: 2 })
      }
    }
  }

  function markFalling(s) {
    s.falling = true
    s.alive = false
    s.a.falling = true
    s.b.falling = true
    s.a.pin = false
    s.b.pin = false
    for (const ki of s.kids) markFalling(sticks[ki])
  }

  function sliceStick(s) {
    if (!s || !s.alive || s.role === 'trunk' || s.falling) return false
    markFalling(s)
    const mx = (s.a.x + s.b.x) * 0.5
    const my = (s.a.y + s.b.y) * 0.5
    spawnFall(mx, my, (Math.random() - 0.5) * 80, -40, { wood: true, len: s.rest * 0.6, thick: s.thick, hue: pal.wood })
    for (const leaf of s.leaves) {
      if (!leaf.on) continue
      leaf.on = false
      const p = leafWorld(s, leaf)
      spawnFall(p.x, p.y, (Math.random() - 0.5) * 90, -30, { pine: leaf.pine, hue: leaf.hue, size: leaf.size })
    }
    sfxSlice()
    sfxSnap()
    safe(() => taptic(12))
    return true
  }

  function trySlice(x0, y0, x1, y1, speed) {
    if (speed < SLICE_SPEED) return false
    let cut = false
    for (const s of sticks) {
      if (!s.alive || s.role === 'trunk' || s.falling) continue
      const hit = segCross(x0, y0, x1, y1, s.a.x, s.a.y, s.b.x, s.b.y)
      if (!hit) {
        const near = distSeg(x1, y1, s.a.x, s.a.y, s.b.x, s.b.y)
        const mid = distSeg((x0 + x1) * 0.5, (y0 + y1) * 0.5, s.a.x, s.a.y, s.b.x, s.b.y)
        if (near.d > 28 && mid.d > 28) continue
      }
      if (sliceStick(s)) cut = true
    }
    return cut
  }

  function stepFall(dt) {
    const g = 520
    for (let i = falling.length - 1; i >= 0; i--) {
      const p = falling[i]
      p.age += dt
      p.vy += g * dt * (p.wood ? 1 : p.snow ? 0.22 : p.rain ? 0.9 : 0.55)
      p.vx += gust * 70 * dt
      if (pal.weather === 'wind' && !p.wood) p.vx += 40 * dt
      p.vx *= 0.995
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.rv * dt
      if (p.y >= ground - 2) {
        if (p.rain) {
          falling.splice(i, 1)
          freeBit(p)
          const pud = puddles[(Math.random() * puddles.length) | 0]
          if (pud) pud.r = Math.min(22, pud.r + 0.6)
          continue
        }
        p.y = ground - 2
        p.vx = 0
        p.vy = 0
        p.rv = 0
        p.sleep = true
        if (p.snow) {
          const bins = groundSnow.length
          if (bins) {
            const bi = Math.max(0, Math.min(bins - 1, ((p.x / w) * bins) | 0))
            groundSnow[bi] = Math.min(18, (groundSnow[bi] || 0) + 0.55)
          }
        }
        if (settled.length >= SETTLED_MAX) freeBit(settled.shift())
        settled.push(p)
        falling.splice(i, 1)
        if (!peek && !still && Math.random() < 0.12) sfxLand()
      }
    }
  }

  function stepWeather(dt) {
    if (pal.weather === 'rain') {
      for (const d of rain) {
        d.y += d.vy * dt
        d.x += 22 * dt + gust * 30 * dt
        if (d.y > ground) {
          d.y = -12
          d.x = Math.random() * w
          const pud = puddles[(Math.random() * puddles.length) | 0]
          if (pud) {
            pud.r = Math.min(24, pud.r + 0.35)
            pud.a = Math.min(0.42, pud.a + 0.01)
          }
        }
      }
    }
    if (pal.weather === 'snow') {
      for (const f of snow) {
        f.y += f.vy * dt
        f.x += f.vx * dt + Math.sin(t * 1.4 + f.x * 0.04) * 10 * dt + gust * 20 * dt
        if (f.y > ground) {
          const bins = groundSnow.length
          if (bins) {
            const bi = Math.max(0, Math.min(bins - 1, ((f.x / w) * bins) | 0))
            groundSnow[bi] = Math.min(18, (groundSnow[bi] || 0) + 0.28)
          }
          f.y = -8
          f.x = Math.random() * w
        }
      }
    }
  }

  function startAmbient() {
    if (ambient || peek || still || !canPlay()) return
    const a = safe(() => unlock())
    const dest = safe(() => getMaster())
    if (!a || !dest) return
    const nodesA = []
    const noises = []
    function osc(type, freq, peak) {
      const o = a.createOscillator()
      o.type = type
      o.frequency.value = freq
      const g = a.createGain()
      g.gain.value = peak
      o.connect(g)
      g.connect(dest)
      o.start()
      nodesA.push(o, g)
    }
    try {
      if (pal.weather === 'rain') {
        const n = loopNoise({ freq: 1500, q: 0.55 })
        n?.set(0.045, 1600)
        if (n) noises.push(n)
      } else if (pal.weather === 'wind' || pal.weather === 'breeze') {
        const n = loopNoise({ freq: pal.weather === 'breeze' ? 900 : 280, q: 0.5 })
        n?.set(pal.weather === 'breeze' ? 0.018 : 0.04, pal.weather === 'breeze' ? 1100 : 240)
        if (n) noises.push(n)
      } else if (pal.weather === 'snow') {
        const n = loopNoise({ freq: 900, q: 0.7 })
        n?.set(0.022, 720)
        if (n) noises.push(n)
      }
    } catch {
      /* never abort the loop */
    }
    ambient = {
      chirp() {
        if (pal.weather !== 'breeze' || !canPlay()) return
        safe(() => tone({ type: 'sine', freq: 1480 + Math.random() * 400, duration: 0.05, peak: 0.018, slide: 1900 }))
      },
      setWind(v) {
        try {
          noises[0]?.set(
            pal.weather === 'wind' ? 0.028 + Math.abs(v) * 0.03 : pal.weather === 'breeze' ? 0.014 : undefined,
          )
        } catch {
          /* */
        }
      },
      stop() {
        for (const n of nodesA) {
          try {
            if (n.stop) n.stop()
            n.disconnect()
          } catch {
            /* already */
          }
        }
        for (const n of noises) {
          try {
            n.stop()
          } catch {
            /* */
          }
        }
      },
    }
  }

  function stopAmbient() {
    if (!ambient) return
    try {
      ambient.stop()
    } catch {
      /* */
    }
    ambient = null
  }

  function syncAudio() {
    try {
      if (!live() || peek || still) {
        stopAmbient()
        return
      }
      if (canPlay()) startAmbient()
      else stopAmbient()
    } catch {
      /* audio must never stop the frame */
    }
  }

  function ptr(e) {
    const box = canvas.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top, id: e.pointerId }
  }

  function onDown(e) {
    if (peek || still) return
    if (!live()) return
    if (e.pointerType !== 'touch' && e.button) return
    e.preventDefault?.()
    try {
      if (e.isTrusted) canvas.setPointerCapture?.(e.pointerId)
    } catch {
      /* capture optional */
    }
    const p = ptr(e)
    swipe.x = swipe.px = swipe.sx = p.x
    swipe.y = swipe.py = swipe.sy = p.y
    swipe.pt = performance.now()
    swipe.speed = 0
    swipe.active = true
    sliceArmed = false
    trail.push({ x: p.x, y: p.y, age: 0 })
    const hit = nearest(p.x, p.y)
    if (hit) {
      for (let i = recoils.length - 1; i >= 0; i--) {
        if (recoils[i].node === hit.node) recoils.splice(i, 1)
      }
      lastTip = hit.node
      grabs.set(p.id, { s: hit.s, node: hit.node, t: hit.t, x: p.x, y: p.y, committed: false })
    }
    canvas.style.cursor = 'grabbing'
    safe(() => {
      unlock()
      startAmbient()
    })
  }

  function onMove(e) {
    const p = ptr(e)
    const now = performance.now()
    if (swipe.active && e.pointerId != null) {
      const dt = Math.max(0.008, (now - swipe.pt) / 1000)
      const dist = Math.hypot(p.x - swipe.x, p.y - swipe.y)
      swipe.speed = dist / (dt * 1000)
      const ox = swipe.x
      const oy = swipe.y
      swipe.px = swipe.x
      swipe.py = swipe.y
      swipe.x = p.x
      swipe.y = p.y
      swipe.pt = now
      trail.push({ x: p.x, y: p.y, age: 0 })
      if (trail.length > 18) trail.shift()
      if (live() && swipe.speed >= SLICE_SPEED) {
        const held = grabs.get(e.pointerId)
        if (!held?.committed) {
          sliceArmed = true
          if (held) {
            grabs.delete(e.pointerId)
            if (held.node) held.node.grab = false
          }
          trySlice(ox, oy, p.x, p.y, swipe.speed)
        }
      }
    }
    const g = grabs.get(e.pointerId)
    if (!g || !live()) return
    g.x = p.x
    g.y = p.y
    if (!g.committed && swipe.speed < GRAB_SPEED && !sliceArmed) {
      const moved = Math.hypot(p.x - swipe.sx, p.y - swipe.sy)
      if (moved > 8) g.committed = true
    }
    if (g.committed && g.node && !sliceArmed) {
      g.node.grab = true
      g.node.x = p.x
      g.node.y = Math.min(ground, p.y)
      canvas.style.cursor = 'grabbing'
    }
  }

  function onUp(e) {
    swipe.active = false
    const g = grabs.get(e.pointerId)
    if (g?.node) {
      g.node.grab = false
      lastTip = g.node
      if (g.committed) startRecoil(g.node)
    }
    grabs.delete(e.pointerId)
    try {
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* already */
    }
    if (!grabs.size) canvas.style.cursor = 'grab'
    if (g?.committed && !peek && !still) sfxRustle(0.04)
    sliceArmed = false
  }

  function nextKind() {
    const opts = KINDS.filter((k) => k !== lastKind)
    return opts[(Math.random() * opts.length) | 0]
  }

  function onReset(e) {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (peek || still) return
    grow(nextKind())
    stopAmbient()
    safe(() => {
      unlock()
      startAmbient()
      sfxReset()
    })
    safe(() => taptic(10))
  }

  function posePull() {
    const limb = sticks.find((s) => s.role === 'limb' && s.alive)
    if (!limb) return
    limb.b.x += 70
    limb.b.y += 90
  }

  function poseSnap() {
    const twig = sticks.find((s) => s.role === 'twig' && s.alive)
    if (twig) sliceStick(twig)
  }

  function poseBare() {
    grow('winter')
    for (const s of sticks) {
      for (const leaf of s.leaves) leaf.on = false
    }
  }

  function poseStill() {
    grow('autumn', 42)
    const limb = sticks.find((s) => s.role === 'limb' && s.alive && s.b.restX > w * 0.5) || sticks.find((s) => s.role === 'limb')
    if (limb) {
      limb.b.x += 86
      limb.b.y += 110
    }
    for (const s of sticks) {
      if (s.role === 'trunk') continue
      let n = 0
      for (const leaf of s.leaves) {
        if (n++ % 3 === 0 && leaf.on) {
          leaf.on = false
          const p = leafWorld(s, leaf)
          spawnFall(p.x, p.y + Math.random() * 40, 8, 20, { hue: leaf.hue, size: leaf.size })
        }
      }
    }
    for (const p of falling) p.y = ground * (0.45 + Math.random() * 0.35)
  }

  function poseScene(name) {
    if (name === 'pull') posePull()
    else if (name === 'snap') poseSnap()
    else if (name === 'bare') poseBare()
    else grow(KINDS.includes(name) ? name : 'summer')
  }

  function drawGround() {
    ctx.fillStyle = '#071018'
    ctx.fillRect(0, ground, w, h - ground)
    ctx.strokeStyle = 'rgba(183,236,255,0.35)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(0, ground)
    ctx.lineTo(w, ground)
    ctx.stroke()
    if (groundSnow.length) {
      ctx.fillStyle = 'rgba(231,248,255,0.82)'
      ctx.beginPath()
      ctx.moveTo(0, ground)
      const bins = groundSnow.length
      for (let i = 0; i < bins; i++) {
        const x = ((i + 0.5) / bins) * w
        const ht = groundSnow[i] || 0
        ctx.lineTo(x, ground - ht)
      }
      ctx.lineTo(w, ground)
      ctx.closePath()
      ctx.fill()
    }
    if (pal.weather === 'rain') {
      ctx.fillStyle = 'rgba(120,190,220,0.22)'
      for (const p of puddles) {
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.28, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  function drawSun() {
    if (pal.weather !== 'breeze') return
    const x = w * 0.82
    const y = sky + 36
    const g = ctx.createRadialGradient(x, y, 4, x, y, 46)
    g.addColorStop(0, 'rgba(255,224,138,0.85)')
    g.addColorStop(1, 'rgba(255,224,138,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 46, y - 46, 92, 92)
  }

  function drawWood() {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = pal.wood
    ctx.shadowBlur = 0
    for (const role of ['trunk', 'limb', 'branch', 'twig']) {
      ctx.strokeStyle = pal.wood
      ctx.beginPath()
      let started = false
      for (const s of sticks) {
        if ((!s.alive && !s.falling) || s.role !== role) continue
        ctx.lineWidth = Math.max(1.05, s.thick * (role === 'trunk' ? 0.72 : 0.68))
        if (!started) {
          ctx.beginPath()
          started = true
        }
        ctx.moveTo(s.a.x, s.a.y)
        ctx.lineTo(s.b.x, s.b.y)
      }
      if (started) ctx.stroke()
    }
    ctx.shadowBlur = 0
    if (pal.weather === 'snow') {
      ctx.fillStyle = 'rgba(231,248,255,0.75)'
      ctx.beginPath()
      for (const s of sticks) {
        if ((!s.alive && !s.falling) || s.snow < 0.12) continue
        ctx.moveTo(s.b.x + s.thick * 0.5, s.b.y)
        ctx.ellipse(s.b.x, s.b.y, s.thick * 0.55 * s.snow, 2.1, 0, 0, Math.PI * 2)
      }
      ctx.fill()
    }
  }

  function drawLeaves() {
    const a = pal.leaf
    const b = pal.leaf2
    if (pal.pine) {
      for (const col of [a, b]) {
        ctx.strokeStyle = col
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const s of sticks) {
          if (!s.alive && !s.falling) continue
          for (const leaf of s.leaves) {
            if (!leaf.on || leaf.hue !== col) continue
            const p = leafWorld(s, leaf)
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x + Math.cos(p.ang) * leaf.size * 2.2, p.y + Math.sin(p.ang) * leaf.size * 2.2)
          }
        }
        ctx.stroke()
      }
      return
    }
    for (const col of [a, b]) {
      ctx.strokeStyle = col
      ctx.fillStyle = 'rgba(2,8,12,0.45)'
      ctx.beginPath()
      for (const s of sticks) {
        if (!s.alive && !s.falling) continue
        for (const leaf of s.leaves) {
          if (!leaf.on || leaf.hue !== col) continue
          const p = leafWorld(s, leaf)
          ctx.moveTo(p.x + leaf.size, p.y)
          ctx.ellipse(p.x, p.y, leaf.size, leaf.size * 0.42, p.ang + 0.4, 0, Math.PI * 2)
        }
      }
      ctx.fill()
      ctx.stroke()
    }
  }

  function drawBits(list, alpha = 1) {
    ctx.save()
    ctx.globalAlpha = alpha
    for (const p of list) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      if (p.wood) {
        ctx.strokeStyle = pal.wood
        ctx.lineWidth = Math.max(1, p.thick * 0.6)
        ctx.beginPath()
        ctx.moveTo(-p.len * 0.5, 0)
        ctx.lineTo(p.len * 0.5, 0)
        ctx.stroke()
      } else if (p.snow) {
        ctx.fillStyle = 'rgba(231,248,255,0.9)'
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.rain) {
        ctx.strokeStyle = 'rgba(183,236,255,0.65)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, -4)
        ctx.lineTo(0, 4)
        ctx.stroke()
      } else if (p.pine) {
        ctx.strokeStyle = p.hue
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(p.size * 2, 0)
        ctx.stroke()
      } else {
        ctx.fillStyle = p.hue
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size, p.size * 0.42, 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.restore()
  }

  function drawWeather() {
    if (pal.weather === 'rain') {
      ctx.strokeStyle = 'rgba(183,236,255,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const d of rain) {
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - 3, d.y + d.len)
      }
      ctx.stroke()
    }
    if (pal.weather === 'snow') {
      ctx.fillStyle = 'rgba(231,248,255,0.8)'
      ctx.beginPath()
      for (const f of snow) {
        ctx.moveTo(f.x + f.r, f.y)
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      }
      ctx.fill()
    }
  }

  function drawTrail() {
    if (trail.length < 2) return
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]
      const b = trail[i]
      const fade = Math.max(0, 1 - b.age / 0.22)
      ctx.strokeStyle = i % 2 ? ICE : GOLD
      ctx.shadowColor = ICE
      ctx.shadowBlur = 10 * fade
      ctx.globalAlpha = 0.25 + 0.7 * fade
      ctx.lineWidth = 2 + 7 * fade * (i / trail.length)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.restore()
  }

  function draw() {
    clearBacking(canvas, ctx, dpr)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, pal.weather === 'breeze' ? '#071422' : '#041018')
    g.addColorStop(1, BG)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    drawSun()
    drawGround()
    drawBits(settled, 0.85)
    drawWood()
    drawLeaves()
    drawBits(falling, 1)
    drawWeather()
    drawTrail()
    canvas.dataset.kind = kind
    canvas.dataset.frames = String(frames)
  }

  function autoPeek(dt) {
    peekT += dt
    if (peekT > 1.8) {
      peekT = 0
      peekDir *= -1
    }
    const limb = sticks.find((s) => s.role === 'limb' && s.alive)
    if (!limb) return
    limb.b.x += peekDir * 18 * dt
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    frames += 1
    try {
      syncHits()
      if (promptOpen() && !peek && !still) {
        syncAudio()
        draw()
        raf = requestAnimationFrame(tick)
        return
      }
      if (!still) {
        t += dt
        if (peek && !reduced) autoPeek(dt)
        if (grabs.size && live()) {
          let strain = 0
          for (const g of grabs.values()) {
            if (!g.node || !g.committed) continue
            g.node.grab = true
            g.node.x = g.x
            g.node.y = Math.min(ground, g.y)
            strain = Math.max(strain, Math.hypot(g.node.x - g.node.restX, g.node.y - g.node.restY) / treeH)
          }
          creakT -= dt
          if (strain > 0.22 && creakT <= 0) {
            creakT = 0.28
            if (!peek && !still) sfxCreak()
          }
        }
        stepTree(dt)
        stepFall(dt)
        stepWeather(dt)
        for (let i = trail.length - 1; i >= 0; i--) {
          trail[i].age += dt
          if (trail[i].age > 0.22) trail.splice(i, 1)
        }
        chirpT -= dt
        if (pal.weather === 'breeze' && chirpT <= 0) {
          chirpT = 1.6 + Math.random() * 1.8
          try {
            ambient?.chirp()
          } catch {
            /* */
          }
        }
        try {
          ambient?.setWind(gust)
        } catch {
          /* */
        }
        syncAudio()
      }
      draw()
    } catch {
      try {
        draw()
      } catch {
        /* keep ticking */
      }
    }
    raf = requestAnimationFrame(tick)
  }

  function onKey(e) {
    if (peek || still || promptOpen() || !isLive()) return
    if (e.key === 'r' || e.key === 'R') onReset(e)
  }

  function onStart() {
    syncHits()
    safe(() => {
      unlock()
      startAmbient()
    })
  }

  if (!peek && !still) {
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('playground-start', onStart)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  const stopWatch = watchFrame(frame, () => {
    const prevW = w
    const prevH = h
    const ok = layout()
    if (!ok) return
    if (!nodes.length) grow(still ? 'autumn' : nextKind())
    else if (Math.abs(w - prevW) > 2 || Math.abs(h - prevH) > 2) {
      const sx = w / prevW
      const sy = treeH / Math.max(80, (prevH * 0.88 - (peek || still ? prevH * 0.05 : prevH * 0.1)) * 0.82)
      for (const n of nodes) {
        n.x = w * 0.5 + (n.x - prevW * 0.5) * sx
        n.y = ground - (ground - n.y) * (sy || 1)
        n.restX = w * 0.5 + (n.restX - prevW * 0.5) * sx
        n.restY = ground - (ground - n.restY) * (sy || 1)
        n.px = n.x
        n.py = n.y
      }
      for (const s of sticks) s.rest = Math.hypot(s.b.restX - s.a.restX, s.b.restY - s.a.restY) || s.rest
    }
    if (still) poseStill()
  })

  layout()
  grow(still ? 'autumn' : peek ? 'summer' : nextKind())
  if (still) poseStill()
  last = performance.now()
  raf = requestAnimationFrame(tick)
  canvas.__scene = poseScene
  canvas.__stats = () => {
    let maxBend = 0
    let signed = 0
    let maxVel = 0
    let role = null
    const groundY = ground
    for (const n of nodes) {
      if (n.pin) continue
      const b = Math.hypot(n.x - n.restX, n.y - n.restY)
      if (b > maxBend) {
        maxBend = b
        signed = n.y - n.restY
        role = n.role
      }
      maxVel = Math.max(maxVel, Math.hypot(n.x - n.px, n.y - n.py))
    }
    const g = grabs.size ? [...grabs.values()][0] : null
    const snowY = snow.map((f) => f.y)
    const rainY = rain.map((d) => d.y)
    const tipNode = g?.node || lastTip || recoils.find((r) => r.node)?.node || sticks.find((st) => st.role === 'limb' && st.alive)?.b
    const tipSigned = tipNode ? tipNode.y - tipNode.restY : signed
    return {
      kind,
      frames,
      maxBend,
      signed: tipSigned,
      maxVel,
      role,
      grabCount: grabs.size,
      grabbed: g?.node
        ? { role: g.node.role, y: g.node.y, restY: g.node.restY, ground: groundY, gap: groundY - g.node.y, committed: g.committed }
        : null,
      falling: falling.length,
      sticks: sticks.filter((s) => s.alive).length,
      cut: sticks.filter((s) => s.falling).length,
      snowY,
      rainY,
      snowPile: groundSnow.reduce((a, b) => a + b, 0),
      puddle: puddles.reduce((a, p) => a + p.r, 0),
      trail: trail.length,
      ground: groundY,
    }
  }
  canvas.__limbPoint = () => {
    let s = null
    for (const st of sticks) {
      if (!st.alive || (st.role !== 'limb' && st.role !== 'branch')) continue
      if (st.role !== 'limb' && s?.role === 'limb') continue
      if (!s || st.b.y < s.b.y) s = st
    }
    if (!s) s = sticks.find((st) => st.alive)
    if (!s) return null
    return { x: s.b.x, y: s.b.y, role: s.role, i: s.i }
  }
  canvas.__twigPoint = () => {
    const s = sticks.find((st) => st.role === 'twig' && st.alive) || sticks.find((st) => st.role === 'branch' && st.alive)
    if (!s) return null
    return { x: s.a.x + (s.b.x - s.a.x) * 0.55, y: s.a.y + (s.b.y - s.a.y) * 0.55, role: s.role, i: s.i }
  }

  return () => {
    cancelAnimationFrame(raf)
    stopWatch()
    stopAmbient()
    delete canvas.__scene
    delete canvas.__stats
    delete canvas.__limbPoint
    delete canvas.__twigPoint
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('playground-start', onStart)
    resetBtn?.removeEventListener('click', onReset)
    resetBtn?.remove()
  }
}
