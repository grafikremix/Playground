import { unlock, getContext, getMaster, silent, soundOn, canPlay } from '../lib/audio.js'
import { isLive } from '../lib/play.js'
import { fitCanvas, clearBacking, watchFrame } from '../lib/canvas.js'
import { render } from 'plinkfx/core'
import { splash, waterDrop, rainDrop, rainLoop, bubble, diveSplash, oceanWave } from 'plinkfx/sounds'

const ICE = '#b7ecff'
const ICE_SOFT = 'rgba(183,236,255,0.88)'
const BG = '#02050c'
const TAU = Math.PI * 2
const SCREENS = 4.2
const DT = 1 / 60
const SUBS = 1
const R = 4.6
const CELL = 10
const STROKE_R = 7
const POOL = 78
const SPRINGS = 40
const G = 1680
const STIFF = 0.52
const VISC = 0.14
const REST = 0.22
const PRESS = {
  slow: { rate: 70, speed: 90, spread: 8, ambient: 0.045 },
  medium: { rate: 150, speed: 150, spread: 12, ambient: 0.08 },
  fast: { rate: 240, speed: 230, spread: 18, ambient: 0.13 },
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function mobileMax() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const narrow = typeof window !== 'undefined' && window.innerWidth < 430
  return coarse || narrow ? 420 : 700
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy || 1
  let t = ((px - ax) * dx + (py - ay) * dy) / l2
  t = clamp(t, 0, 1)
  const x = ax + dx * t
  const y = ay + dy * t
  const nx = px - x
  const ny = py - y
  const d = Math.hypot(nx, ny)
  return { t, x, y, nx, ny, d, len: Math.sqrt(l2) }
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
  let pts = []
  for (const p of raw) {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2.2) pts.push({ x: p.x, y: p.y })
  }
  if (pts.length < 2) return pts
  pts = chaikin(chaikin(pts))
  return rdp(pts, 2.4)
}

