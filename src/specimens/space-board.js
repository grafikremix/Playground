import { taptic } from '../lib/haptics.js'
import { unlock, tone, noise, canPlay, getMaster } from '../lib/audio.js'
import { isLive } from '../lib/play.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const BEST_KEY = 'playground-space-board-best'
const MOVE = 12
const BG = '#02050c'
const BG_2 = '#071018'
const ICE = '#b7ecff'
const NEON_G = '#7dff6a'
const NEON_M = '#ff4fd8'

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function readBest() {
  try {
    const n = Number(localStorage.getItem(BEST_KEY))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeBest(n) {
  try {
    localStorage.setItem(BEST_KEY, String(n))
  } catch {
    /* private mode */
  }
}

function sfxThwap() {
  noise({ duration: 0.07, peak: 0.09, freq: 1400, q: 0.7, type: 'bandpass', slide: 420 })
  tone({ type: 'triangle', freq: 210, duration: 0.11, peak: 0.08, slide: 90 })
  tone({ type: 'sine', freq: 640, duration: 0.05, peak: 0.04, slide: 280 })
}

function sfxWood() {
  noise({ duration: 0.09, peak: 0.07, freq: 220, q: 0.8, type: 'lowpass' })
  tone({ type: 'square', freq: 168, duration: 0.08, peak: 0.05, slide: 92 })
}

function sfxDeath() {
  noise({ duration: 0.38, peak: 0.08, freq: 380, q: 0.6, type: 'lowpass', slide: 70 })
  tone({ type: 'sawtooth', freq: 220, duration: 0.28, peak: 0.07, slide: 70 })
  tone({ type: 'sine', freq: 196, duration: 0.22, peak: 0.05, slide: 140 })
  tone({ type: 'sine', freq: 147, duration: 0.34, peak: 0.06, slide: 98 })
}

function sfxBest() {
  tone({ type: 'sine', freq: 523, duration: 0.14, peak: 0.08 })
  tone({ type: 'sine', freq: 784, duration: 0.22, peak: 0.07 })
  tone({ type: 'triangle', freq: 1046, duration: 0.16, peak: 0.04 })
}

function sfxSwipe() {
  noise({ duration: 0.08, peak: 0.05, freq: 520, q: 0.7, type: 'bandpass', slide: 240 })
  tone({ type: 'sine', freq: 280, duration: 0.09, peak: 0.04, slide: 160 })
}

function sfxStar() {
  tone({ type: 'sine', freq: 660, duration: 0.12, peak: 0.08 })
  tone({ type: 'triangle', freq: 880, duration: 0.16, peak: 0.07 })
  tone({ type: 'sine', freq: 1320, duration: 0.2, peak: 0.05 })
}

function sfxPowerEnd() {
  tone({ type: 'triangle', freq: 520, duration: 0.14, peak: 0.06, slide: 220 })
  tone({ type: 'sine', freq: 330, duration: 0.18, peak: 0.05, slide: 140 })
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  canvas.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none;'
  stage.replaceChildren(canvas)

  const frame = stage.closest('.stage-frame') || stage
  let w = 1
  let h = 1
  let dpr = 1
  let u = 10

  const alien = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, maxY: 0 }
  const blocks = []
  const stars = []
  const specks = []
  const puffs = []
  const trails = []
  let cam = 0
  let nextRow = 0
  let gapCenter = 0
  let lastWanted = 1
  let power = 0
  let hum = null
  let phase = 'ready'
  let score = 0
  let best = readBest()
  let chimed = false
  let peekBoost = 0
  let raf = 0
  let last = performance.now()
  let t = 0
  let pid = null
  let sx = 0
  let sy = 0
  let lx = 0
  let ly = 0
  let moved = false
  let swiped = false
  let hitCool = 0

  function startEl() {
    return document.querySelector('.start')
  }

  function promptOpen() {
    return document.body.classList.contains('is-prompt')
  }

  function layout() {
    const box = frame.getBoundingClientRect()
    w = Math.max(1, box.width)
    h = Math.max(1, box.height)
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    u = Math.max(7, Math.min(w, h) / 28)
    if (!specks.length) seedSpecks()
  }

  function seedSpecks() {
    specks.length = 0
    const n = reduced ? 28 : 54
    for (let i = 0; i < n; i++) {
      specks.push({
        x: Math.random(),
        y: Math.random(),
        s: Math.random() < 0.22 ? 2.2 : 1.2,
        d: 0.18 + Math.random() * 0.7,
        tw: Math.random() * Math.PI * 2,
      })
    }
  }

  function shipW() {
    return u * 4.3
  }

  function gapMin() {
    return shipW() * 1.6
  }

  function blocksWanted() {
    return 1 + Math.floor(score / 300)
  }

  function bandSpacing() {
    return Math.max(u * 5.4, (h * 0.78) / blocksWanted())
  }

  function stopHum() {
    if (!hum) return
    try {
      hum.o.stop()
      hum.o2.stop()
    } catch {
      /* already stopped */
    }
    try {
      hum.o.disconnect()
      hum.o2.disconnect()
      hum.g.disconnect()
    } catch {
      /* already disconnected */
    }
    hum = null
  }

  function startHum() {
    if (hum || peek || still || !canPlay()) return
    const a = unlock()
    const master = getMaster()
    if (!a || !master) return
    const o = a.createOscillator()
    o.type = 'sine'
    o.frequency.value = 196
    const o2 = a.createOscillator()
    o2.type = 'triangle'
    o2.frequency.value = 392
    const g = a.createGain()
    g.gain.value = 0.035
    o.connect(g)
    o2.connect(g)
    g.connect(master)
    o.start()
    o2.start()
    hum = { o, o2, g }
  }

  function syncHum() {
    if (power > 0 && !peek && !still && canPlay()) startHum()
    else stopHum()
  }

  function resetWorld() {
    blocks.length = 0
    stars.length = 0
    puffs.length = 0
    trails.length = 0
    alien.x = w * 0.5
    alien.y = h * 0.22
    alien.vx = 0
    alien.vy = 180
    alien.tilt = 0
    alien.maxY = alien.y
    cam = 0
    score = 0
    chimed = false
    hitCool = 0
    power = 0
    lastWanted = 1
    gapCenter = w * (Math.random() < 0.5 ? 0.22 : 0.78)
    nextRow = h * 0.5
    stopHum()
    fillRows()
  }

  function fillRows() {
    const wanted = blocksWanted()
    if (wanted > lastWanted) {
      const spacing = bandSpacing()
      const inject = Math.max(alien.y + u * 5, cam + h * 0.55)
      if (nextRow > inject + spacing) nextRow = inject + spacing * 0.35
      lastWanted = wanted
    }
    const top = cam + h + u * 8
    while (nextRow < top) {
      const inView = blocks.filter((b) => b.y + b.h > cam && b.y < cam + h).length
      if (nextRow < cam + h - u && inView >= wanted) {
        nextRow = Math.max(nextRow, cam + h + u * 0.35)
        continue
      }
      spawnBand(nextRow)
      nextRow += bandSpacing() * (0.88 + Math.random() * 0.24)
    }
    while (blocks.length && blocks[0].y + blocks[0].h < cam - u * 4) blocks.shift()
    while (stars.length && stars[0].y < cam - u * 4) stars.shift()
  }

  function spawnBand(y) {
    const pad = u * 0.75
    const minGap = Math.min(gapMin(), w - pad * 2 - u * 3)
    const bh = u * (1.35 + Math.random() * 0.7)
    const maxBw = Math.max(u * 3, w - pad * 2 - minGap)
    const bw = clamp(u * (3.4 + Math.random() * 3.6), u * 3, maxBw)
    const flip = Math.random() < 0.58 ? 1 : -1
    gapCenter += flip * (minGap * 0.35 + Math.random() * w * 0.18)
    gapCenter = clamp(gapCenter, pad + minGap * 0.5, w - pad - minGap * 0.5)
    const gL = gapCenter - minGap * 0.5
    const gR = gapCenter + minGap * 0.5
    const mid = w * 0.5
    const leftMax = gL - bw
    const rightMin = gR
    const canLeft = leftMax >= pad
    const canRight = rightMin + bw <= w - pad
    const leftCoversMid = canLeft && pad <= mid && leftMax + bw >= mid
    const rightCoversMid = canRight && rightMin <= mid && w - pad >= mid
    let x
    if (leftCoversMid && (!rightCoversMid || Math.random() < 0.5)) {
      x = clamp(mid - bw * 0.5, pad, leftMax)
    } else if (rightCoversMid) {
      x = clamp(mid - bw * 0.5, rightMin, w - pad - bw)
    } else if (canLeft && (!canRight || Math.abs(gL - mid) <= Math.abs(gR - mid))) {
      x = pad + Math.random() * Math.max(0, leftMax - pad)
    } else if (canRight) {
      x = rightMin + Math.random() * Math.max(0, w - pad - bw - rightMin)
    } else {
      x = pad
    }
    blocks.push(makeBlock(x, y, bw, bh))
    if (stars.length === 0 || Math.random() < 0.28) {
      stars.push({
        x: clamp(gapCenter + (Math.random() - 0.5) * minGap * 0.4, pad + u, w - pad - u),
        y: y + bh + u * (1.1 + Math.random() * 1.8),
        r: Math.max(11, u * 0.78),
        spin: Math.random() * Math.PI * 2,
        taken: false,
      })
    }
  }

  function makeBlock(x, y, bw, bh) {
    return {
      x,
      y,
      w: bw,
      h: bh,
      grain: 0.35 + Math.random() * 0.5,
      hue: Math.random() < 0.45 ? 318 : 28,
      thunked: false,
    }
  }

  function worldToScreen(y) {
    return h - (y - cam)
  }

  function alienBox() {
    const r = u * 1.15
    return { x: alien.x - r * 0.9, y: alien.y - r * 0.4, w: r * 1.8, h: r * 2.4 }
  }

  function overlapping(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  function splat(x, y) {
    const n = reduced ? 7 : 14
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = u * (0.8 + Math.random() * 2.4)
      puffs.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7 + u * 0.4,
        r: u * (0.12 + Math.random() * 0.22),
        life: 0.28 + Math.random() * 0.22,
        age: 0,
        hue: Math.random() < 0.5 ? 168 + Math.random() * 24 : 300 + Math.random() * 36,
      })
    }
  }

  function boost() {
    if (phase !== 'play') return
    alien.vy = Math.max(alien.vy, 0) + u * (reduced ? 38 : 52)
    splat(alien.x, alien.y - u * 0.2)
    if (!peek && !still) {
      taptic(10)
      sfxThwap()
    }
  }

  function begin() {
    unlock()
    resetWorld()
    phase = 'play'
    const btn = startEl()
    if (btn) btn.hidden = true
  }

  function die() {
    if (phase !== 'play') return
    phase = 'dead'
    power = 0
    stopHum()
    if (!peek && !still) {
      taptic(20)
      sfxDeath()
    }
    const btn = startEl()
    if (btn) {
      btn.hidden = false
      btn.textContent = 'Start'
    }
  }

  function collideBlocks(dt) {
    if (power > 0) return
    const box = alienBox()
    hitCool = Math.max(0, hitCool - dt)
    for (const b of blocks) {
      if (!overlapping(box, b)) {
        b.thunked = false
        continue
      }
      const cx = box.x + box.w * 0.5
      const cy = box.y + box.h * 0.5
      const bx = b.x + b.w * 0.5
      const by = b.y + b.h * 0.5
      const dx = cx - bx
      const dy = cy - by
      const ox = box.w * 0.5 + b.w * 0.5 - Math.abs(dx)
      const oy = box.h * 0.5 + b.h * 0.5 - Math.abs(dy)
      if (ox < oy) {
        const dir = dx < 0 ? -1 : 1
        alien.x += dir * ox
        alien.vx = dir * u * 18
        alien.vy *= 0.35
      } else {
        const dir = dy < 0 ? -1 : 1
        alien.y += dir * oy
        alien.vy = dir * u * 10
        alien.vx *= 0.7
      }
      if (!b.thunked && hitCool <= 0) {
        b.thunked = true
        hitCool = 0.16
        if (!peek && !still) {
          taptic(14)
          sfxWood()
        }
      }
    }
  }

  function stepAlien(dt) {
    alien.vy -= u * 58 * dt
    alien.vy = clamp(alien.vy, -u * 42, u * 64)
    alien.vx *= Math.pow(0.08, dt)
    alien.x += alien.vx * dt
    alien.y += alien.vy * dt
    const pad = u * 1.4
    if (alien.x < pad) {
      alien.x = pad
      alien.vx = Math.abs(alien.vx) * 0.4
    }
    if (alien.x > w - pad) {
      alien.x = w - pad
      alien.vx = -Math.abs(alien.vx) * 0.4
    }
    alien.tilt += (clamp(alien.vx / (u * 22), -0.45, 0.45) - alien.tilt) * Math.min(1, dt * 10)
    if (alien.y > alien.maxY) alien.maxY = alien.y
    collideStars()
    collideBlocks(dt)
    const follow = cam + h * 0.38
    if (alien.y > follow) cam += alien.y - follow
    score = Math.max(0, Math.floor(alien.maxY / (u * 0.9)))
    if (score > best) {
      best = score
      writeBest(best)
      if (!chimed && !peek && !still) {
        chimed = true
        sfxBest()
      }
    }
    if (power > 0) {
      power = Math.max(0, power - dt)
      if (Math.random() < 0.65) {
        trails.push({
          x: alien.x + (Math.random() - 0.5) * u * 0.8,
          y: alien.y - u * 0.2,
          r: u * (0.1 + Math.random() * 0.16),
          age: 0,
          life: 0.28 + Math.random() * 0.18,
        })
      }
      if (power <= 0) {
        power = 0
        stopHum()
        if (!peek && !still) sfxPowerEnd()
      }
    }
    syncHum()
    if (alien.y < cam - u * 1.2) {
      if (peek) {
        resetWorld()
        phase = 'play'
        alien.vy = u * 24
      } else die()
    }
  }

  function collideStars() {
    const box = alienBox()
    const pad = Math.max(22, u * 0.9)
    for (const s of stars) {
      if (s.taken) continue
      const hit = {
        x: s.x - s.r - pad * 0.15,
        y: s.y - s.r - pad * 0.15,
        w: s.r * 2 + pad * 0.3,
        h: s.r * 2 + pad * 0.3,
      }
      if (!overlapping(box, hit)) continue
      s.taken = true
      power = 3
      if (!peek && !still) {
        taptic(16)
        sfxStar()
      }
      syncHum()
    }
  }

  function stepPuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy -= u * 18 * dt
      p.vx *= 0.96
      if (p.age >= p.life) puffs.splice(i, 1)
    }
    for (let i = trails.length - 1; i >= 0; i--) {
      const p = trails[i]
      p.age += dt
      p.y -= u * 6 * dt
      if (p.age >= p.life) trails.splice(i, 1)
    }
    for (const s of stars) s.spin += dt * 2.4
    for (let i = stars.length - 1; i >= 0; i--) {
      if (stars[i].taken || stars[i].y < cam - u * 4) stars.splice(i, 1)
    }
  }

  function autoPeek(dt) {
    peekBoost -= dt
    if (alien.vy < u * 8 && peekBoost <= 0) {
      boost()
      peekBoost = 0.42 + Math.random() * 0.28
    }
    if (Math.random() < 0.018) alien.vx += (Math.random() - 0.5) * u * 20
  }

  function onDown(e) {
    if (e.button || peek || still || !isLive() || promptOpen()) return
    unlock()
    if (phase !== 'play') return
    canvas.setPointerCapture?.(e.pointerId)
    pid = e.pointerId
    sx = e.clientX
    sy = e.clientY
    lx = e.clientX
    ly = e.clientY
    moved = false
    swiped = false
  }

  function onMove(e) {
    if (e.pointerId !== pid || phase !== 'play') return
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    if (!moved && Math.hypot(dx, dy) > MOVE) moved = true
    if (moved) {
      const mx = e.clientX - lx
      alien.x = clamp(alien.x + mx, u * 1.4, w - u * 1.4)
      alien.vx += mx * 18
      if (!swiped && Math.abs(dx) > MOVE) {
        swiped = true
        if (!peek && !still) {
          taptic(8)
          sfxSwipe()
        }
      }
    }
    lx = e.clientX
    ly = e.clientY
  }

  function onUp(e) {
    if (e.pointerId !== pid) return
    pid = null
    if (phase !== 'play' || promptOpen()) return
    if (!moved) boost()
  }

  if (!peek) {
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  function roundRect(x, y, bw, bh, r) {
    const rr = Math.min(r, bw * 0.5, bh * 0.5)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + bw, y, x + bw, y + bh, rr)
    ctx.arcTo(x + bw, y + bh, x, y + bh, rr)
    ctx.arcTo(x, y + bh, x, y, rr)
    ctx.arcTo(x, y, x + bw, y, rr)
    ctx.closePath()
  }

  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#041018')
    g.addColorStop(0.45, BG)
    g.addColorStop(1, BG_2)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    const gap = u * 2.35
    const off = ((cam * 0.42) % gap + gap) % gap
    ctx.save()
    ctx.strokeStyle = 'rgba(183,236,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= w + 1; x += gap) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let y = -off; y <= h + gap; y += gap) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
    const horizon = h * 0.22
    ctx.strokeStyle = 'rgba(183,236,255,0.16)'
    ctx.beginPath()
    ctx.moveTo(0, horizon)
    ctx.lineTo(w, horizon)
    ctx.stroke()
    ctx.restore()
    for (const s of specks) {
      const y = ((s.y * h * 3 - cam * (0.18 + s.d * 0.35)) % (h + 8)) + 4
      const x = (s.x * w + cam * s.d * 0.02) % w
      ctx.globalAlpha = 0.18 + 0.45 * s.d
      ctx.fillStyle = ICE
      ctx.fillRect(x, y, s.s, s.s)
    }
    ctx.globalAlpha = 1
  }

  function drawBlock(b) {
    const y = worldToScreen(b.y) - b.h
    const neon = b.hue > 200 ? NEON_M : '#ff9a3a'
    const fill = b.hue > 200 ? 'rgba(48, 8, 36, 0.82)' : 'rgba(42, 18, 4, 0.82)'
    ctx.save()
    roundRect(b.x + u * 0.1, y + u * 0.14, b.w, b.h, u * 0.12)
    ctx.fillStyle = 'rgba(0, 8, 16, 0.45)'
    ctx.fill()
    roundRect(b.x, y, b.w, b.h, u * 0.12)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.shadowColor = neon
    ctx.shadowBlur = u * 0.55
    ctx.strokeStyle = neon
    ctx.lineWidth = Math.max(1.4, u * 0.1)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.beginPath()
    for (let i = 1; i < 5; i++) {
      const yy = y + (b.h * i) / 5
      ctx.moveTo(b.x + u * 0.18, yy)
      ctx.quadraticCurveTo(b.x + b.w * 0.5, yy + (i % 2 ? 1.5 : -1.5), b.x + b.w - u * 0.18, yy)
    }
    ctx.strokeStyle = neon
    ctx.globalAlpha = 0.28
    ctx.lineWidth = Math.max(1, u * 0.04)
    ctx.stroke()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = neon
    ctx.fillRect(b.x + u * 0.12, y + u * 0.1, b.w * 0.38, Math.max(1, u * 0.08))
    ctx.globalAlpha = 1
    ctx.restore()
  }

  function powered() {
    return power > 0
  }

  function powerFlicker() {
    return power > 0 && power < 0.75 && Math.sin(t * 32) > 0.15
  }

  function drawStar(s) {
    if (s.taken) return
    const y = worldToScreen(s.y)
    const r = s.r
    ctx.save()
    ctx.translate(s.x, y)
    ctx.rotate(s.spin)
    ctx.shadowColor = '#ffe56a'
    ctx.shadowBlur = u * 0.9
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2
      const rad = i % 2 === 0 ? r : r * 0.42
      const px = Math.cos(a) * rad
      const py = Math.sin(a) * rad
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = '#fff6b8'
    ctx.fill()
    ctx.strokeStyle = '#ffd24a'
    ctx.lineWidth = Math.max(1, u * 0.06)
    ctx.stroke()
    ctx.restore()
  }

  function drawTrails() {
    for (const p of trails) {
      const k = 1 - p.age / p.life
      ctx.save()
      ctx.globalAlpha = 0.25 + 0.7 * k
      ctx.shadowColor = '#ffe56a'
      ctx.shadowBlur = u * 0.5
      ctx.fillStyle = '#fff4c2'
      ctx.beginPath()
      ctx.arc(p.x, worldToScreen(p.y), p.r * (0.6 + k), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  function drawAlien() {
    const syA = worldToScreen(alien.y)
    const bob = reduced || still || !isLive() ? 0 : Math.sin(t * 6.2) * u * 0.08
    const x = alien.x
    const y = syA + bob
    const hot = powered() && !powerFlicker()
    const bodyHi = hot ? '#fff8e0' : '#e8ffb0'
    const bodyMid = hot ? '#ffe56a' : NEON_G
    const bodyLo = hot ? '#c48410' : '#146628'
    const rim = hot ? '#fff4c2' : NEON_G
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(alien.tilt)
    ctx.globalAlpha = powerFlicker() ? 0.42 : 1

    ctx.fillStyle = hot ? 'rgba(255, 229, 106, 0.22)' : 'rgba(183,236,255,0.12)'
    ctx.beginPath()
    ctx.ellipse(0, u * 1.15, u * 1.55, u * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()

    const bw = u * 2.15
    const bh = u * 0.42
    ctx.translate(0, u * 0.72)
    ctx.fillStyle = '#1a1e24'
    ctx.beginPath()
    ctx.ellipse(0, u * 0.12, bw * 0.92, bh * 0.7, 0, 0, Math.PI * 2)
    ctx.fill()
    const board = ctx.createLinearGradient(-bw, 0, bw, bh)
    board.addColorStop(0, '#c5d0d8')
    board.addColorStop(0.32, '#7a848e')
    board.addColorStop(0.68, '#3e464e')
    board.addColorStop(1, '#1c2228')
    ctx.fillStyle = board
    ctx.beginPath()
    ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = hot ? '#ffe56a' : ICE
    ctx.shadowBlur = u * (hot ? 1.1 : 0.7)
    ctx.strokeStyle = hot ? '#fff4c2' : ICE
    ctx.lineWidth = Math.max(1.3, u * 0.09)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(183,236,255,0.28)'
    ctx.beginPath()
    ctx.ellipse(-u * 0.45, -u * 0.08, bw * 0.38, bh * 0.28, -0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a323a'
    ctx.beginPath()
    ctx.moveTo(-bw * 0.72, 0)
    ctx.lineTo(-bw * 0.98, u * 0.22)
    ctx.lineTo(-bw * 0.55, u * 0.08)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(bw * 0.72, 0)
    ctx.lineTo(bw * 0.98, u * 0.22)
    ctx.lineTo(bw * 0.55, u * 0.08)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = ICE
    ctx.globalAlpha = 0.55
    ctx.lineWidth = Math.max(1, u * 0.05)
    ctx.beginPath()
    ctx.moveTo(-bw * 0.72, 0)
    ctx.lineTo(-bw * 0.98, u * 0.22)
    ctx.moveTo(bw * 0.72, 0)
    ctx.lineTo(bw * 0.98, u * 0.22)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.translate(0, -u * 0.72)

    const body = ctx.createRadialGradient(-u * 0.2, -u * 0.55, u * 0.1, 0, -u * 0.1, u * 1.2)
    body.addColorStop(0, bodyHi)
    body.addColorStop(0.4, bodyMid)
    body.addColorStop(1, bodyLo)
    ctx.shadowColor = rim
    ctx.shadowBlur = u * (hot ? 1.45 : 0.85)
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(0, -u * 0.15, u * 0.82, u * 1.05, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = rim
    ctx.lineWidth = Math.max(1.2, u * 0.07)
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.strokeStyle = rim
    ctx.lineWidth = Math.max(1.5, u * 0.1)
    ctx.beginPath()
    ctx.moveTo(-u * 0.12, -u * 1.12)
    ctx.quadraticCurveTo(-u * 0.4, -u * 1.55, -u * 0.22, -u * 1.72)
    ctx.stroke()
    ctx.fillStyle = hot ? '#fff8e0' : '#d8ff9a'
    ctx.beginPath()
    ctx.arc(-u * 0.2, -u * 1.76, u * 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = rim
    ctx.lineWidth = Math.max(1, u * 0.05)
    ctx.stroke()

    ctx.fillStyle = '#04140a'
    ctx.beginPath()
    ctx.ellipse(-u * 0.28, -u * 0.42, u * 0.18, u * 0.24, -0.1, 0, Math.PI * 2)
    ctx.ellipse(u * 0.28, -u * 0.42, u * 0.18, u * 0.24, 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = hot ? '#fff8e0' : ICE
    ctx.beginPath()
    ctx.arc(-u * 0.22, -u * 0.5, u * 0.07, 0, Math.PI * 2)
    ctx.arc(u * 0.34, -u * 0.5, u * 0.07, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rim
    ctx.beginPath()
    ctx.ellipse(0, -u * 0.02, u * 0.16, u * 0.1, 0, 0, Math.PI)
    ctx.fill()

    ctx.strokeStyle = rim
    ctx.lineWidth = Math.max(1.4, u * 0.09)
    ctx.beginPath()
    ctx.moveTo(-u * 0.7, u * 0.15)
    ctx.lineTo(-u * 1.05, u * 0.55)
    ctx.moveTo(u * 0.7, u * 0.15)
    ctx.lineTo(u * 1.05, u * 0.55)
    ctx.stroke()
    ctx.restore()
  }

  function drawPuffs() {
    for (const p of puffs) {
      const k = 1 - p.age / p.life
      const y = worldToScreen(p.y)
      const col = `hsl(${p.hue}, 100%, 68%)`
      ctx.save()
      ctx.globalAlpha = 0.35 + 0.65 * k
      ctx.shadowColor = col
      ctx.shadowBlur = u * 0.7
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(p.x, y, p.r * (0.6 + k), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  function strokeLabel(text, x, y, align) {
    ctx.font = `${Math.max(12, u * 0.95)}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = Math.max(3, u * 0.22)
    ctx.shadowColor = ICE
    ctx.shadowBlur = u * 0.45
    ctx.strokeStyle = '#041018'
    ctx.fillStyle = '#ffffff'
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
    ctx.shadowBlur = 0
  }

  function drawScores() {
    const y = Math.max(72, u * 2.6)
    const pad = Math.max(14, u * 0.9)
    strokeLabel(`SCORE ${score}`, pad, y, 'left')
    strokeLabel(`BEST ${best}`, w - pad, y, 'right')
  }

  function poseStill() {
    resetWorld()
    phase = 'play'
    alien.y = h * 0.55
    alien.x = w * 0.46
    alien.vy = 40
    alien.maxY = u * 240
    cam = alien.y - h * 0.4
    score = 620
    best = Math.max(best, 720)
    nextRow = alien.y + u * 18
    lastWanted = blocksWanted()
    blocks.length = 0
    stars.length = 0
    blocks.push(makeBlock(w * 0.5 - u * 2.6, alien.y + u * 5.2, u * 5.2, u * 1.5))
    blocks.push(makeBlock(u * 0.7, alien.y + u * 11.2, u * 4.6, u * 1.45))
    blocks.push(makeBlock(w - u * 6.2, alien.y - u * 5.6, u * 5.1, u * 1.5))
    blocks[0].hue = 318
    blocks[1].hue = 28
    blocks[2].hue = 318
    stars.push({
      x: alien.x + u * 3.2,
      y: alien.y + u * 1.6,
      r: Math.max(11, u * 0.82),
      spin: 0.4,
      taken: false,
    })
    splat(alien.x + u * 0.8, alien.y + u * 0.2)
    for (const p of puffs) p.age = p.life * 0.35
  }

  function draw() {
    drawBg()
    for (const b of blocks) drawBlock(b)
    for (const s of stars) drawStar(s)
    drawPuffs()
    drawTrails()
    drawAlien()
    drawScores()
    canvas.dataset.score = String(score)
    canvas.dataset.power = String(power)
    canvas.dataset.blocks = String(blocks.filter((b) => b.y + b.h > cam && b.y < cam + h).length)
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    if ((!isLive() || promptOpen()) && !peek && !still) {
      draw()
      raf = requestAnimationFrame(tick)
      return
    }
    if (!still && isLive()) {
      t += dt
      if (phase === 'play' || peek) {
        if (peek && !reduced) autoPeek(dt)
        stepAlien(dt)
        stepPuffs(dt)
        fillRows()
      }
    }
    draw()
    raf = requestAnimationFrame(tick)
  }

  if (!peek && !still) window.addEventListener('playground-start', begin)

  const ro = new ResizeObserver(() => {
    const was = w
    layout()
    if (still) poseStill()
    else if (phase !== 'play' && Math.abs(was - w) > 1) resetWorld()
  })
  ro.observe(frame)
  layout()
  resetWorld()
  if (still) poseStill()
  if (peek) {
    phase = 'play'
    alien.vy = u * 24
  }
  last = performance.now()
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    window.removeEventListener('playground-start', begin)
    stopHum()
  }
}
