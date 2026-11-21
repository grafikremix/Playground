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
const SETTLED_MAX = 80
const RAIN_N = 36
const SNOW_N = 42
const KINDS = ['spring', 'summer', 'autumn', 'winter', 'pine']

const PAL = {
  spring: { wood: ICE, leaf: '#c8ffb0', leaf2: '#8dff9a', shed: 0.22, pine: false, weather: 'rain' },
  summer: { wood: '#9ee4f6', leaf: '#5ee87a', leaf2: '#c4ff6a', shed: 0.12, pine: false, weather: 'sun' },
  autumn: { wood: '#ffc07a', leaf: ORANGE, leaf2: GOLD, shed: 0.92, pine: false, weather: 'wind' },
  winter: { wood: '#8fb6cc', leaf: '#e7f8ff', leaf2: ICE, shed: 0.7, pine: false, weather: 'snow' },
  pine: { wood: '#7fb6cc', leaf: '#7dffea', leaf2: ICE, shed: 0.58, pine: true, weather: 'snow' },
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy || 1
  let t = ((px - ax) * dx + (py - ay) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  const x = ax + dx * t
  const y = ay + dy * t
  return { t, x, y, d: Math.hypot(px - x, py - y) }
}

function sfxRustle(amp = 0.05) {
  noise({ duration: 0.09, peak: Math.min(0.08, amp), freq: 920, q: 0.7, type: 'bandpass', slide: 420 })
}

function sfxCreak() {
  tone({ type: 'sawtooth', freq: 70 + Math.random() * 30, duration: 0.16, peak: 0.045, slide: 48 })
}

function sfxSnap() {
  noise({ duration: 0.12, peak: 0.1, freq: 1800, q: 0.8, type: 'highpass', slide: 700 })
  tone({ type: 'triangle', freq: 220, duration: 0.14, peak: 0.06, slide: 90 })
}

function sfxLand() {
  tone({ type: 'sine', freq: 240 + Math.random() * 80, duration: 0.04, peak: 0.02 })
}

function sfxReset() {
  noise({ duration: 0.18, peak: 0.05, freq: 640, q: 0.7, type: 'bandpass', slide: 280 })
  tone({ type: 'sine', freq: 392, duration: 0.16, peak: 0.05, slide: 523 })
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  canvas.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none;'

  const frame = stage.closest('.stage-frame') || stage
  let resetBtn = null
  stage.replaceChildren(canvas)
  if (!peek && !still) {
    resetBtn = document.createElement('button')
    resetBtn.type = 'button'
    resetBtn.className = 'refresh'
    resetBtn.textContent = 'New tree'
    resetBtn.addEventListener('click', onReset)
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
  const segs = []
  const falling = []
  const settled = []
  const pool = []
  const rain = []
  const snow = []
  const grabs = new Map()
  let gust = 0
  let t = 0
  let raf = 0
  let last = performance.now()
  let creakT = 0
  let peekT = 0
  let peekDir = 1
  let ambient = null
  let chirpT = 0

  function promptOpen() {
    return document.body.classList.contains('is-prompt')
  }

  function live() {
    return isLive() && !promptOpen()
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
    treeH = Math.max(80, (ground - sky) * 0.8)
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
    pool.push(p)
  }

  function drain(list) {
    while (list.length) freeBit(list.pop())
  }

  function addSeg(parent, rest, lenN, thick, role, k, brk) {
    const s = {
      i: segs.length,
      p: parent ? parent.i : -1,
      kids: [],
      rest,
      angle: rest,
      angVel: 0,
      lenN,
      len: lenN,
      thick,
      role,
      k,
      damp: Math.sqrt(k) * 0.28,
      brk,
      alive: true,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      wa: 0,
      leaves: [],
      snow: pal.weather === 'snow' ? 0.35 + Math.random() * 0.65 : 0,
    }
    segs.push(s)
    if (parent) parent.kids.push(s.i)
    return s
  }

  function leafN(depth) {
    if (pal.pine) {
      if (depth < 2) return 4
      if (depth === 2) return 10
      if (depth === 3) return 12
      return 11
    }
    const winter = kind === 'winter'
    if (depth < 2) return winter ? 0 : 2
    if (depth === 2) return winter ? 2 : 6
    if (depth === 3) return winter ? 2 : 7
    return winter ? 2 : 5
  }

  function sprinkle(s, n) {
    const pine = pal.pine
    for (let i = 0; i < n; i++) {
      s.leaves.push({
        along: 0.22 + Math.random() * 0.78,
        side: Math.random() < 0.5 ? -1 : 1,
        size: pine ? u * (0.12 + Math.random() * 0.12) : u * (0.14 + Math.random() * 0.16),
        rot: (Math.random() - 0.5) * 0.9,
        on: true,
        pine,
        hue: Math.random() < 0.55 ? pal.leaf : pal.leaf2,
      })
    }
  }

  function growBranch(parent, depth, maxD, rest, lenN, thick) {
    const role = depth === 1 ? 'limb' : depth === 2 ? 'branch' : 'twig'
    const k = depth === 1 ? 78 : depth === 2 ? 62 : Math.max(42, 58 - depth * 4)
    const brk = depth === 1 ? 8.5 : depth === 2 ? 2.4 : 1.05
    const s = addSeg(parent, rest, lenN, Math.max(1.05, thick), role, k, brk)
    sprinkle(s, leafN(depth))
    if (depth >= maxD) return s
    const kids = depth === 1 ? 2 + (Math.random() < 0.45 ? 1 : 0) : depth === 2 ? 2 : depth >= 4 ? 1 : 1 + (Math.random() < 0.65 ? 1 : 0)
    for (let i = 0; i < kids; i++) {
      const side = (i + depth) % 2 === 0 ? -1 : 1
      const childRest = side * (0.26 + Math.random() * 0.52) + (Math.random() - 0.5) * 0.12
      growBranch(s, depth + 1, maxD, childRest, lenN * (0.5 + Math.random() * 0.16), thick * 0.58)
    }
    return s
  }

  function grow(kindName) {
    segs.length = 0
    drain(falling)
    drain(settled)
    kind = kindName
    pal = PAL[kind] || PAL.summer
    const trunkN = 5
    const tLen = 0.118
    let node = null
    for (let i = 0; i < trunkN; i++) {
      const thick = Math.max(3.8, 10.4 - i * 1.25)
      const k = 150 - i * 8
      node = addSeg(node, i === 0 ? -Math.PI / 2 : (Math.random() - 0.5) * 0.04, tLen, thick, 'trunk', k, 99)
    }
    for (let i = 1; i < trunkN; i++) {
      const trunk = segs[i]
      const nLimbs = i === 1 ? 2 : i >= 3 ? 3 : 2
      const maxD = i >= 3 ? 5 : 4
      for (let j = 0; j < nLimbs; j++) {
        const side = (i + j) % 2 === 0 ? -1 : 1
        const rest = side * (0.28 + Math.random() * 0.46 + (i === 1 ? 0.12 : 0))
        const lenN = 0.1 + Math.random() * 0.045 + (i >= 3 ? 0.028 : 0)
        growBranch(trunk, 1, maxD, rest, lenN, 5.6 - i * 0.35)
      }
    }
    growBranch(node, 1, 5, (Math.random() - 0.5) * 0.18, 0.11, 5)
    seedWeather()
    scaleLens()
    fitRest()
  }

  function scaleLens() {
    for (const s of segs) s.len = s.lenN * treeH
  }

  function fitRest() {
    kinematics()
    let top = ground
    for (const s of segs) {
      if (!s.alive) continue
      top = Math.min(top, s.y, s.ty)
    }
    const free = Math.max(40, ground - sky)
    const limit = sky + free * 0.2
    const span = ground - top
    if (span < 8) return
    const k = (ground - limit) / span
    for (const s of segs) s.len *= k
    kinematics()
  }

  function kinematics() {
    const rootX = w * 0.5
    const rootY = ground
    for (const s of segs) {
      if (!s.alive) continue
      if (s.p < 0) {
        s.x = rootX
        s.y = rootY
        s.wa = s.angle
      } else {
        const p = segs[s.p]
        s.x = p.tx
        s.y = p.ty
        s.wa = p.wa + s.angle
      }
      s.tx = s.x + Math.cos(s.wa) * s.len
      s.ty = s.y + Math.sin(s.wa) * s.len
    }
  }

  function seedWeather() {
    rain.length = 0
    snow.length = 0
    if (pal.weather === 'rain') {
      for (let i = 0; i < RAIN_N; i++) {
        rain.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vy: 280 + Math.random() * 160,
          len: 8 + Math.random() * 10,
        })
      }
    }
    if (pal.weather === 'snow') {
      for (let i = 0; i < SNOW_N; i++) {
        snow.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vy: 22 + Math.random() * 28,
          vx: (Math.random() - 0.5) * 18,
          r: 1.1 + Math.random() * 1.8,
        })
      }
    }
  }

  function leafWorld(s, leaf) {
    const ang = s.wa + leaf.rot
    const spread = s.thick * 1.5 + leaf.size * 0.85
    const x = s.x + Math.cos(s.wa) * s.len * leaf.along + Math.cos(ang + Math.PI / 2) * leaf.side * spread
    const y = s.y + Math.sin(s.wa) * s.len * leaf.along + Math.sin(ang + Math.PI / 2) * leaf.side * spread
    return { x, y, ang }
  }

  function spawnFall(x, y, vx, vy, pine, wood, hue) {
    if (falling.length >= FALL_MAX) freeBit(falling.shift())
    const p = takeBit()
    p.x = x
    p.y = y
    p.vx = vx
    p.vy = vy
    p.rot = Math.random() * Math.PI
    p.rv = (Math.random() - 0.5) * 6
    p.pine = !!pine
    p.wood = !!wood
    p.len = wood ? 10 + Math.random() * 18 : 0
    p.thick = wood ? 1.2 + Math.random() * 2 : 0
    p.size = u * (0.14 + Math.random() * 0.16)
    p.age = 0
    p.sleep = false
    p.hue = hue || (pine ? pal.leaf : pal.leaf2)
    falling.push(p)
    return p
  }

  function shedFrom(s, force, spray) {
    let n = 0
    for (const leaf of s.leaves) {
      if (!leaf.on) continue
      const chance = pal.shed * force * (spray ? 1.8 : 1)
      if (Math.random() > chance) continue
      leaf.on = false
      const p = leafWorld(s, leaf)
      const a = s.wa + (Math.random() - 0.5) * (spray ? 2.4 : 0.6)
      const sp = (spray ? 140 : 30) + force * (spray ? 220 : 80)
      spawnFall(
        p.x,
        p.y,
        Math.cos(a) * sp + gust * 40,
        Math.sin(a) * sp * (spray ? 0.4 : 0.2) - 20,
        leaf.pine,
        false,
        leaf.hue,
      )
      n += 1
    }
    if (s.snow > 0 && force > 0.12) {
      const puff = Math.min(s.snow, force * 0.5)
      s.snow -= puff
      for (let i = 0; i < 3; i++) spawnFall(s.tx, s.ty, (Math.random() - 0.5) * 40, -10 - Math.random() * 20, false, false)
    }
    return n
  }

  function breakOff(s) {
    if (!s.alive || s.role === 'trunk') return
    s.alive = false
    const speed = s.angVel * s.len
    const vx = -Math.sin(s.wa) * speed + (Math.random() - 0.5) * 30
    const vy = Math.cos(s.wa) * speed - 20
    spawnFall(s.x, s.y, vx, vy, false, true)
    falling[falling.length - 1].len = s.len
    falling[falling.length - 1].thick = s.thick
    falling[falling.length - 1].rot = s.wa
    const stack = [...s.kids]
    while (stack.length) {
      const c = segs[stack.pop()]
      if (!c || !c.alive) continue
      c.alive = false
      for (const leaf of c.leaves) {
        if (!leaf.on) continue
        leaf.on = false
        const p = leafWorld(c, leaf)
        spawnFall(p.x, p.y, vx * 0.4 + (Math.random() - 0.5) * 50, vy * 0.3 - Math.random() * 40, leaf.pine, false, leaf.hue)
      }
      stack.push(...c.kids)
    }
    for (const leaf of s.leaves) {
      if (!leaf.on) continue
      leaf.on = false
      const p = leafWorld(s, leaf)
      spawnFall(p.x, p.y, vx * 0.5, vy * 0.4, leaf.pine, false, leaf.hue)
    }
    if (!peek && !still) {
      sfxSnap()
      taptic(18)
    }
  }

  function capOf(s) {
    if (s.role === 'trunk') return 0.34
    if (s.role === 'limb') return 1.28
    if (s.role === 'branch') return 1.55
    return 1.85
  }

  function heldSet() {
    const held = new Set()
    for (const g of grabs.values()) if (g.s && g.s.alive) held.add(g.s)
    return held
  }

  function nearest(px, py) {
    let best = null
    let bestScore = Infinity
    for (const s of segs) {
      if (!s.alive) continue
      const hit = distSeg(px, py, s.x, s.y, s.tx, s.ty)
      let d = hit.d
      for (const leaf of s.leaves) {
        if (!leaf.on) continue
        const lp = leafWorld(s, leaf)
        const ld = Math.hypot(px - lp.x, py - lp.y) - leaf.size * 1.8
        if (ld < d) d = Math.max(0, ld)
      }
      const pad = s.role === 'trunk' ? 64 : s.role === 'limb' ? 120 : s.role === 'branch' ? 104 : 88
      if (d > pad) continue
      const prefer = s.role === 'limb' ? 26 : s.role === 'branch' ? 14 : s.role === 'trunk' ? 10 : 0
      const onWood = hit.d < Math.max(16, s.thick * 2.2) ? 48 : 0
      const score = d - prefer - onWood
      if (score < bestScore) {
        bestScore = score
        best = { s, t: Math.max(0.22, hit.t) }
      }
    }
    return best
  }

  function pull(s, along, px, py, dt) {
    const parentWA = s.p >= 0 ? segs[s.p].wa : 0
    let want = Math.atan2(py - s.y, px - s.x) - parentWA
    while (want - s.angle > Math.PI) want -= Math.PI * 2
    while (s.angle - want > Math.PI) want += Math.PI * 2
    const cap = capOf(s)
    const target = s.rest + Math.max(-cap, Math.min(cap, want - s.rest))
    const err = target - s.angle
    const follow = s.role === 'trunk' ? 14 : 22
    const alpha = 1 - Math.exp(-follow * dt)
    s.angle += err * alpha
    s.angVel = err * follow
    if (s.p >= 0) {
      const p = segs[s.p]
      p.angVel += err * (p.role === 'trunk' ? 0.4 : 0.9)
      if (p.p >= 0) segs[p.p].angVel += err * 0.22
      for (const ki of p.kids) {
        if (ki === s.i) continue
        const sib = segs[ki]
        if (sib?.alive) sib.angVel += err * 0.55
      }
    }
    for (const ki of s.kids) {
      const c = segs[ki]
      if (c?.alive) c.angVel += err * 0.7
    }
    const gx = s.x + (s.tx - s.x) * along
    const gy = s.y + (s.ty - s.y) * along
    return Math.min(1, Math.hypot(px - gx, py - gy) / 90)
  }

  function stepTree(dt) {
    if (pal.weather === 'wind') {
      gust = Math.sin(t * 0.55) * Math.sin(t * 1.15) * 0.55
    } else gust = gust * 0.9

    const held = heldSet()
    for (const s of segs) {
      if (!s.alive) continue
      if (!held.has(s)) {
        let torque = -s.k * (s.angle - s.rest) - s.damp * s.angVel
        if (pal.weather === 'wind' && s.role !== 'trunk') torque += gust * (s.role === 'twig' ? 2.4 : 1.1)
        s.angVel += torque * dt
        s.angle += s.angVel * dt
      }
      const cap = capOf(s)
      if (s.angle > s.rest + cap) {
        s.angle = s.rest + cap
        s.angVel *= -0.42
      } else if (s.angle < s.rest - cap) {
        s.angle = s.rest - cap
        s.angVel *= -0.42
      }
      const strain = Math.abs(s.angle - s.rest) + Math.abs(s.angVel) * 0.1
      if (strain > s.brk && s.role !== 'trunk') breakOff(s)
    }
    kinematics()

    let shedN = 0
    for (const s of segs) {
      if (!s.alive) continue
      const cap = capOf(s)
      const force = Math.abs(s.angVel) * 0.07 + (Math.abs(s.angle - s.rest) / cap) * 0.32
      if (force < 0.05) continue
      const spray = pal.pine && force > 0.35
      shedN += shedFrom(s, Math.min(1.4, force), spray)
    }
    if (shedN && !peek && !still) {
      sfxRustle(0.03 + Math.min(0.06, shedN * 0.008))
      if (shedN > 4) taptic(8)
    }
  }

  function stepFall(dt) {
    const g = 420
    for (let i = falling.length - 1; i >= 0; i--) {
      const p = falling[i]
      p.age += dt
      p.vy += g * dt * (p.wood ? 1 : 0.55)
      p.vx += gust * 90 * dt
      if (pal.weather === 'wind' && !p.wood) p.vx += 36 * dt
      p.vx *= 0.995
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.rv * dt
      if (p.y >= ground - 2) {
        p.y = ground - 2
        p.vx = 0
        p.vy = 0
        p.rv = 0
        p.sleep = true
        if (settled.length >= SETTLED_MAX) freeBit(settled.shift())
        settled.push(p)
        falling.splice(i, 1)
        if (!peek && !still && Math.random() < 0.18) sfxLand()
      }
    }
  }

  function stepWeather(dt) {
    if (pal.weather === 'rain') {
      for (const d of rain) {
        d.y += d.vy * dt
        d.x += 18 * dt
        if (d.y > ground) {
          d.y = -10
          d.x = Math.random() * w
        }
      }
    }
    if (pal.weather === 'snow') {
      for (const f of snow) {
        f.y += f.vy * dt
        f.x += f.vx * dt + Math.sin(t * 1.4 + f.x) * 8 * dt
        if (f.y > ground) {
          f.y = -6
          f.x = Math.random() * w
        }
      }
    }
  }

  function stopAmbient() {
    if (!ambient) return
    ambient.stop()
    ambient = null
  }

  function startAmbient() {
    if (ambient || peek || still || !canPlay()) return
    const a = unlock()
    const dest = getMaster()
    if (!a || !dest) return
    const nodes = []
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
      nodes.push(o, g)
      return { o, g }
    }
    try {
      if (pal.weather === 'rain') {
        const n = loopNoise({ freq: 1500, q: 0.55 })
        n?.set(0.045, 1600)
        if (n) noises.push(n)
      } else if (pal.weather === 'wind') {
        const n = loopNoise({ freq: 280, q: 0.5 })
        n?.set(0.04, 240)
        if (n) noises.push(n)
      } else if (pal.weather === 'snow') {
        const n = loopNoise({ freq: 900, q: 0.7 })
        n?.set(0.022, 720)
        if (n) noises.push(n)
      } else {
        osc('sine', 196, 0.012)
        osc('triangle', 294, 0.008)
        const n = loopNoise({ freq: 1800, q: 1.1 })
        n?.set(0.012, 2000)
        if (n) noises.push(n)
      }
    } catch {
      /* summer sun oscillators must not abort a grab */
    }
    ambient = {
      chirp() {
        if (pal.weather !== 'sun' || !canPlay()) return
        tone({ type: 'sine', freq: 1480 + Math.random() * 400, duration: 0.05, peak: 0.018, slide: 1900 })
      },
      setWind(v) {
        noises[0]?.set(pal.weather === 'wind' ? 0.028 + Math.abs(v) * 0.03 : undefined)
      },
      stop() {
        for (const n of nodes) {
          try {
            if (n.stop) n.stop()
            n.disconnect()
          } catch {
            /* already */
          }
        }
        for (const n of noises) n.stop()
      },
    }
  }

  function syncAudio() {
    if (!live() || peek || still) {
      stopAmbient()
      return
    }
    if (canPlay()) startAmbient()
    else stopAmbient()
  }

  function ptr(e) {
    const box = canvas.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top, id: e.pointerId }
  }

  function onDown(e) {
    if (peek || still || !live()) return
    if (e.pointerType !== 'touch' && e.button) return
    e.preventDefault?.()
    try {
      if (e.isTrusted) canvas.setPointerCapture?.(e.pointerId)
    } catch {
      /* capture optional */
    }
    const p = ptr(e)
    const hit = nearest(p.x, p.y)
    if (!hit) return
    grabs.set(p.id, { s: hit.s, t: hit.t, x: p.x, y: p.y })
    canvas.style.cursor = 'grabbing'
    taptic(7)
    try {
      unlock()
      startAmbient()
      sfxCreak()
    } catch {
      /* audio optional — grab already set */
    }
  }

  function onMove(e) {
    const g = grabs.get(e.pointerId)
    if (!g) return
    const p = ptr(e)
    g.x = p.x
    g.y = p.y
  }

  function shakeAround(s, kick) {
    if (s.p >= 0) {
      const p = segs[s.p]
      p.angVel += kick * 0.18
      for (const ki of p.kids) {
        if (ki === s.i) continue
        const sib = segs[ki]
        if (sib?.alive) sib.angVel += kick * 0.24
      }
    }
    for (const ki of s.kids) {
      const c = segs[ki]
      if (c?.alive) c.angVel += kick * 0.34
    }
  }

  function onUp(e) {
    const g = grabs.get(e.pointerId)
    if (!g) return
    const s = g.s
    if (s?.alive) {
      const kick = (s.angle - s.rest) * -2.6
      s.angVel += kick
      shakeAround(s, kick)
    }
    grabs.delete(e.pointerId)
    try {
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* already */
    }
    if (!grabs.size) canvas.style.cursor = 'grab'
    if (!peek && !still) {
      try {
        sfxRustle(0.04)
      } catch {
        /* audio optional */
      }
    }
  }

  function onReset(e) {
    e?.preventDefault?.()
    if (!live()) return
    unlock()
    grow(KINDS[(Math.random() * KINDS.length) | 0])
    stopAmbient()
    startAmbient()
    sfxReset()
    taptic(10)
  }

  function randomKind() {
    return KINDS[(Math.random() * KINDS.length) | 0]
  }

  function strip(keep = 0.06) {
    for (const s of segs) {
      for (const leaf of s.leaves) {
        if (Math.random() > keep && leaf.on) {
          leaf.on = false
          const p = leafWorld(s, leaf)
          if (settled.length >= SETTLED_MAX) freeBit(settled.shift())
          const bit = spawnFall(p.x + (Math.random() - 0.5) * 30, ground - 2, 0, 0, leaf.pine, false, leaf.hue)
          bit.sleep = true
          bit.vx = 0
          bit.vy = 0
          bit.rv = 0
          bit.y = ground - 2
          settled.push(falling.pop())
        }
      }
    }
  }

  function posePull() {
    grow('autumn')
    const limb = segs.find((s) => s.role === 'limb' && s.rest > 0) || segs.find((s) => s.role === 'limb')
    if (limb) {
      limb.angle += 0.72
      limb.angVel = 2.2
      kinematics()
      const stack = [limb.i]
      while (stack.length) {
        const s = segs[stack.pop()]
        if (!s) continue
        shedFrom(s, 0.28, false)
        stack.push(...s.kids)
      }
    }
    for (let i = 0; i < 22; i++) {
      spawnFall(
        w * (0.34 + Math.random() * 0.32),
        sky + (ground - sky) * (0.24 + Math.random() * 0.34),
        (Math.random() - 0.5) * 36,
        18 + Math.random() * 36,
        false,
        false,
        Math.random() < 0.5 ? pal.leaf : pal.leaf2,
      )
    }
  }

  function poseSnap() {
    grow('summer')
    const twig =
      segs.find((s) => s.role === 'twig' && s.tx > w * 0.58 && s.ty < ground - 80) ||
      segs.find((s) => s.role === 'twig')
    if (twig) {
      twig.angle += 1.05
      kinematics()
      const bx = twig.tx
      const by = twig.ty
      breakOff(twig)
      spawnFall(bx, by + 12, 28, 50, false, true)
      const bit = falling[falling.length - 1]
      bit.len = Math.max(28, twig.len)
      bit.thick = 2.4
      bit.y = Math.min(by + 36, ground - 90)
      bit.x = bx + 8
    }
  }

  function poseBare() {
    grow('winter')
    strip(0.04)
    const twig = segs.filter((s) => s.role === 'twig')
    twig.slice(0, 4).forEach((s) => breakOff(s))
  }

  function poseStill() {
    grow('autumn')
    const limb = segs.find((s) => s.role === 'limb' && s.rest > 0) || segs.find((s) => s.role === 'limb')
    if (limb) limb.angle += 0.38
    kinematics()
    for (const s of segs) if (s.role !== 'trunk') shedFrom(s, 0.45, false)
    for (const p of falling) {
      p.y = ground * (0.45 + Math.random() * 0.35)
      p.vy = 30
    }
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
    ctx.strokeStyle = 'rgba(183,236,255,0.06)'
    ctx.lineWidth = 1
    const step = Math.max(16, u * 1.4)
    for (let x = 0; x < w; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, ground)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
  }

  function drawSun() {
    if (pal.weather !== 'sun') return
    const r = u * 1.55
    const x = w * 0.84
    const y = sky + r * 2.8
    ctx.save()
    ctx.globalAlpha = 0.85
    ctx.shadowColor = GOLD
    ctx.shadowBlur = reduced ? 0 : u * 1.2
    ctx.strokeStyle = GOLD
    ctx.fillStyle = 'rgba(255, 224, 138, 0.15)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.35
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.05
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25)
      ctx.lineTo(x + Math.cos(a) * r * 2.4, y + Math.sin(a) * r * 2.4)
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawWood() {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = pal.wood
    ctx.shadowColor = pal.wood
    ctx.shadowBlur = reduced ? 0 : 6
    for (const s of segs) {
      if (!s.alive || s.role !== 'trunk') continue
      ctx.lineWidth = Math.max(1.4, s.thick * 0.72)
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(s.tx, s.ty)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    for (const s of segs) {
      if (!s.alive || s.role === 'trunk') continue
      ctx.lineWidth = Math.max(1.05, s.thick * 0.68)
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(s.tx, s.ty)
      ctx.stroke()
    }
    if (pal.weather === 'snow') {
      ctx.fillStyle = 'rgba(231,248,255,0.7)'
      ctx.beginPath()
      for (const s of segs) {
        if (!s.alive || s.snow < 0.15) continue
        ctx.moveTo(s.tx + s.thick * 0.55, s.ty)
        ctx.ellipse(s.tx, s.ty, s.thick * 0.55, 2.2, s.wa, 0, Math.PI * 2)
      }
      ctx.fill()
    }
  }

  function drawLeaves() {
    const a = pal.leaf
    const b = pal.leaf2
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(2,8,12,0.45)'
    if (pal.pine) {
      for (const col of [a, b]) {
        ctx.strokeStyle = col
        ctx.beginPath()
        for (const s of segs) {
          if (!s.alive) continue
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
      ctx.beginPath()
      for (const s of segs) {
        if (!s.alive) continue
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
    ctx.shadowBlur = 0
    ctx.lineCap = 'round'
    ctx.beginPath()
    let wood = false
    for (const p of list) {
      if (!p.wood) continue
      wood = true
      const c = Math.cos(p.rot)
      const s = Math.sin(p.rot)
      const hx = c * p.len * 0.5
      const hy = s * p.len * 0.5
      ctx.moveTo(p.x - hx, p.y - hy)
      ctx.lineTo(p.x + hx, p.y + hy)
    }
    if (wood) {
      ctx.strokeStyle = pal.wood
      ctx.lineWidth = 1.6
      ctx.stroke()
    }
    for (const col of [pal.leaf, pal.leaf2]) {
      ctx.strokeStyle = col
      ctx.fillStyle = 'rgba(2,8,12,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      let needles = false
      for (const p of list) {
        if (p.wood || !p.pine || p.hue !== col) continue
        needles = true
        const c = Math.cos(p.rot)
        const s = Math.sin(p.rot)
        ctx.moveTo(p.x - c * p.size, p.y - s * p.size)
        ctx.lineTo(p.x + c * p.size * 1.4, p.y + s * p.size * 1.4)
      }
      if (needles) ctx.stroke()
      ctx.beginPath()
      let leaf = false
      for (const p of list) {
        if (p.wood || p.pine || p.hue !== col) continue
        leaf = true
        ctx.moveTo(p.x + (p.size || 3), p.y)
        ctx.ellipse(p.x, p.y, p.size || 3, (p.size || 3) * 0.4, p.rot + 0.3, 0, Math.PI * 2)
      }
      if (leaf) {
        ctx.fill()
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  function drawWeather() {
    if (pal.weather === 'rain') {
      ctx.save()
      ctx.strokeStyle = 'rgba(183,236,255,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const d of rain) {
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - 3, d.y + d.len)
      }
      ctx.stroke()
      ctx.restore()
    }
    if (pal.weather === 'snow') {
      ctx.save()
      ctx.fillStyle = 'rgba(231,248,255,0.8)'
      ctx.beginPath()
      for (const f of snow) {
        ctx.moveTo(f.x + f.r, f.y)
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      }
      ctx.fill()
      ctx.restore()
    }
  }

  function draw() {
    clearBacking(canvas, ctx, dpr)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, pal.weather === 'sun' ? '#071422' : '#041018')
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
    canvas.dataset.kind = kind
  }

  function autoPeek(dt) {
    peekT += dt
    if (peekT > 1.8) {
      peekT = 0
      peekDir *= -1
    }
    const limb = segs.find((s) => s.role === 'limb')
    if (!limb || !limb.alive) return
    limb.angVel += peekDir * 2.4 * dt
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    try {
      if ((!live() && !peek && !still) || (promptOpen() && !peek && !still)) {
        syncAudio()
        draw()
        raf = requestAnimationFrame(tick)
        return
      }
      if (!still && (live() || peek)) {
        t += dt
        if (peek && !reduced) autoPeek(dt)
        if (grabs.size) {
          let strain = 0
          for (const g of grabs.values()) {
            if (!g.s.alive) continue
            strain = Math.max(strain, pull(g.s, g.t, g.x, g.y, dt))
          }
          creakT -= dt
          if (strain > 0.35 && creakT <= 0) {
            creakT = 0.28
            if (!peek && !still) sfxCreak()
          }
        }
        stepTree(dt)
        stepFall(dt)
        stepWeather(dt)
        chirpT -= dt
        if (pal.weather === 'sun' && chirpT <= 0) {
          chirpT = 1.6 + Math.random() * 1.8
          ambient?.chirp()
        }
        ambient?.setWind(gust)
        syncAudio()
      }
      draw()
    } catch {
      /* keep the loop alive if a frame fails */
    }
    raf = requestAnimationFrame(tick)
  }

  function onKey(e) {
    if (peek || still || promptOpen() || !isLive()) return
    if (e.key === 'r' || e.key === 'R') onReset(e)
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
    window.addEventListener('playground-start', () => {
      unlock()
      startAmbient()
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  const stopWatch = watchFrame(frame, () => {
    const prevW = w
    const prevH = h
    const ok = layout()
    if (!ok) return
    if (!segs.length) grow(still ? 'autumn' : randomKind())
    else if (w !== prevW || h !== prevH) {
      scaleLens()
      fitRest()
    }
    if (still) poseStill()
  })

  layout()
  grow(still ? 'autumn' : peek ? 'summer' : randomKind())
  if (still) poseStill()
  last = performance.now()
  raf = requestAnimationFrame(tick)
  canvas.__scene = poseScene
  canvas.__stats = () => {
    let maxBend = 0
    let signed = 0
    let maxVel = 0
    let role = null
    let i = -1
    for (const s of segs) {
      if (!s.alive) continue
      const b = s.angle - s.rest
      if (Math.abs(b) > maxBend) {
        maxBend = Math.abs(b)
        signed = b
        role = s.role
        i = s.i
      }
      maxVel = Math.max(maxVel, Math.abs(s.angVel))
    }
    const g = grabs.size ? [...grabs.values()][0] : null
    let neighborVel = 0
    if (g?.s?.p >= 0) {
      for (const ki of segs[g.s.p].kids) {
        if (ki === g.s.i) continue
        const sib = segs[ki]
        if (sib?.alive) neighborVel = Math.max(neighborVel, Math.abs(sib.angVel))
      }
      for (const ki of g.s.kids) {
        const c = segs[ki]
        if (c?.alive) neighborVel = Math.max(neighborVel, Math.abs(c.angVel))
      }
    }
    return {
      kind,
      maxBend,
      signed,
      maxVel,
      role,
      i,
      grabCount: grabs.size,
      grabbed: g?.s ? { i: g.s.i, role: g.s.role, bend: Math.abs(g.s.angle - g.s.rest) } : null,
      neighborVel,
      falling: falling.length,
      segs: segs.length,
    }
  }
  canvas.__limbPoint = () => {
    const limb =
      segs.find((s) => s.role === 'limb' && s.alive && Math.abs(s.rest) > 0.12) ||
      segs.find((s) => s.role === 'limb' && s.alive) ||
      segs.find((s) => s.role === 'branch' && s.alive)
    if (!limb) return null
    return {
      x: limb.x + (limb.tx - limb.x) * 0.74,
      y: limb.y + (limb.ty - limb.y) * 0.74,
      role: limb.role,
      i: limb.i,
    }
  }
  canvas.__leafPoint = () => {
    for (const s of segs) {
      if (!s.alive || s.role === 'trunk') continue
      for (const leaf of s.leaves) {
        if (!leaf.on) continue
        const p = leafWorld(s, leaf)
        return { x: p.x, y: p.y, role: s.role, i: s.i }
      }
    }
    return null
  }
  canvas.__trunkPoint = () => {
    const s = segs.find((seg) => seg.alive && seg.role === 'trunk')
    if (!s) return null
    return {
      x: s.x + (s.tx - s.x) * 0.28,
      y: s.y + (s.ty - s.y) * 0.28,
      role: s.role,
      i: s.i,
    }
  }

  return () => {
    cancelAnimationFrame(raf)
    stopWatch()
    stopAmbient()
    delete canvas.__scene
    delete canvas.__stats
    delete canvas.__limbPoint
    delete canvas.__leafPoint
    delete canvas.__trunkPoint
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('keydown', onKey)
    resetBtn?.removeEventListener('click', onReset)
    resetBtn?.remove()
  }
}