export function mount(stage, { still, peek } = {}) {
  const preview = !!(still || peek)
  const wrap = document.createElement('div')
  wrap.className = 'wf-wrap'
  wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;overflow:hidden;'
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;-webkit-user-select:none;user-select:none;'
  const fluid = document.createElement('canvas')
  const fctx = fluid.getContext('2d', { alpha: true })
  const hud = document.createElement('div')
  hud.className = 'wf-hud'
  hud.innerHTML = `
    <div class="wf-gauge" role="radiogroup" aria-label="Pressure">
      <span class="wf-gauge-k">Pressure</span>
      <button type="button" data-rate="slow" aria-pressed="false">Slow</button>
      <button type="button" data-rate="medium" aria-pressed="true" class="is-on">Medium</button>
      <button type="button" data-rate="fast" aria-pressed="false">Fast</button>
    </div>
    <div class="wf-actions">
      <button type="button" class="wf-undo" aria-label="Undo">Undo</button>
      <button type="button" class="wf-reset" aria-label="Reset">Reset</button>
    </div>`
  if (preview) wrap.appendChild(canvas)
  else wrap.append(canvas, hud)
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  stage.replaceChildren(wrap)

  const frame = stage.closest('.stage-frame') || stage
  const MAX = mobileMax()
  const px = new Float32Array(MAX)
  const py = new Float32Array(MAX)
  const ox = new Float32Array(MAX)
  const oy = new Float32Array(MAX)
  const vx = new Float32Array(MAX)
  const vy = new Float32Array(MAX)
  const next = new Int32Array(MAX)
  const alive = new Uint8Array(MAX)
  const liveAt = new Int32Array(MAX)
  const loc = new Int32Array(MAX)
  const free = new Int32Array(MAX)
  let count = 0
  let freeN = 0
  for (let i = 0; i < MAX; i++) free[freeN++] = MAX - 1 - i
  let w = 390
  let h = 844
  let dpr = 1
  let worldH = h * SCREENS
  let camY = 0
  let cols = 1
  let rows = 1
  let head = new Int32Array(1)
  const pool = new Float32Array(SPRINGS)
  const poolV = new Float32Array(SPRINGS)
  const boats = []
  const strokes = []
  const pts = new Map()
  let drawing = null
  let lastCy = 0
  let pressure = preview ? 'medium' : 'medium'
  let raf = 0
  let last = performance.now()
  let acc = 0
  let emitAcc = 0
  let tickN = 0
  let fpsEma = 60
  let peakImpact = 0
  let analyser = null
  let bus = null
  let ambient = null
  let ambientGain = null
  const buffers = new Map()
  let sfxAt = 0
  let rmsPeak = 0
  const rmsBuf = new Uint8Array(128)

  function live() {
    return isLive()
  }

  function maxCam() {
    return Math.max(0, worldH - h)
  }

  function setCam(y) {
    camY = clamp(y, 0, maxCam())
  }

  function resetPool() {
    pool.fill(0)
    poolV.fill(0)
  }

  function resetBoats() {
    boats.length = 0
    const n = 3
    for (let i = 0; i < n; i++) {
      boats.push({
        x: w * (0.22 + i * 0.28),
        vx: 0,
        bob: 0,
        vb: 0,
        a: 0,
        va: 0,
      })
    }
  }

  function clearParticles() {
    alive.fill(0)
    count = 0
    freeN = 0
    for (let i = 0; i < MAX; i++) free[freeN++] = i
  }

  function spawn(x, y, sx, sy) {
    if (freeN <= 0) return -1
    const i = free[--freeN]
    alive[i] = 1
    loc[i] = count
    liveAt[count] = i
    px[i] = x
    py[i] = y
    ox[i] = x
    oy[i] = y
    vx[i] = sx
    vy[i] = sy
    count += 1
    return i
  }

  function kill(i) {
    if (!alive[i]) return
    alive[i] = 0
    const slot = loc[i]
    const lastI = liveAt[--count]
    liveAt[slot] = lastI
    loc[lastI] = slot
    free[freeN++] = i
  }

  function addStroke(points) {
    const pts2 = smoothStroke(points)
    if (pts2.length < 2) return null
    const segs = []
    for (let i = 0; i < pts2.length - 1; i++) {
      segs.push({ ax: pts2[i].x, ay: pts2[i].y, bx: pts2[i + 1].x, by: pts2[i + 1].y })
    }
    const stroke = { pts: pts2, segs }
    strokes.push(stroke)
    return stroke
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
    const a = POOL + pool[i]
    const b = POOL + pool[Math.min(SPRINGS - 1, i + 1)]
    return worldH - (a * (1 - f) + b * f)
  }

  function splashPool(x, amp) {
    const u = clamp(x / w, 0, 0.999) * (SPRINGS - 1)
    const i = u | 0
    poolV[i] += amp
    if (i > 0) poolV[i - 1] += amp * 0.45
    if (i < SPRINGS - 1) poolV[i + 1] += amp * 0.45
  }

  function collideSegs(i, hdt) {
    let hit = 0
    const rad = R + STROKE_R
    for (const s of strokes) {
      for (const g of s.segs) {
        const c = distSeg(px[i], py[i], g.ax, g.ay, g.bx, g.by)
        if (c.d >= rad || c.d < 1e-5) continue
        const nx = c.nx / c.d
        const ny = c.ny / c.d
        const pen = rad - c.d
        px[i] += nx * pen
        py[i] += ny * pen
        const vn = vx[i] * nx + vy[i] * ny
        if (vn < 0) {
          const flat = Math.abs(g.bx - g.ax) > Math.abs(g.by - g.ay) * 2.2
          const rest = flat ? 0.38 : 0.08
          vx[i] -= (1 + rest) * vn * nx
          vy[i] -= (1 + rest) * vn * ny
          const tx = (g.bx - g.ax) / (c.len || 1)
          const ty = (g.by - g.ay) / (c.len || 1)
          const mid = (g.ax + g.bx) * 0.5
          const out = px[i] >= mid ? 1 : -1
          if (flat) {
            vx[i] += tx * out * 18 + nx * 12
            vy[i] *= 0.72
          } else {
            const along = vx[i] * tx + vy[i] * ty
            vx[i] = tx * along * 0.98
            vy[i] = ty * along * 0.98
          }
          hit = Math.max(hit, -vn)
        }
      }
    }
    return hit
  }

  function rebuildHash() {
    const need = cols * rows
    if (head.length < need) head = new Int32Array(need)
    head.fill(-1, 0, need)
    for (let n = 0; n < count; n++) {
      const i = liveAt[n]
      const cx = clamp((px[i] / CELL) | 0, 0, cols - 1)
      const cy = clamp((py[i] / CELL) | 0, 0, rows - 1)
      const c = cy * cols + cx
      next[i] = head[c]
      head[c] = i
    }
  }

  function solveNeighbors() {
    if (count < 2) return
    const rest = R * 2 * 0.94
    for (let n = 0; n < count; n++) {
      const i = liveAt[n]
      const cx = clamp((px[i] / CELL) | 0, 0, cols - 1)
      const cy = clamp((py[i] / CELL) | 0, 0, rows - 1)
      for (let oy = -1; oy <= 1; oy++) {
        const ry = cy + oy
        if (ry < 0 || ry >= rows) continue
        for (let oxc = -1; oxc <= 1; oxc++) {
          const rx = cx + oxc
          if (rx < 0 || rx >= cols) continue
                    let j = head[ry * cols + rx]
          let hops = 0
          while (j >= 0 && hops++ < MAX) {
            if (j > i && alive[j]) {
              let dx = px[j] - px[i]
              let dy = py[j] - py[i]
              const d2 = dx * dx + dy * dy
              if (d2 > 0.0001 && d2 < rest * rest) {
                const d = Math.sqrt(d2)
                const pen = (rest - d) * STIFF * 0.5
                dx /= d
                dy /= d
                px[i] -= dx * pen
                py[i] -= dy * pen
                px[j] += dx * pen
                py[j] += dy * pen
                const avx = (vx[i] + vx[j]) * 0.5
                const avy = (vy[i] + vy[j]) * 0.5
                vx[i] += (avx - vx[i]) * VISC
                vy[i] += (avy - vy[i]) * VISC
                vx[j] += (avx - vx[j]) * VISC
                vy[j] += (avy - vy[j]) * VISC
              }
            }
            j = next[j]
          }
        }
      }
    }
  }

  function stepPool(hdt) {
    const k = 42
    const damp = 0.14
    const spread = 0.28
    for (let i = 0; i < SPRINGS; i++) {
      const left = pool[i > 0 ? i - 1 : i]
      const right = pool[i < SPRINGS - 1 ? i + 1 : i]
      const force = -k * pool[i] + (left + right - 2 * pool[i]) * spread * 60
      poolV[i] = (poolV[i] + force * hdt) * (1 - damp)
      pool[i] += poolV[i] * hdt
      pool[i] = clamp(pool[i], -28, 46)
    }
  }

  function stepBoats(hdt) {
    for (const b of boats) {
      const yL = poolY(b.x - 16)
      const yR = poolY(b.x + 16)
      const y = (yL + yR) * 0.5
      const slope = Math.atan2(yR - yL, 32)
      b.a += (slope * 0.7 - b.a) * 6 * hdt
      b.vx += slope * 26 * hdt
      b.vx *= 0.985
      b.x = clamp(b.x + b.vx * hdt, 22, w - 22)
      b.vb += (-b.bob * 18 - b.vb * 2.4) * hdt
      b.bob += b.vb * hdt
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
      spawn(w * 0.5 + jx, 22 + Math.random() * 6, jx * 2.2, p.speed * (0.85 + Math.random() * 0.2))
    }
  }

  function integrate(hdt) {
    peakImpact = 0
    emit(hdt)
    for (let n = 0; n < count; n++) {
      const i = liveAt[n]
      ox[i] = px[i]
      oy[i] = py[i]
      vy[i] += G * hdt
      vx[i] *= 0.999
      px[i] += vx[i] * hdt
      py[i] += vy[i] * hdt
      if (px[i] < R) {
        px[i] = R
        vx[i] = Math.abs(vx[i]) * REST
      } else if (px[i] > w - R) {
        px[i] = w - R
        vx[i] = -Math.abs(vx[i]) * REST
      }
      if (py[i] < 4) {
        py[i] = 4
        vy[i] = Math.abs(vy[i]) * 0.1
      }
      const hit = collideSegs(i, hdt)
      if (hit > peakImpact) peakImpact = hit
      const surface = poolY(px[i])
      if (py[i] > surface - R) {
        const speed = Math.hypot(vx[i], vy[i])
        splashPool(px[i], Math.min(18, 0.018 * speed + 0.8))
        for (const b of boats) {
          const d = Math.abs(b.x - px[i])
          if (d < 36) {
            b.vx += vx[i] * 0.012
            b.vb -= Math.min(22, speed * 0.03)
            b.a += (px[i] < b.x ? 0.01 : -0.01)
          }
        }
        if (speed > 90) sfxImpact(speed, px[i])
        else if (Math.random() < 0.08) sfxDrip()
        kill(i)
        continue
      }
      if (py[i] > worldH + 24 || px[i] < -40 || px[i] > w + 40) kill(i)
    }
    rebuildHash()
    if ((++tickN & 1) === 0) solveNeighbors()
    for (let n = 0; n < count; n++) {
      const i = liveAt[n]
      vx[i] = (px[i] - ox[i]) / hdt
      vy[i] = (py[i] - oy[i]) / hdt
    }
    stepPool(hdt)
    stepBoats(hdt)
    if (peakImpact > 140) sfxImpact(peakImpact)
  }

  function audioGraph() {
    const ac = getContext()
    const master = getMaster()
    if (!ac || !master || silent()) return null
    if (!bus || bus.context !== ac) {
      bus = ac.createGain()
      bus.gain.value = 1
      analyser = ac.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.45
      bus.connect(analyser)
      bus.connect(master)
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

  function playBuf(name, sound, amp, rate = 1) {
    if (!canPlay()) return
    const ac = audioGraph()
    if (!ac || !bus) return
    const buf = bufFor(name, sound)
    if (!buf) return
    try {
      const src = ac.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = rate
      const g = ac.createGain()
      g.gain.value = amp
      src.connect(g)
      g.connect(bus)
      src.start()
    } catch {
      /* audio optional */
    }
  }

  function ensureAmbient() {
    if (ambient || silent() || !canPlay()) return
    const ac = audioGraph()
    if (!ac || !bus) return
    const buf = bufFor('rainLoop', rainLoop)
    if (!buf) return
    try {
      const src = ac.createBufferSource()
      src.buffer = buf
      src.loop = true
      ambientGain = ac.createGain()
      ambientGain.gain.value = 0
      src.connect(ambientGain)
      ambientGain.connect(bus)
      src.start()
      ambient = src
    } catch {
      ambient = null
    }
  }

  function sfxImpact(energy, x = w * 0.5) {
    const now = performance.now()
    if (now - sfxAt < 70) return
    sfxAt = now
    unlock()
    ensureAmbient()
    const amp = clamp(0.18 + energy / 900, 0.18, 0.7)
    if (energy > 280) playBuf('dive', diveSplash, amp, 0.92 + Math.random() * 0.16)
    else playBuf('splash', splash, amp, 0.9 + Math.random() * 0.2)
    if (Math.random() < 0.35) playBuf('bubble', bubble, amp * 0.35, 1)
    void x
  }

  function sfxDrip() {
    const now = performance.now()
    if (now - sfxAt < 110) return
    sfxAt = now
    unlock()
    playBuf(Math.random() < 0.5 ? 'drop' : 'rain', Math.random() < 0.5 ? waterDrop : rainDrop, 0.22, 0.92 + Math.random() * 0.2)
  }

  function tickAmbient() {
    if (!soundOn() || silent()) {
      try {
        ambientGain?.gain.setTargetAtTime(0, getContext()?.currentTime || 0, 0.08)
      } catch {
        /* */
      }
      return
    }
    ensureAmbient()
    if (!ambientGain || !getContext()) return
    try {
      ambientGain.gain.setTargetAtTime(PRESS[pressure].ambient, getContext().currentTime, 0.12)
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

  function paintFluid() {
    if (count < 1) return
    const scale = 0.4
    const fw = Math.max(2, (w * scale) | 0)
    const fh = Math.max(2, (h * scale) | 0)
    if (fluid.width !== fw) fluid.width = fw
    if (fluid.height !== fh) fluid.height = fh
    fctx.setTransform(1, 0, 0, 1, 0, 0)
    fctx.clearRect(0, 0, fw, fh)
    fctx.fillStyle = ICE_SOFT
    const top = camY - 16
    const bot = camY + h + 16
    const rad = R * scale * 1.65
    let drawn = 0
    fctx.beginPath()
    for (let n = 0; n < count; n++) {
      const i = liveAt[n]
      if (py[i] < top || py[i] > bot) continue
      fctx.moveTo(px[i] * scale + rad, (py[i] - camY) * scale)
      fctx.arc(px[i] * scale, (py[i] - camY) * scale, rad, 0, TAU)
      drawn += 1
    }
    fctx.fill()
    if (!drawn) return
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(fluid, 0, 0, w, h)
  }

  function drawBoat(b) {
    const x = b.x
    const y = b._y - camY
    if (y < -30 || y > h + 30) return
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(b.a)
    ctx.strokeStyle = ICE
    ctx.fillStyle = 'rgba(183,236,255,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-16, 4)
    ctx.quadraticCurveTo(0, 12, 16, 4)
    ctx.lineTo(12, 0)
    ctx.lineTo(-12, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -22)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -22)
    ctx.lineTo(12, -6)
    ctx.lineTo(0, -4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  function draw() {
    clearBacking(canvas, ctx, dpr)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)
    ctx.save()
    ctx.translate(0, -camY)
    ctx.strokeStyle = 'rgba(183,236,255,0.08)'
    ctx.lineWidth = 1
    const g0 = ((camY / 96) | 0) * 96
    for (let y = g0; y <= camY + h + 96; y += 96) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(w * 0.5 - 10, 8)
    ctx.lineTo(w * 0.5 + 10, 8)
    ctx.lineTo(w * 0.5, 18)
    ctx.closePath()
    ctx.strokeStyle = ICE
    ctx.stroke()
    ctx.restore()

    paintFluid()

    ctx.save()
    ctx.translate(0, -camY)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = ICE
    ctx.shadowColor = 'rgba(183,236,255,0.35)'
    ctx.shadowBlur = 8
    ctx.lineWidth = STROKE_R * 1.15
    for (const s of strokes) {
      if (s.pts.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(s.pts[0].x, s.pts[0].y)
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y)
      ctx.stroke()
    }
    if (drawing && drawing.length > 1) {
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.moveTo(drawing[0].x, drawing[0].y)
      for (let i = 1; i < drawing.length; i++) ctx.lineTo(drawing[i].x, drawing[i].y)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.moveTo(0, worldH)
    for (let i = 0; i < SPRINGS; i++) {
      const x = (i / (SPRINGS - 1)) * w
      ctx.lineTo(x, worldH - (POOL + pool[i]))
    }
    ctx.lineTo(w, worldH)
    ctx.closePath()
    ctx.fillStyle = 'rgba(183,236,255,0.16)'
    ctx.fill()
    ctx.strokeStyle = ICE_SOFT
    ctx.lineWidth = 1.2
    ctx.stroke()
    for (const b of boats) drawBoat(b)
    ctx.restore()
  }

  function layout() {
    const nextFit = fitCanvas(canvas, ctx, frame)
    if (!nextFit.ok) return
    w = nextFit.w
    h = nextFit.h
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    dpr = Math.min(coarse ? 1 : 1.25, nextFit.dpr)
    const bw = Math.max(1, Math.round(w * dpr))
    const bh = Math.max(1, Math.round(h * dpr))
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    worldH = h * SCREENS
    cols = Math.max(1, Math.ceil(w / CELL) + 2)
    rows = Math.max(1, Math.ceil(worldH / CELL) + 2)
    setCam(camY)
    if (!boats.length) resetBoats()
    else {
      for (let i = 0; i < boats.length; i++) boats[i].x = clamp(boats[i].x, 22, w - 22)
    }
  }

  function resetWorld() {
    strokes.length = 0
    drawing = null
    clearParticles()
    resetPool()
    resetBoats()
    setCam(0)
    emitAcc = 0
    peakImpact = 0
    if (preview) seedDemo()
  }

  function undoStroke() {
    strokes.pop()
  }

  function worldFromEvent(e) {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top + camY, cy: e.clientY, cx: e.clientX }
  }

  function centroidCy() {
    let s = 0
    for (const p of pts.values()) s += p.cy
    return s / pts.size
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!live() && !preview) return
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      /* */
    }
    pts.set(e.pointerId, worldFromEvent(e))
    lastCy = centroidCy()
    unlock()
    if (pts.size >= 2) {
      drawing = null
      return
    }
    drawing = [worldFromEvent(e)]
  }

  function onMove(e) {
    if (!pts.has(e.pointerId)) return
    pts.set(e.pointerId, worldFromEvent(e))
    if (pts.size >= 2) {
      drawing = null
      const cy = centroidCy()
      setCam(camY + (cy - lastCy))
      lastCy = cy
      return
    }
    if (drawing) {
      const cur = pts.get(e.pointerId)
      const lastP = drawing[drawing.length - 1]
      if (Math.hypot(cur.x - lastP.x, cur.y - lastP.y) >= 1.6) drawing.push({ x: cur.x, y: cur.y })
    }
  }

  function onUp(e) {
    if (!pts.has(e.pointerId)) return
    pts.delete(e.pointerId)
    if (drawing && drawing.length >= 2 && pts.size === 0) addStroke(drawing)
    if (pts.size === 0) drawing = null
  }

  function setPressure(next) {
    if (!PRESS[next]) return
    pressure = next
    hud.querySelectorAll('[data-rate]').forEach((btn) => {
      const on = btn.getAttribute('data-rate') === pressure
      btn.classList.toggle('is-on', on)
      btn.setAttribute('aria-pressed', String(on))
    })
    tickAmbient()
  }

  hud.addEventListener('click', (e) => {
    const rate = e.target.closest('[data-rate]')?.getAttribute('data-rate')
    if (rate) {
      unlock()
      setPressure(rate)
      return
    }
    if (e.target.closest('.wf-reset')) {
      unlock()
      resetWorld()
      playBuf('ocean', oceanWave, 0.2)
      return
    }
    if (e.target.closest('.wf-undo')) {
      unlock()
      undoStroke()
    }
  })

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  const blockGesture = (e) => e.preventDefault()
  wrap.addEventListener('gesturestart', blockGesture)
  wrap.addEventListener('gesturechange', blockGesture)
  wrap.addEventListener('gestureend', blockGesture)
  wrap.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault()
    },
    { passive: false },
  )

  function onKey(e) {
    if (!live()) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCam(camY + 36)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCam(camY - 36)
    }
  }
  window.addEventListener('keydown', onKey)

  const stopWatch = watchFrame(frame, layout)

  function stats() {
    let left = 0
    let right = 0
    let bowl = 0
    const cx = w * 0.5
    for (let n = 0; n < count; n++) {
      const i = liveAt[n]
      if (px[i] < cx - 40) left += 1
      if (px[i] > cx + 40) right += 1
      if (py[i] > 300 && py[i] < 420 && Math.abs(px[i] - cx) < 70) bowl += 1
    }
    return {
      pressure,
      camY,
      maxCam: maxCam(),
      worldH,
      viewH: h,
      viewW: w,
      particles: count,
      strokes: strokes.length,
      boats: boats.map((b) => ({ x: b.x, y: b._y, a: b.a, vx: b.vx, bob: b.bob })),
      pool: Array.from(pool),
      fps: fpsEma,
      rms: readRms(),
      rmsPeak,
      splitLeft: left,
      splitRight: right,
      bowl,
      drawing: !!(drawing && drawing.length),
      ctxState: getContext()?.state || null,
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop)
    const raw = Math.min(0.05, (now - last) / 1000)
    last = now
    fpsEma = fpsEma * 0.9 + (raw > 0 ? 1 / raw : 60) * 0.1
    if (live() || preview) {
      acc += raw
      const hdt = DT / SUBS
      let steps = 0
      const budget = now + 10
      while (acc >= DT && steps < 2 && performance.now() < budget) {
        for (let s = 0; s < SUBS; s++) integrate(hdt)
        acc -= DT
        steps += 1
      }
      if (acc > DT * 4) acc = DT
      tickAmbient()
      readRms()
    }
    draw()
  }

  function onStart() {
    unlock()
    ensureAmbient()
  }

  function onPlay() {
    onStart()
    if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
  }

  layout()
  resetPool()
  resetBoats()
  if (preview) {
    seedDemo()
    for (let k = 0; k < 40; k++) integrate(DT)
    raf = requestAnimationFrame(loop)
  } else {
    draw()
    window.addEventListener('playground-start', onPlay)
  }

  window.__waterfall = {
    stats,
    rms: readRms,
    setPressure,
    reset: resetWorld,
    undo: undoStroke,
    scrollTo: setCam,
    drawPolyline: (points) => addStroke(points),
    spawnAt: (x, y, n = 8) => {
      for (let i = 0; i < n; i++) spawn(x + (Math.random() - 0.5) * 10, y, (Math.random() - 0.5) * 20, 40)
    },
    pourOnBoats: (n = 40) => {
      for (let i = 0; i < n; i++) {
        const b = boats[i % boats.length]
        spawn(b.x + (Math.random() - 0.5) * 18, (b._y || poolY(b.x)) - 24, (Math.random() - 0.5) * 30, 220)
      }
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
      ambient?.stop?.()
    } catch {
      /* */
    }
    if (window.__waterfall) delete window.__waterfall
  }
}
