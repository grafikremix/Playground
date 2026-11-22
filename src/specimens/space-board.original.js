import { taptic } from '../lib/haptics.js'
import { unlock, tone, noise } from '../lib/audio.js'
import { isLive, showScoreHud } from '../lib/play.js'
import { fitCanvas, observeFrame } from '../lib/canvas.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const BEST_KEY = 'playground-space-board-best-original'
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
  const specks = []
  const puffs = []
  let cam = 0
  let nextRow = 0
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
  let hitCool = 0

  function startEl() {
    return document.querySelector('.start')
  }

  function promptOpen() {
    return document.body.classList.contains('is-prompt')
  }

  function layout() {
    const next = fitCanvas(canvas, ctx, frame)
    if (!next.ok) return
    w = next.w
    h = next.h
    dpr = next.dpr
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

  function resetWorld() {
    blocks.length = 0
    puffs.length = 0
    alien.x = w * 0.5
    alien.y = h * 0.22
    alien.vx = 0
    alien.vy = 180
    alien.tilt = 0
    alien.maxY = alien.y
    cam = 0
    nextRow = h * 0.55
    score = 0
    chimed = false
    hitCool = 0
    fillRows()
  }

  function fillRows() {
    const top = cam + h + u * 8
    while (nextRow < top) {
      spawnRow(nextRow)
      nextRow += u * (7.4 + Math.random() * 3.2)
    }
    while (blocks.length && blocks[0].y + blocks[0].h < cam - u * 4) blocks.shift()
  }

  function spawnRow(y) {
    const gap = u * (4.8 + Math.random() * 2.4)
    const side = Math.random() < 0.5 ? 'left' : 'right'
    const bw = u * (3.6 + Math.random() * 4.2)
    const bh = u * (1.35 + Math.random() * 0.7)
    const pad = u * 0.8
    let x
    if (side === 'left') x = pad + Math.random() * Math.max(u, w * 0.42 - bw - gap * 0.2)
    else x = w - pad - bw - Math.random() * Math.max(u, w * 0.42 - bw)
    if (Math.random() < 0.28) {
      const bw2 = u * (2.8 + Math.random() * 2.4)
      const other = side === 'left' ? w - pad - bw2 : pad
      if (Math.abs(other + bw2 * 0.5 - (x + bw * 0.5)) > gap + u) {
        blocks.push(makeBlock(other, y, bw2, bh * (0.85 + Math.random() * 0.3)))
      }
    }
    blocks.push(makeBlock(x, y, bw, bh))
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

  function hitR() {
    return Math.max(56, u * 3.4)
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
    if (alien.y < cam - u * 1.2) {
      if (peek) {
        resetWorld()
        phase = 'play'
        alien.vy = u * 24
      } else die()
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
  }

  function onMove(e) {
    if (e.pointerId !== pid || phase !== 'play') return
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    if (!moved && Math.hypot(dx, dy) > MOVE) moved = true
    if (moved) {
      const mx = e.clientX - lx
      const my = e.clientY - ly
      alien.x = clamp(alien.x + mx, u * 1.4, w - u * 1.4)
      alien.vx += mx * 18
      if (Math.abs(my) > 1) alien.vy += -my * 0.45
    }
    lx = e.clientX
    ly = e.clientY
  }

  function onUp(e) {
    if (e.pointerId !== pid) return
    pid = null
    if (phase !== 'play' || promptOpen()) return
    const box = canvas.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const syA = worldToScreen(alien.y)
    const dist = Math.hypot(x - alien.x, y - syA)
    if (!moved && dist <= hitR()) boost()
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

  function drawAlien() {
    const syA = worldToScreen(alien.y)
    const bob = reduced || still || !isLive() ? 0 : Math.sin(t * 6.2) * u * 0.08
    const x = alien.x
    const y = syA + bob
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(alien.tilt)

    ctx.fillStyle = 'rgba(183,236,255,0.12)'
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
    ctx.shadowColor = ICE
    ctx.shadowBlur = u * 0.7
    ctx.strokeStyle = ICE
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
    body.addColorStop(0, '#e8ffb0')
    body.addColorStop(0.4, NEON_G)
    body.addColorStop(1, '#146628')
    ctx.shadowColor = NEON_G
    ctx.shadowBlur = u * 0.85
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(0, -u * 0.15, u * 0.82, u * 1.05, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = NEON_G
    ctx.lineWidth = Math.max(1.2, u * 0.07)
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.strokeStyle = NEON_G
    ctx.lineWidth = Math.max(1.5, u * 0.1)
    ctx.beginPath()
    ctx.moveTo(-u * 0.12, -u * 1.12)
    ctx.quadraticCurveTo(-u * 0.4, -u * 1.55, -u * 0.22, -u * 1.72)
    ctx.stroke()
    ctx.fillStyle = '#d8ff9a'
    ctx.beginPath()
    ctx.arc(-u * 0.2, -u * 1.76, u * 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = NEON_G
    ctx.lineWidth = Math.max(1, u * 0.05)
    ctx.stroke()

    ctx.fillStyle = '#04140a'
    ctx.beginPath()
    ctx.ellipse(-u * 0.28, -u * 0.42, u * 0.18, u * 0.24, -0.1, 0, Math.PI * 2)
    ctx.ellipse(u * 0.28, -u * 0.42, u * 0.18, u * 0.24, 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = ICE
    ctx.beginPath()
    ctx.arc(-u * 0.22, -u * 0.5, u * 0.07, 0, Math.PI * 2)
    ctx.arc(u * 0.34, -u * 0.5, u * 0.07, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = NEON_G
    ctx.beginPath()
    ctx.ellipse(0, -u * 0.02, u * 0.16, u * 0.1, 0, 0, Math.PI)
    ctx.fill()

    ctx.strokeStyle = NEON_G
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
    if (!showScoreHud({ peek, still })) return
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
    score = 186
    best = Math.max(best, 240)
    nextRow = alien.y + u * 2
    blocks.length = 0
    blocks.push(makeBlock(u * 0.8, alien.y + u * 5.5, u * 5.2, u * 1.5))
    blocks.push(makeBlock(w - u * 6.4, alien.y + u * 11, u * 5.5, u * 1.6))
    blocks.push(makeBlock(u * 1.2, alien.y - u * 6, u * 4.4, u * 1.4))
    blocks[0].hue = 318
    blocks[1].hue = 28
    blocks[2].hue = 318
    splat(alien.x + u * 0.8, alien.y + u * 0.2)
    for (const p of puffs) p.age = p.life * 0.35
  }

  function draw() {
    drawBg()
    for (const b of blocks) drawBlock(b)
    drawPuffs()
    drawAlien()
    drawScores()
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

  const ro = observeFrame(frame, () => {
    const was = w
    layout()
    if (still) poseStill()
    else if (phase !== 'play' && Math.abs(was - w) > 1) resetWorld()
  })
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
  }
}
