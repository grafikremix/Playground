import { unlock, getContext, getMaster, silent, soundOn, canPlay } from '../lib/audio.js'
import { isLive } from '../lib/play.js'
import { viewSize, watchFrame } from '../lib/canvas.js'
import { render } from 'plinkfx/core'
import { splash, waterDrop, oceanWave } from 'plinkfx/sounds'
import SPH from './waterfall/js/SPH.js'
import { createRenderer } from './waterfall/js/Renderer.js'
import { createWebGPUFluid } from './waterfall/js/WebGPUFluid.js'

const FLOW_PATCH = {
  loop: true,
  layers: [
    { wave: 'pink', lp: 620, a: 0.4, h: 1.6, d: 0, gain: 0.55 },
    { wave: 'brown', lp: 260, a: 0.5, h: 1.6, d: 0, gain: 0.8 },
    { wave: 'noise', lp: 480, a: 0.35, h: 1.6, d: 0, gain: 0.2 },
  ],
  gain: 0.4,
}

const ICE = '#b7ecff'
const ICE_SOFT = 'rgba(183,236,255,0.9)'
const BG = '#02050c'
const SCREENS = 4.2
const DT = 1 / 60
const POOL_MIN = 56
const SPRINGS = 48
const STROKE_R = 14
const PREV_PRESS = { slow: 70, medium: 150, fast: 240 }
const PRESS = {
  slow: { rate: 35, speed: 70, spread: 7, ambient: 0.09 },
  medium: { rate: 75, speed: 110, spread: 10, ambient: 0.12 },
  fast: { rate: 120, speed: 155, spread: 14, ambient: 0.16 },
}
const TRIG_MAX = 4
const RATES = ['slow', 'medium', 'fast']
const RATE_LABEL = { slow: 'Slow', medium: 'Med', fast: 'Fast' }
const CANVAS_CSS =
  'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;pointer-events:none;'

function wantCanvasOnly() {
  try {
    return /(?:^|[?&])wfgl=0(?:&|$)/.test(location.search || '')
  } catch {
    return false
  }
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function freshFluidCanvas() {
  const canvas = document.createElement('canvas')
  canvas.className = 'wf-fluid'
  canvas.style.cssText = `${CANVAS_CSS}z-index:1;`
  return canvas
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function particleCap() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const memory = Number(navigator.deviceMemory) || 8
  const cores = Number(navigator.hardwareConcurrency) || 4
  if (memory <= 3 || cores <= 4 || coarse) return coarse ? 1800 : 2400
  return 3600
}

function preferredDiameter(width, height) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (!coarse) return 36
  return Math.round(Math.max(28, Math.min(34, Math.min(width, height) * 0.076)))
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy || 1
  let t = ((px - ax) * dx + (py - ay) * dy) / l2
  t = clamp(t, 0, 1)
  const x = ax + dx * t
  const y = ay + dy * t
  return { t, x, y, d: Math.hypot(px - x, py - y) }
}

function rdp(pts, eps = 2.6) {
  if (pts.length < 3) return pts.slice()
  let max = 0
  let idx = 0
  const a = pts[0]
  const b = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distSeg(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y).d
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps)
    const right = rdp(pts.slice(idx), eps)
    return left.slice(0, -1).concat(right)
  }
  return [a, b]
}

function chaikin(pts) {
  if (pts.length < 3) return pts.slice()
  const out = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
  }
  out.push(pts[pts.length - 1])
  return out
}

function smoothStroke(raw) {
  const pts = []
  for (const p of raw) {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2.2) pts.push({ x: p.x, y: p.y })
  }
  if (pts.length < 2) return pts
  return rdp(chaikin(chaikin(pts)), 2.4)
}

export function mount(stage, { still, peek } = {}) {
  const preview = !!(still || peek)
  let stopped = false
  let stopInner = () => {}

  const wrap = document.createElement('div')
  wrap.className = 'wf-wrap'
  wrap.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;touch-action:none;overflow:hidden;overscroll-behavior:none;-webkit-user-select:none;user-select:none;background:#02050c;'

  const bg = document.createElement('canvas')
  const overlay = document.createElement('canvas')
  let fluid = freshFluidCanvas()
  bg.className = 'wf-bg'
  overlay.className = 'wf-overlay'
  bg.style.cssText = `${CANVAS_CSS}z-index:0;`
  overlay.style.cssText = `${CANVAS_CSS}z-index:2;cursor:crosshair;`

  const hit = document.createElement('div')
  hit.className = 'wf-hit'
  hit.setAttribute('aria-hidden', 'true')

  const hud = document.createElement('div')
  hud.className = 'wf-hud'
  hud.innerHTML = `
    <div class="wf-bar">
      <div
        class="wf-slider"
        role="slider"
        tabindex="0"
        aria-label="Pressure"
        aria-valuemin="0"
        aria-valuemax="2"
        aria-valuenow="1"
        aria-valuetext="Med"
      >
        <p class="wf-slider-k">Pressure</p>
        <div class="wf-slider-track">
          <span class="wf-tick" data-notch="0"></span>
          <span class="wf-tick" data-notch="1"></span>
          <span class="wf-tick" data-notch="2"></span>
          <span class="wf-thumb"></span>
        </div>
        <div class="wf-slider-labels" aria-hidden="true">
          <span>Slow</span><span>Med</span><span>Fast</span>
        </div>
      </div>
      <button type="button" class="wf-undo" aria-label="Undo">Undo</button>
      <button type="button" class="wf-reset" aria-label="Reset">Reset</button>
    </div>`

  if (preview) wrap.append(bg, fluid, overlay, hit)
  else wrap.append(bg, fluid, overlay, hit, hud)
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;'
  stage.replaceChildren(wrap)

  const frame = stage.closest('.stage-frame') || stage
  const bctx = bg.getContext('2d', { alpha: false })
  const octx = overlay.getContext('2d', { alpha: true })
  const first = viewSize(frame)
  const maxParticles = particleCap()
  const diameter = preferredDiameter(first.w || 390, first.h || 844)
  const padding = diameter * 0.45
  const simulation = new SPH({
    width: first.w || 390,
    height: (first.h || 844) * SCREENS,
    maxParticles,
    smoothingRadius: 32,
    boundaryPadding: padding,
  })
  simulation.particleRadius = diameter * 0.32

  let renderer = createRenderer(fluid, maxParticles, { force2d: true })
  if (!renderer) {
    fluid = freshFluidCanvas()
    wrap.insertBefore(fluid, overlay)
    renderer = createRenderer(fluid, maxParticles, { force2d: true })
  }
  if (!renderer) {
    renderer = {
      backend: 'none',
      setCamera() {},
      setParticleDiameter() {},
      resize() {},
      render() {},
    }
  }
  renderer.setParticleDiameter?.(diameter)

  stopInner = run({
    wrap,
    hit,
    frame,
    bg,
    overlay,
    getFluid: () => fluid,
    setFluid: (next) => {
      fluid = next
    },
    bctx,
    octx,
    hud,
    preview,
    simulation,
    renderer,
    solverPath: 'cpu+canvas',
    maxParticles,
    diameter,
  })

  return () => {
    stopped = true
    stopInner()
  }
}

