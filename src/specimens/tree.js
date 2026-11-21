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
const FALL_MAX = 80
const SETTLED_MAX = 70
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

  let resetBtn = null
  if (!peek && !still) {
    resetBtn = document.createElement('button')
    resetBtn.type = 'button'
    resetBtn.className = 'refresh'
    resetBtn.textContent = 'New tree'
    resetBtn.addEventListener('click', onReset)
    stage.replaceChildren(canvas, resetBtn)
  } else {
    stage.replaceChildren(canvas)
  }

  const frame = stage.closest('.stage-frame') || stage
  let w = 1
  let h = 1
  let dpr = 1
  let u = 10
  let ground = 0
  let kind = 'summer'
  let pal = PAL.summer
  const segs = []
  const falling = []
  const settled = []
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
    return true
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
      damp: Math.sqrt(k) * 0.42,
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

  function sprinkle(s, n) {
    const pine = pal.pine
    const count = pal.weather === 'snow' && !pine ? Math.max(0, Math.round(n * 0.28)) : n
    for (let i = 0; i < count; i++) {
      s.leaves.push({
        along: 0.25 + Math.random() * 0.75,
        side: Math.random() < 0.5 ? -1 : 1,
        size: pine ? u * (0.18 + Math.random() * 0.16) : u * (0.22 + Math.random() * 0.28),
        rot: (Math.random() - 0.5) * 0.8,
        on: true,
        pine,
        hue: Math.random() < 0.5 ? pal.leaf : pal.leaf2,
      })
    }
  }

  function grow(kindName) {
    segs.length = 0
    falling.length = 0
    settled.length = 0
    kind = kindName
    pal = PAL[kind] || PAL.summer
    const treeH = h * 0.82
    const trunkN = 5
    const tLen = 0.185
    let node = null
    for (let i = 0; i < trunkN; i++) {
      const thick = Math.max(4.2, 11 - i * 1.4)
      const k = 96 - i * 8
      node = addSeg(node, i === 0 ? -Math.PI / 2 : (Math.random() - 0.5) * 0.05, tLen, thick, 'trunk', k, 99)
    }
    const limbFrom = [2, 3, 4]
    for (const idx of limbFrom) {
      const trunk = segs[idx]
      const n = idx === 4 ? 3 : 2
      for (let i = 0; i < n; i++) {
        const dir = i % 2 === 0 ? -1 : 1
        const rest = dir * (0.45 + Math.random() * 0.55)
        const limb = addSeg(trunk, rest, 0.13 + Math.random() * 0.04, 6.5, 'limb', 16, 6.5)
        sprinkle(limb, pal.pine ? 6 : 4)
        const bN = 2 + ((Math.random() * 2) | 0)
        for (let b = 0; b < bN; b++) {
          const br = addSeg(
            limb,
            (b % 2 === 0 ? -1 : 1) * (0.35 + Math.random() * 0.55),
            0.07 + Math.random() * 0.03,
            3.4,
            'branch',
            9,
            1.35,
          )
          sprinkle(br, pal.pine ? 8 : 5)
          const tN = 1 + ((Math.random() * 2) | 0)
          for (let tw = 0; tw < tN; tw++) {
            const twig = addSeg(
              br,
              (tw % 2 === 0 ? -1 : 1) * (0.4 + Math.random() * 0.7),
              0.045 + Math.random() * 0.02,
              1.8,
              'twig',
              5.2,
              0.82,
            )
            sprinkle(twig, pal.pine ? 7 : 4)
          }
        }
      }
    }
    seedWeather()
    scaleLens()
    kinematics()
  }

  function scaleLens() {
    const treeH = h * 0.82
    for (const s of segs) s.len = s.lenN * treeH
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
    const x = s.x + Math.cos(s.wa) * s.len * leaf.along + Math.cos(ang + Math.PI / 2) * leaf.side * s.thick * 0.9
    const y = s.y + Math.sin(s.wa) * s.len * leaf.along + Math.sin(ang + Math.PI / 2) * leaf.side * s.thick * 0.9
    return { x, y, ang }
  }

  function spawnFall(x, y, vx, vy, pine, wood) {
    if (falling.length >= FALL_MAX) falling.shift()
    falling.push({
      x,
      y,
      vx,
      vy,
      rot: Math.random() * Math.PI,
      rv: (Math.random() - 0.5) * 6,
      pine: !!pine,
      wood: !!wood,
      len: wood ? 10 + Math.random() * 18 : 0,
      thick: wood ? 1.2 + Math.random() * 2 : 0,
      size: u * (0.18 + Math.random() * 0.22),
      age: 0,
    })
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
      spawnFall(p.x, p.y, Math.cos(a) * sp + gust * 40, Math.sin(a) * sp * (spray ? 0.4 : 0.2) - 20, leaf.pine, false)
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
        spawnFall(p.x, p.y, vx * 0.4 + (Math.random() - 0.5) * 50, vy * 0.3 - Math.random() * 40, leaf.pine, false)
      }
      stack.push(...c.kids)
    }
    for (const leaf of s.leaves) {
      if (!leaf.on) continue
      leaf.on = false
      const p = leafWorld(s, leaf)
      spawnFall(p.x, p.y, vx * 0.5, vy * 0.4, leaf.pine, false)
    }
    if (!peek && !still) {
      sfxSnap()
      taptic(18)
    }
  }

  function nearest(px, py) {
    let best = null
    let bd = 52
    for (const s of segs) {
      if (!s.alive) continue
      const hit = distSeg(px, py, s.x, s.y, s.tx, s.ty)
      const pad = Math.max(30, s.thick * 2.4)
      if (hit.d < bd && hit.d < pad + 22) {
        bd = hit.d
        best = { s, t: hit.t }
      }
    }
    return best
  }

  function pull(s, t, px, py, dt) {
    const gx = s.x + (s.tx - s.x) * t
    const gy = s.y + (s.ty - s.y) * t
    let dx = px - gx
    let dy = py - gy
    const max = s.role === 'trunk' ? 16 : s.role === 'twig' ? 64 : s.role === 'branch' ? 48 : 40
    const d = Math.hypot(dx, dy) || 1
    if (d > max) {
      dx = (dx / d) * max
      dy = (dy / d) * max
    }
    const armx = gx - s.x
    const army = gy - s.y
    const tau = (armx * dy - army * dx) / (s.len * s.len + 18)
    const gain = s.role === 'trunk' ? 5.5 : s.role === 'limb' ? 26 : s.role === 'branch' ? 32 : 38
    s.angVel += tau * gain * dt * 60
    if (s.p >= 0) {
      const p = segs[s.p]
      p.angVel += tau * gain * 0.18 * dt * 60
      if (p.p >= 0) segs[p.p].angVel += tau * gain * 0.06 * dt * 60
    }
    return Math.min(1, d / 70)
  }

  function stepTree(dt) {
    if (pal.weather === 'wind') {
      gust = Math.sin(t * 0.55) * Math.sin(t * 1.15) * 0.55
    } else gust = gust * 0.9

    for (const s of segs) {
      if (!s.alive) continue
      let torque = -s.k * (s.angle - s.rest) - s.damp * s.angVel
      if (pal.weather === 'wind' && s.role !== 'trunk') torque += gust * (s.role === 'twig' ? 2.4 : 1.1)
      s.angVel += torque * dt
      s.angle += s.angVel * dt
      const cap = s.role === 'trunk' ? 0.16 : s.role === 'limb' ? 0.85 : s.role === 'branch' ? 1.15 : 1.45
      if (s.angle > s.rest + cap) {
        s.angle = s.rest + cap
        s.angVel *= 0.3
      }
      if (s.angle < s.rest - cap) {
        s.angle = s.rest - cap
        s.angVel *= 0.3
      }
      const strain = Math.abs(s.angle - s.rest) + Math.abs(s.angVel) * 0.12
      if (strain > s.brk && s.role !== 'trunk') breakOff(s)
    }
    kinematics()

    let shedN = 0
    for (const s of segs) {
      if (!s.alive) continue
      const force = Math.abs(s.angVel) * 0.08 + Math.abs(s.angle - s.rest) * 0.35
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
        if (settled.length >= SETTLED_MAX) settled.shift()
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
    if (e.button || peek || still || !live()) return
    unlock()
    startAmbient()
    const p = ptr(e)
    const hit = nearest(p.x, p.y)
    if (!hit) return
    grabs.set(p.id, { s: hit.s, t: hit.t, x: p.x, y: p.y })
    canvas.style.cursor = 'grabbing'
    taptic(7)
    sfxCreak()
  }

  function onMove(e) {
    const g = grabs.get(e.pointerId)
    if (!g) return
    const p = ptr(e)
    g.x = p.x
    g.y = p.y
  }

  function onUp(e) {
    if (!grabs.has(e.pointerId)) return
    grabs.delete(e.pointerId)
    if (!grabs.size) canvas.style.cursor = 'grab'
    if (!peek && !still) sfxRustle(0.04)
  }

  function onReset(e) {
    e?.preventDefault()
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
          if (settled.length < SETTLED_MAX) {
            settled.push({
              x: p.x + (Math.random() - 0.5) * 30,
              y: ground - 2,
              vx: 0,
              vy: 0,
              rot: Math.random() * Math.PI,
              rv: 0,
              pine: leaf.pine,
              wood: false,
              size: leaf.size,
              age: 1,
            })
          }
        }
      }
    }
  }

  function posePull() {
    grow('autumn')
    const limb = segs.find((s) => s.role === 'limb' && s.rest > 0) || segs.find((s) => s.role === 'limb')
    if (limb) {
      limb.angle += 0.78
      limb.angVel = 2.4
    }
    kinematics()
    for (const s of segs) {
      if (s.role !== 'trunk') shedFrom(s, 1.2, false)
    }
    for (let i = 0; i < 16; i++) {
      spawnFall(
        w * (0.32 + Math.random() * 0.36),
        h * (0.28 + Math.random() * 0.32),
        (Math.random() - 0.5) * 40,
        20 + Math.random() * 40,
        false,
        false,
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
    const x = w * 0.82
    const y = h * 0.16
    const r = u * 1.8
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

  function drawSeg(s) {
    if (!s.alive) return
    ctx.save()
    ctx.strokeStyle = pal.wood
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(1.15, s.thick * 0.72)
    ctx.shadowColor = pal.wood
    ctx.shadowBlur = reduced ? 0 : Math.min(8, s.thick * 0.35)
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(s.tx, s.ty)
    ctx.stroke()
    if (s.snow > 0.15) {
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(231,248,255,0.7)'
      ctx.beginPath()
      ctx.ellipse(s.tx, s.ty, s.thick * 0.55, 2.2, s.wa, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    for (const leaf of s.leaves) {
      if (!leaf.on) continue
      const p = leafWorld(s, leaf)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.ang)
      ctx.strokeStyle = leaf.hue
      ctx.fillStyle = 'rgba(2,8,12,0.55)'
      ctx.lineWidth = 1.1
      ctx.shadowBlur = 0
      if (leaf.pine) {
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(leaf.size * 1.6, leaf.side * leaf.size * 0.2)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.ellipse(0, 0, leaf.size, leaf.size * 0.45, 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  function drawBits(list, alpha = 1) {
    for (const p of list) {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.shadowBlur = reduced ? 0 : 4
      if (p.wood) {
        ctx.strokeStyle = pal.wood
        ctx.shadowColor = pal.wood
        ctx.lineWidth = Math.max(1, p.thick)
        ctx.beginPath()
        ctx.moveTo(-p.len * 0.5, 0)
        ctx.lineTo(p.len * 0.5, 0)
        ctx.stroke()
      } else if (p.pine) {
        ctx.strokeStyle = pal.leaf
        ctx.shadowColor = pal.leaf
        ctx.beginPath()
        ctx.moveTo(-p.size, 0)
        ctx.lineTo(p.size * 1.4, 0)
        ctx.stroke()
      } else {
        ctx.strokeStyle = pal.leaf2
        ctx.fillStyle = 'rgba(2,8,12,0.5)'
        ctx.shadowColor = pal.leaf
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size || 3, (p.size || 3) * 0.4, 0.3, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  function drawWeather() {
    if (pal.weather === 'rain') {
      ctx.save()
      ctx.strokeStyle = 'rgba(183,236,255,0.35)'
      ctx.lineWidth = 1
      for (const d of rain) {
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - 3, d.y + d.len)
        ctx.stroke()
      }
      ctx.restore()
    }
    if (pal.weather === 'snow') {
      ctx.save()
      ctx.fillStyle = 'rgba(231,248,255,0.8)'
      for (const f of snow) {
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
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
    for (const s of segs) drawSeg(s)
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
    raf = requestAnimationFrame(tick)
  }

  function onKey(e) {
    if (peek || still || promptOpen() || !isLive()) return
    if (e.key === 'r' || e.key === 'R') onReset(e)
  }

  if (!peek && !still) {
    canvas.addEventListener('pointerdown', onDown)
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
    const ok = layout()
    if (!ok) return
    if (!segs.length) grow(still ? 'autumn' : randomKind())
    else {
      scaleLens()
      kinematics()
    }
    if (still) poseStill()
  })

  layout()
  grow(still ? 'autumn' : peek ? 'summer' : randomKind())
  if (still) poseStill()
  last = performance.now()
  raf = requestAnimationFrame(tick)
  canvas.__scene = poseScene

  return () => {
    cancelAnimationFrame(raf)
    stopWatch()
    stopAmbient()
    delete canvas.__scene
    canvas.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('keydown', onKey)
    resetBtn?.removeEventListener('click', onReset)
  }
}