function run({
  wrap,
  hit,
  frame,
  bg,
  overlay,
  getFluid,
  setFluid,
  bctx,
  octx,
  hud,
  preview,
  simulation,
  renderer,
  solverPath,
  maxParticles,
  diameter,
}) {
  const cpuSim = simulation
  let fluid = getFluid()
  let w = 390
  let h = 844
  let worldH = h * SCREENS
  let camY = 0
  let dpr = 1
  const strokes = []
  const segs = []
  const pointers = new Map()
  let mode = 'idle'
  let drawing = null
  let scrollY = 0
  let pressure = 'medium'
  let raf = 0
  let last = performance.now()
  let acc = 0
  let emitAcc = 0
  let spawned = 0
  let spawnT0 = performance.now()
  let fpsEma = 60
  let vol = 0
  let poolBase = POOL_MIN
  const pool = new Float32Array(SPRINGS)
  const poolV = new Float32Array(SPRINGS)
  const boats = []
  const buffers = new Map()
  const trigs = []
  let analyser = null
  let bus = null
  let limiter = null
  let flowGain = null
  let flowFilt = null
  let flowSrc = null
  let flowLfo = 0
  let rmsPeak = 0
  const rmsBuf = new Uint8Array(128)
  let gpuPull = 0
  let renderScale = 1
  let lastQuality = 0
  let glFails = 0
  const canvasCss = CANVAS_CSS

  function live() {
    return isLive()
  }

  function hudInset() {
    if (preview || !hud?.isConnected) return 0
    return Math.ceil(hud.getBoundingClientRect().height)
  }

  function maxCam() {
    return Math.max(0, worldH - h + hudInset())
  }

  function setCam(y) {
    camY = clamp(y, 0, maxCam())
    renderer.setCamera?.(camY)
    simulation.setCamera?.(camY)
  }

  function rebuildSegs() {
    segs.length = 0
    for (const s of strokes) {
      for (const g of s.segs) segs.push(g)
    }
    const rad = (simulation.particleRadius || diameter * 0.32) + STROKE_R * 0.52
    simulation.setCapsules?.(segs, rad)
  }

  function resetPool() {
    pool.fill(0)
    poolV.fill(0)
    vol = 0
    poolBase = POOL_MIN
    simulation.setFloor?.(worldH - poolBase)
  }

  function resetBoats() {
    boats.length = 0
    for (let i = 0; i < 4; i++) {
      boats.push({
        x: w * (0.16 + i * 0.22),
        vx: (i % 2 ? 8 : -6) * 0.15,
        bob: 0,
        vb: 0,
        a: 0,
        _y: worldH - poolBase,
      })
    }
  }

  function addStroke(points) {
    const pts2 = smoothStroke(points)
    if (pts2.length < 2) return null
    const strokeSegs = []
    for (let i = 0; i < pts2.length - 1; i++) {
      strokeSegs.push({ ax: pts2[i].x, ay: pts2[i].y, bx: pts2[i + 1].x, by: pts2[i + 1].y })
    }
    strokes.push({ pts: pts2, segs: strokeSegs })
    rebuildSegs()
    return strokes[strokes.length - 1]
  }

  function seedDemo() {
    strokes.length = 0
    const cx = w * 0.5
    addStroke([
      { x: cx - 118, y: 168 },
      { x: cx + 118, y: 168 },
    ])
    addStroke([
      { x: cx - 78, y: 310 },
      { x: cx - 62, y: 372 },
      { x: cx, y: 396 },
      { x: cx + 62, y: 372 },
      { x: cx + 78, y: 310 },
    ])
    addStroke([
      { x: cx + 40, y: 470 },
      { x: cx + 150, y: 560 },
    ])
  }

  function poolY(x) {
    const u = clamp(x / w, 0, 0.999) * (SPRINGS - 1)
    const i = u | 0
    const f = u - i
    const wave = pool[i] * (1 - f) + pool[Math.min(SPRINGS - 1, i + 1)] * f
    return worldH - (poolBase + wave)
  }

  function splashPool(x, amp) {
    const u = clamp(x / w, 0, 0.999) * (SPRINGS - 1)
    const i = u | 0
    poolV[i] += amp
    if (i > 0) poolV[i - 1] += amp * 0.4
    if (i < SPRINGS - 1) poolV[i + 1] += amp * 0.4
  }

  function mergeAt(x, energy) {
    vol += 1
    const rise = (diameter * 0.42 * diameter * 0.42) / Math.max(80, w)
    poolBase = Math.min(worldH - 10, POOL_MIN + vol * rise)
    splashPool(x, Math.min(10, 0.012 * energy + 0.35))
    simulation.setFloor?.(worldH - poolBase)
    for (const b of boats) {
      if (Math.abs(b.x - x) < 42) {
        b.vx += (Math.random() - 0.5) * 4
        b.vb -= Math.min(18, energy * 0.025)
        b.a += x < b.x ? 0.02 : -0.02
      }
    }
    if (energy > 180) sfxSplash(energy)
    else if (energy > 80 && Math.random() < 0.18) sfxDrip()
    else sfxLap()
  }

  function noteTrig() {
    const now = performance.now()
    while (trigs.length && now - trigs[0] > 1000) trigs.shift()
    if (trigs.length >= TRIG_MAX) return false
    if (trigs.length && now - trigs[trigs.length - 1] < 220) return false
    trigs.push(now)
    return true
  }

  function trigPerSec() {
    const now = performance.now()
    while (trigs.length && now - trigs[0] > 1000) trigs.shift()
    return trigs.length
  }

  function stepPool(hdt) {
    const k = 36
    const damp = 0.16
    const spread = 0.32
    for (let i = 0; i < SPRINGS; i++) {
      const left = pool[i > 0 ? i - 1 : i]
      const right = pool[i < SPRINGS - 1 ? i + 1 : i]
      const force = -k * pool[i] + (left + right - 2 * pool[i]) * spread * 50
      poolV[i] = (poolV[i] + force * hdt) * (1 - damp)
      pool[i] = clamp(pool[i] + poolV[i] * hdt, -18, 22)
    }
  }

  function stepBoats(hdt) {
    for (const b of boats) {
      const yL = poolY(b.x - 18)
      const yR = poolY(b.x + 18)
      const y = (yL + yR) * 0.5
      const slope = Math.atan2(yR - yL, 36)
      b.a += (slope * 0.75 - b.a) * 5 * hdt
      b.vx += slope * 22 * hdt
      b.vx *= 0.988
      b.x = clamp(b.x + b.vx * hdt, 28, w - 28)
      b.vb += (-b.bob * 16 - b.vb * 2.2) * hdt
      b.bob = clamp(b.bob + b.vb * hdt, -10, 10)
      b._y = y + b.bob
    }
  }

  function emit(hdt) {
    if (!live() && !preview) return
    const p = PRESS[pressure]
    emitAcc += p.rate * hdt
    while (emitAcc >= 1) {
      emitAcc -= 1
      const jx = (Math.random() - 0.5) * p.spread
      const ok = simulation.addParticle(
        w * 0.5 + jx,
        22 + Math.random() * 6,
        jx * 1.4,
        p.speed * (0.88 + Math.random() * 0.18),
      )
      if (ok) spawned += 1
    }
  }

  function drainPool() {
    const floor = worldH - poolBase + 6
    simulation.drainBelow?.(floor, (x, energy) => mergeAt(x, energy))
  }

  function audioGraph() {
    const ac = getContext()
    const master = getMaster()
    if (!ac || !master || silent()) return null
    if (!bus || bus.context !== ac) {
      bus = ac.createGain()
      bus.gain.value = 0.55
      if (typeof ac.createDynamicsCompressor === 'function') {
        limiter = ac.createDynamicsCompressor()
        limiter.threshold.value = -24
        limiter.knee.value = 10
        limiter.ratio.value = 14
        limiter.attack.value = 0.003
        limiter.release.value = 0.26
      } else {
        limiter = ac.createGain()
        limiter.gain.value = 0.7
      }
      analyser = ac.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.55
      bus.connect(limiter)
      limiter.connect(analyser)
      limiter.connect(master)
    }
    return ac
  }

  function bufFor(name, sound) {
    const ac = audioGraph()
    if (!ac) return null
    if (buffers.has(name)) return buffers.get(name)
    try {
      const samples = render(sound, { seed: 1, sampleRate: ac.sampleRate || 44100 })
      const buf = ac.createBuffer(1, samples.length, ac.sampleRate || 44100)
      buf.getChannelData(0).set(samples)
      buffers.set(name, buf)
      return buf
    } catch {
      return null
    }
  }

  function playSoft(name, sound, amp, { rate = 1, lp = 720, attack = 0.05, dur = 0.9 } = {}) {
    if (!canPlay()) return
    const ac = audioGraph()
    if (!ac || !bus) return
    const buf = bufFor(name, sound)
    if (!buf) return
    try {
      const src = ac.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = rate
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = lp
      f.Q.value = 0.5
      const g = ac.createGain()
      const t = ac.currentTime
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      src.connect(f)
      f.connect(g)
      g.connect(bus)
      src.start()
    } catch {
      /* audio optional */
    }
  }

  function ensureFlow() {
    if (flowSrc || silent() || !canPlay()) return
    const ac = audioGraph()
    if (!ac || !bus) return
    const buf = bufFor('flowBed', FLOW_PATCH)
    const wave = bufFor('ocean', oceanWave)
    if (!buf) return
    try {
      const src = ac.createBufferSource()
      src.buffer = buf
      src.loop = true
      flowFilt = ac.createBiquadFilter()
      flowFilt.type = 'lowpass'
      flowFilt.frequency.value = 460
      flowFilt.Q.value = 0.35
      const flowFilt2 = ac.createBiquadFilter()
      flowFilt2.type = 'lowpass'
      flowFilt2.frequency.value = 380
      flowFilt2.Q.value = 0.4
      flowGain = ac.createGain()
      flowGain.gain.value = 0.0001
      src.connect(flowFilt)
      flowFilt.connect(flowFilt2)
      flowFilt2.connect(flowGain)
      flowGain.connect(bus)
      src.start()
      flowSrc = src
      if (wave) {
        const src2 = ac.createBufferSource()
        src2.buffer = wave
        src2.loop = true
        const g2 = ac.createGain()
        g2.gain.value = 0.35
        const f2 = ac.createBiquadFilter()
        f2.type = 'lowpass'
        f2.frequency.value = 420
        src2.connect(f2)
        f2.connect(g2)
        g2.connect(flowGain)
        src2.start()
      }
    } catch {
      flowSrc = null
    }
  }

  function sfxSplash(energy) {
    if (!noteTrig()) return
    unlock()
    ensureFlow()
    const amp = clamp(0.02 + energy / 14000, 0.02, 0.055)
    playSoft('splash', splash, amp, { rate: 0.62 + Math.random() * 0.22, lp: 520, attack: 0.08, dur: 1.15 })
  }

  function sfxDrip() {
    if (!noteTrig()) return
    unlock()
    playSoft('drip', waterDrop, 0.018, { rate: 0.55 + Math.random() * 0.3, lp: 480, attack: 0.1, dur: 0.7 })
  }

  function sfxLap() {
    if (Math.random() > 0.28) return
    if (!noteTrig()) return
    unlock()
    ensureFlow()
    playSoft('lap', oceanWave, 0.03, { rate: 0.58 + Math.random() * 0.22, lp: 400, attack: 0.14, dur: 1.6 })
  }

  function tickAmbient() {
    if (!soundOn() || silent()) {
      try {
        flowGain?.gain.setTargetAtTime(0.0001, getContext()?.currentTime || 0, 0.12)
      } catch {
        /* */
      }
      return
    }
    ensureFlow()
    if (!flowGain || !getContext()) return
    try {
      const t = getContext().currentTime
      flowLfo += 0.012
      const p = PRESS[pressure]
      const flowAmt = clamp(simulation.count / 110 + p.rate / 180, 0.25, 1)
      const g = p.ambient * 0.42 * flowAmt * (0.86 + Math.sin(flowLfo) * 0.14)
      flowGain.gain.setTargetAtTime(g, t, 0.28)
      flowFilt?.frequency.setTargetAtTime(400 + p.rate * 0.7, t, 0.35)
    } catch {
      /* */
    }
  }

  function readRms() {
    if (!analyser) return 0
    try {
      analyser.getByteTimeDomainData(rmsBuf)
      let s = 0
      for (let i = 0; i < rmsBuf.length; i++) {
        const v = (rmsBuf[i] - 128) / 128
        s += v * v
      }
      const r = Math.sqrt(s / rmsBuf.length)
      if (r > rmsPeak) rmsPeak = r
      return r
    } catch {
      return 0
    }
  }

  function size2d(canvas, ctx, width, height, ratio) {
    const bw = Math.max(1, Math.round(width * ratio))
    const bh = Math.max(1, Math.round(height * ratio))
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  function drawBoat(b) {
    const x = b.x
    const y = (b._y || poolY(b.x)) - camY
    if (y < -40 || y > h + 40) return
    octx.save()
    octx.translate(x, y)
    octx.rotate(b.a)
    octx.strokeStyle = ICE
    octx.fillStyle = 'rgba(183,236,255,0.18)'
    octx.lineWidth = 1.5
    octx.beginPath()
    octx.moveTo(-20, 5)
    octx.quadraticCurveTo(0, 16, 20, 5)
    octx.lineTo(14, -1)
    octx.lineTo(-14, -1)
    octx.closePath()
    octx.fill()
    octx.stroke()
    octx.beginPath()
    octx.moveTo(-1, -1)
    octx.lineTo(-1, -28)
    octx.stroke()
    octx.beginPath()
    octx.moveTo(-1, -28)
    octx.lineTo(16, -8)
    octx.lineTo(-1, -5)
    octx.closePath()
    octx.fill()
    octx.stroke()
    octx.restore()
  }

  function paintBg() {
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    bctx.fillStyle = BG
    bctx.fillRect(0, 0, w, h)
    bctx.save()
    bctx.translate(0, -camY)
    bctx.strokeStyle = 'rgba(183,236,255,0.08)'
    bctx.lineWidth = 1
    const g0 = ((camY / 96) | 0) * 96
    for (let y = g0; y <= camY + h + 96; y += 96) {
      bctx.beginPath()
      bctx.moveTo(0, y)
      bctx.lineTo(w, y)
      bctx.stroke()
    }
    bctx.beginPath()
    bctx.moveTo(w * 0.5 - 10, 8)
    bctx.lineTo(w * 0.5 + 10, 8)
    bctx.lineTo(w * 0.5, 18)
    bctx.closePath()
    bctx.strokeStyle = ICE
    bctx.stroke()
    bctx.beginPath()
    bctx.moveTo(0, worldH)
    for (let i = 0; i < SPRINGS; i++) {
      const x = (i / (SPRINGS - 1)) * w
      bctx.lineTo(x, worldH - (poolBase + pool[i]))
    }
    bctx.lineTo(w, worldH)
    bctx.closePath()
    bctx.fillStyle = 'rgba(183,236,255,0.55)'
    bctx.fill()
    bctx.restore()
  }

  function paintOverlay() {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0)
    octx.clearRect(0, 0, w, h)
    octx.save()
    octx.translate(0, -camY)
    octx.lineJoin = 'round'
    octx.lineCap = 'round'
    octx.strokeStyle = ICE
    octx.shadowColor = 'transparent'
    octx.shadowBlur = 0
    octx.lineWidth = STROKE_R * 1.05
    for (const s of strokes) {
      if (s.pts.length < 2) continue
      octx.beginPath()
      octx.moveTo(s.pts[0].x, s.pts[0].y)
      for (let i = 1; i < s.pts.length; i++) octx.lineTo(s.pts[i].x, s.pts[i].y)
      octx.stroke()
    }
    if (drawing && drawing.length > 1) {
      octx.globalAlpha = 0.7
      octx.beginPath()
      octx.moveTo(drawing[0].x, drawing[0].y)
      for (let i = 1; i < drawing.length; i++) octx.lineTo(drawing[i].x, drawing[i].y)
      octx.stroke()
      octx.globalAlpha = 1
    }
    octx.shadowBlur = 0
    octx.beginPath()
    octx.moveTo(0, worldH - (poolBase + pool[0]))
    for (let i = 1; i < SPRINGS; i++) {
      const x = (i / (SPRINGS - 1)) * w
      octx.lineTo(x, worldH - (poolBase + pool[i]))
    }
    octx.strokeStyle = ICE_SOFT
    octx.lineWidth = 1.4
    octx.stroke()
    for (const b of boats) drawBoat(b)
    octx.restore()
  }

  function swapFluidCanvas(next) {
    const prev = fluid
    next.className = 'wf-fluid'
    next.style.cssText = `${canvasCss}z-index:1;`
    prev.replaceWith(next)
    fluid = next
    setFluid?.(next)
  }

  function restoreCpuSim() {
    if (simulation === cpuSim) return
    try {
      cpuSim.clear?.()
      const n = Math.min(simulation.count || 0, cpuSim.maxParticles || 0)
      for (let i = 0; i < n; i++) {
        cpuSim.addParticle(
          simulation.x[i],
          simulation.y[i],
          simulation.vx?.[i] || 0,
          simulation.vy?.[i] || 0,
        )
      }
    } catch {
      /* copy is best-effort */
    }
    try {
      simulation.destroy?.()
    } catch {
      /* */
    }
    simulation = cpuSim
    rebuildSegs()
  }

  function fallbackToCanvas(reason) {
    if (renderer?.backend === 'Canvas 2D' && simulation === cpuSim) return false
    console.warn('waterfall falling back to Canvas 2D', reason || '')
    try {
      restoreCpuSim()
      const next = freshFluidCanvas()
      const drawn = createRenderer(next, maxParticles, { force2d: true })
      if (!drawn) return false
      swapFluidCanvas(next)
      renderer = drawn
      renderer.setParticleDiameter(diameter)
      solverPath = 'cpu+canvas'
      glFails = 0
      layout()
      return true
    } catch (err) {
      console.error('waterfall canvas fallback failed', err)
      return false
    }
  }

  function draw() {
    try {
      paintBg()
    } catch (err) {
      console.error('waterfall bg', err)
    }
    try {
      renderer.setCamera?.(camY)
      renderer.render(simulation)
      glFails = 0
    } catch (err) {
      console.error('waterfall fluid', err)
      glFails += 1
      if (glFails >= 2) fallbackToCanvas(err)
    }
    try {
      paintOverlay()
    } catch (err) {
      console.error('waterfall overlay', err)
    }
  }

  function pixelRatio() {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    const cap = coarse ? 1 : 1.25
    return Math.min(window.devicePixelRatio || 1, cap) * renderScale
  }

  function layout() {
    const box = viewSize(frame)
    if (box.w < 2 || box.h < 2) return
    w = box.w
    h = box.h
    dpr = pixelRatio()
    worldH = h * SCREENS
    size2d(bg, bctx, w, h, dpr)
    size2d(overlay, octx, w, h, dpr)
    simulation.resize(w, worldH, dpr)
    simulation.setBoundaryPadding?.(diameter * 0.45)
    if (renderer !== simulation) renderer.resize(w, h, dpr)
    simulation.setView?.(w, h, dpr, camY)
    renderer.setParticleDiameter?.(diameter)
    renderer.setCamera?.(camY)
    setCam(camY)
    simulation.setFloor?.(worldH - poolBase)
    if (hit) hit.style.bottom = preview ? '0px' : `${hudInset()}px`
    if (!boats.length) resetBoats()
    else for (const b of boats) b.x = clamp(b.x, 28, w - 28)
  }

  function resetWorld() {
    strokes.length = 0
    drawing = null
    mode = 'idle'
    pointers.clear()
    rebuildSegs()
    simulation.clear()
    resetPool()
    resetBoats()
    setCam(0)
    emitAcc = 0
    spawned = 0
    spawnT0 = performance.now()
    if (preview) seedDemo()
  }

  function hudTarget(t) {
    return !!(t && t.closest && t.closest('.wf-hud, button, .wf-slider, .wf-undo, .wf-reset, .wf-bar'))
  }

  function pointInHud(clientX, clientY) {
    if (preview || !hud?.isConnected) return false
    const r = hud.getBoundingClientRect()
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
  }

  function eventInHud(e) {
    if (hudTarget(e.target)) return true
    if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY) && pointInHud(e.clientX, e.clientY)) return true
    try {
      const x = Number.isFinite(e.clientX) ? e.clientX : 0
      const y = Number.isFinite(e.clientY) ? e.clientY : 0
      return hudTarget(document.elementFromPoint(x, y))
    } catch {
      return false
    }
  }

  function pointFrom(e) {
    const r = wrap.getBoundingClientRect()
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top + camY,
      sx: e.clientX,
      sy: e.clientY,
    }
  }

  function centroidSy() {
    let s = 0
    for (const p of pointers.values()) s += p.sy
    return s / pointers.size
  }

  function endDraw(commit) {
    if (commit && drawing && drawing.length >= 2) addStroke(drawing)
    drawing = null
  }

  function onDown(e) {
    if (eventInHud(e)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!live() && !preview) return
    e.preventDefault?.()
    try {
      hit.setPointerCapture?.(e.pointerId)
    } catch {
      try {
        wrap.setPointerCapture?.(e.pointerId)
      } catch {
        /* */
      }
    }
    try {
      unlock()
    } catch {
      /* AudioContext must never kill input */
    }
    pointers.set(e.pointerId, pointFrom(e))
    if (pointers.size === 1) {
      mode = 'draw'
      drawing = [pointFrom(e)]
      scrollY = e.clientY
    } else {
      endDraw(true)
      mode = 'scroll'
      scrollY = centroidSy()
    }
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return
    e.preventDefault?.()
    pointers.set(e.pointerId, pointFrom(e))
    if (mode === 'scroll' || pointers.size >= 2) {
      mode = 'scroll'
      drawing = null
      const cy = centroidSy()
      setCam(camY + (cy - scrollY))
      scrollY = cy
      return
    }
    if (mode === 'draw' && drawing) {
      const cur = pointers.get(e.pointerId)
      const lastP = drawing[drawing.length - 1]
      if (Math.hypot(cur.x - lastP.x, cur.y - lastP.y) >= 1.5) drawing.push({ x: cur.x, y: cur.y })
    }
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    if (mode === 'draw' && pointers.size === 0) endDraw(true)
    if (pointers.size === 0) {
      mode = 'idle'
      drawing = null
    } else if (pointers.size === 1 && mode === 'scroll') {
      scrollY = centroidSy()
    }
  }

  function touchId(t) {
    return (t.identifier ?? 0) + 1000
  }

  function touchInHud(t) {
    if (pointInHud(t.clientX, t.clientY)) return true
    try {
      return hudTarget(document.elementFromPoint(t.clientX, t.clientY))
    } catch {
      return false
    }
  }

  function preventPageScroll(e) {
    if (hudTarget(e.target)) return
    const touches = e.changedTouches || []
    if (touches.length && [...touches].every(touchInHud)) return
    e.preventDefault()
  }

  function onTouchStart(e) {
    const rest = [...e.changedTouches].filter((t) => !touchInHud(t))
    if (!rest.length) return
    preventPageScroll(e)
    for (const t of rest) {
      onDown({
        pointerId: touchId(t),
        pointerType: 'touch',
        button: 0,
        clientX: t.clientX,
        clientY: t.clientY,
        target: e.target,
        preventDefault: () => e.preventDefault(),
      })
    }
  }

  function onTouchMove(e) {
    const rest = [...e.changedTouches].filter((t) => !touchInHud(t) || pointers.has(touchId(t)))
    if (!rest.length) return
    preventPageScroll(e)
    for (const t of rest) {
      onMove({
        pointerId: touchId(t),
        pointerType: 'touch',
        clientX: t.clientX,
        clientY: t.clientY,
        preventDefault: () => e.preventDefault(),
      })
    }
  }

  function onTouchEnd(e) {
    const rest = [...e.changedTouches].filter((t) => pointers.has(touchId(t)) || !touchInHud(t))
    if (!rest.length) return
    preventPageScroll(e)
    for (const t of rest) onUp({ pointerId: touchId(t) })
  }

  function onPointerFromMouse(handler) {
    return (e) => {
      if (e.pointerType === 'touch') return
      handler(e)
    }
  }

  const captureTouch = { passive: false, capture: true }
  wrap.addEventListener('pointerdown', onPointerFromMouse(onDown))
  wrap.addEventListener('pointermove', onPointerFromMouse(onMove))
  wrap.addEventListener('pointerup', onPointerFromMouse(onUp))
  wrap.addEventListener('pointercancel', onPointerFromMouse(onUp))
  wrap.addEventListener('lostpointercapture', onPointerFromMouse(onUp))
  wrap.addEventListener('touchstart', onTouchStart, captureTouch)
  wrap.addEventListener('touchmove', onTouchMove, captureTouch)
  wrap.addEventListener('touchend', onTouchEnd, captureTouch)
  wrap.addEventListener('touchcancel', onTouchEnd, captureTouch)
  const blockGesture = (e) => e.preventDefault()
  wrap.addEventListener('gesturestart', blockGesture)
  wrap.addEventListener('gesturechange', blockGesture)
  wrap.addEventListener('gestureend', blockGesture)
  wrap.addEventListener('contextmenu', (e) => e.preventDefault())

  const slider = hud.querySelector('.wf-slider')
  const thumb = hud.querySelector('.wf-thumb')
  let sliding = false

  function rateIndex(name) {
    const i = RATES.indexOf(name)
    return i < 0 ? 1 : i
  }

  function setPressure(next) {
    if (!PRESS[next]) return
    pressure = next
    spawned = 0
    spawnT0 = performance.now()
    const i = rateIndex(pressure)
    if (slider) {
      slider.setAttribute('aria-valuenow', String(i))
      slider.setAttribute('aria-valuetext', RATE_LABEL[pressure])
    }
    if (thumb) thumb.style.left = `${(i / 2) * 100}%`
    tickAmbient()
  }

  function snapPressureFromX(clientX) {
    const track = hud.querySelector('.wf-slider-track')
    if (!track) return
    const r = track.getBoundingClientRect()
    const t = r.width <= 0 ? 0.5 : (clientX - r.left) / r.width
    setPressure(RATES[Math.round(clamp(t, 0, 1) * 2)])
  }

  hud.addEventListener('pointerdown', (e) => {
    if (!hudTarget(e.target)) return
    e.stopPropagation()
    if (e.target.closest('.wf-slider')) {
      sliding = true
      try {
        slider.setPointerCapture?.(e.pointerId)
      } catch {
        /* */
      }
      try {
        unlock()
      } catch {
        /* */
      }
      snapPressureFromX(e.clientX)
    }
  })
  hud.addEventListener('pointermove', (e) => {
    if (!sliding) return
    e.stopPropagation()
    snapPressureFromX(e.clientX)
  })
  const endSlide = (e) => {
    if (!sliding) return
    e.stopPropagation()
    sliding = false
  }
  hud.addEventListener('pointerup', endSlide)
  hud.addEventListener('pointercancel', endSlide)
  const onHudTouch = (e) => {
    const onSlider = !!(e.target.closest?.('.wf-slider') || sliding)
    if (!onSlider) return
    e.stopPropagation()
    e.preventDefault()
    const t = e.changedTouches[0] || e.touches[0]
    if (t) {
      if (e.type === 'touchstart') {
        sliding = true
        try {
          unlock()
        } catch {
          /* */
        }
      }
      if (sliding) snapPressureFromX(t.clientX)
    }
    if (e.type === 'touchend' || e.type === 'touchcancel') sliding = false
  }
  hud.addEventListener('touchstart', onHudTouch, { passive: false })
  hud.addEventListener('touchmove', onHudTouch, { passive: false })
  hud.addEventListener('touchend', onHudTouch, { passive: false })
  hud.addEventListener('touchcancel', onHudTouch, { passive: false })

  function undoStroke() {
    strokes.pop()
    rebuildSegs()
  }

  function bindHudButton(el, action) {
    if (!el) return
    let last = 0
    const fire = (e) => {
      e.preventDefault?.()
      e.stopPropagation?.()
      const now = performance.now()
      if (now - last < 350) return
      last = now
      try {
        unlock()
      } catch {
        /* */
      }
      action()
    }
    el.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return
      if (e.button != null && e.button !== 0) return
      fire(e)
    })
    el.addEventListener('touchend', fire, { passive: false })
    el.addEventListener('click', fire)
    el.addEventListener('pointerdown', (e) => e.stopPropagation())
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true })
  }

  bindHudButton(hud.querySelector('.wf-undo'), undoStroke)
  bindHudButton(hud.querySelector('.wf-reset'), resetWorld)

  function onKey(e) {
    if (!live()) return
    if (document.activeElement === slider) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        setPressure(RATES[Math.min(2, rateIndex(pressure) + 1)])
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        setPressure(RATES[Math.max(0, rateIndex(pressure) - 1)])
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        setPressure('slow')
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        setPressure('fast')
        return
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCam(camY + 36)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCam(camY - 36)
    }
  }
  window.addEventListener('keydown', onKey)
  setPressure(pressure)
  const stopWatch = watchFrame(frame, layout)

  function emitMeasured() {
    const dt = (performance.now() - spawnT0) / 1000
    return dt > 0.25 ? spawned / dt : PRESS[pressure].rate
  }

  function stats() {
    let left = 0
    let right = 0
    let bowl = 0
    const cx = w * 0.5
    const xs = simulation.x
    const ys = simulation.y
    const n = simulation.count
    for (let i = 0; i < n; i++) {
      if (xs[i] < cx - 40) left += 1
      if (xs[i] > cx + 40) right += 1
      if (ys[i] > 240 && ys[i] < 430 && Math.abs(xs[i] - cx) < 90) bowl += 1
    }
    return {
      pressure,
      camY,
      maxCam: maxCam(),
      hudH: hudInset(),
      basinScreenY: worldH - camY,
      worldH,
      viewH: h,
      viewW: w,
      particles: n,
      strokes: strokes.length,
      boats: boats.map((b) => ({
        x: b.x,
        y: b._y,
        a: b.a,
        vx: b.vx,
        bob: b.bob,
        onScreen: (b._y || 0) - camY > -40 && (b._y || 0) - camY < h + 40,
      })),
      pool: Array.from(pool),
      poolLevel: poolBase,
      vol,
      fps: fpsEma,
      rms: readRms(),
      rmsPeak,
      splitLeft: left,
      splitRight: right,
      bowl,
      crossings: simulation.crossings || 0,
      emitRate: PRESS[pressure].rate,
      prevEmitRate: PREV_PRESS[pressure],
      emitMeasured: emitMeasured(),
      trigPerSec: trigPerSec(),
      drawing: !!(drawing && drawing.length),
      ctxState: getContext()?.state || null,
      solver: solverPath,
      backend: renderer.backend,
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop)
    const raw = Math.min(0.05, (now - last) / 1000)
    last = now
    fpsEma = fpsEma * 0.9 + (raw > 0 ? 1 / raw : 60) * 0.1
    if (live() || preview) {
      acc += raw
      let steps = 0
      while (acc >= DT && steps < 2) {
        try {
          emit(DT)
          simulation.step(DT)
          drainPool()
          stepPool(DT)
          stepBoats(DT)
        } catch (err) {
          console.error('waterfall step', err)
        }
        acc -= DT
        steps += 1
      }
      if (acc > DT * 4) acc = DT
      if (simulation.pullParticles && now - gpuPull > 80) {
        gpuPull = now
        simulation.pullParticles().catch(() => {})
      }
      if (simulation.hitEnergy > 260) sfxSplash(simulation.hitEnergy)
      tickAmbient()
      readRms()
      if (now - lastQuality > 4500) {
        lastQuality = now
        if (fpsEma < 22 && renderScale > 0.76) {
          renderScale = 0.75
          layout()
        } else if (fpsEma > 40 && renderScale < 1) {
          renderScale = 1
          layout()
        }
      }
    }
    if (!live() && !preview) {
      paintBg()
      paintOverlay()
      return
    }
    draw()
  }

  async function tryWebGPU() {
    if (preview || wantCanvasOnly()) return false
    if (!globalThis.isSecureContext || !navigator.gpu) return false
    const next = freshFluidCanvas()
    wrap.insertBefore(next, overlay)
    try {
      const gpu = await withTimeout(
        createWebGPUFluid(next, {
          width: w,
          height: worldH,
          maxParticles,
          boundaryPadding: diameter * 0.45,
          pointDiameter: diameter,
          smoothingRadius: 32,
        }),
        1600,
        'WebGPU',
      )
      if (!gpu) {
        next.remove()
        return false
      }
      gpu.setParticleDiameter?.(diameter)
      gpu.setView?.(w, h, dpr, camY)
      gpu.setFloor?.(worldH - poolBase)
      swapFluidCanvas(next)
      simulation = gpu
      renderer = gpu
      solverPath = 'webgpu'
      rebuildSegs()
      layout()
      return true
    } catch (err) {
      console.warn('WebGPU unavailable.', err)
      try {
        next.remove()
      } catch {
        /* */
      }
      return false
    }
  }

  function tryWebGL2() {
    if (preview || wantCanvasOnly()) return false
    if (renderer?.backend === 'WebGL2') return true
    const next = freshFluidCanvas()
    try {
      const candidate = createRenderer(next, maxParticles, { force2d: false })
      if (!candidate || candidate.backend !== 'WebGL2') {
        return false
      }
      swapFluidCanvas(next)
      renderer = candidate
      renderer.setParticleDiameter(diameter)
      solverPath = 'cpu+webgl2'
      layout()
      return true
    } catch (err) {
      console.warn('WebGL2 unavailable.', err)
      return false
    }
  }

  async function tryUpgrade() {
    if (preview || wantCanvasOnly()) return
    try {
      if (await tryWebGPU()) return
      tryWebGL2()
    } catch (err) {
      console.warn('waterfall renderer upgrade failed', err)
      fallbackToCanvas(err)
    }
  }

  function onPlay() {
    layout()
    setCam(camY)
    if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    setTimeout(() => {
      try {
        unlock()
        ensureFlow()
      } catch (err) {
        console.warn('waterfall audio', err)
      }
    }, 120)
  }

  layout()
  resetPool()
  resetBoats()
  tryUpgrade()
  if (preview) {
    seedDemo()
    for (let k = 0; k < 96; k++) {
      emit(DT)
      simulation.step(DT)
      drainPool()
      stepPool(DT)
      stepBoats(DT)
    }
    raf = requestAnimationFrame(loop)
  } else {
    paintBg()
    paintOverlay()
    window.addEventListener('playground-start', onPlay)
  }

  function hitLayers(x, y) {
    const stack = []
    const seen = new Set()
    let el = document.elementFromPoint(x, y)
    while (el && !seen.has(el)) {
      seen.add(el)
      stack.push({
        tag: el.tagName,
        id: el.id || '',
        className: String(el.className || '').slice(0, 120),
        pe: getComputedStyle(el).pointerEvents,
        z: getComputedStyle(el).zIndex,
      })
      el = el.parentElement
    }
    return stack
  }

  window.__waterfall = {
    stats,
    layers: hitLayers,
    rms: readRms,
    setPressure,
    reset: resetWorld,
    undo: () => {
      strokes.pop()
      rebuildSegs()
    },
    scrollTo: setCam,
    drawPolyline: (points) => addStroke(points),
    spawnAt: (x, y, n = 8) => {
      for (let i = 0; i < n; i++) {
        simulation.addParticle(x + (Math.random() - 0.5) * 10, y, (Math.random() - 0.5) * 20, 40)
      }
    },
    pourOnBoats: (n = 40) => {
      for (let i = 0; i < n; i++) {
        const b = boats[i % boats.length]
        simulation.addParticle(
          b.x + (Math.random() - 0.5) * 18,
          (b._y || poolY(b.x)) - 28,
          (Math.random() - 0.5) * 24,
          180,
        )
      }
    },
    addVolume: (n) => {
      for (let k = 0; k < n; k++) mergeAt(w * 0.5, 40)
    },
  }

  return () => {
    cancelAnimationFrame(raf)
    stopWatch()
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('playground-start', onPlay)
    wrap.removeEventListener('gesturestart', blockGesture)
    wrap.removeEventListener('gesturechange', blockGesture)
    wrap.removeEventListener('gestureend', blockGesture)
    try {
      flowSrc?.stop?.()
    } catch {
      /* */
    }
    if (window.__waterfall) delete window.__waterfall
  }
}
