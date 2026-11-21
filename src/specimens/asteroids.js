import { taptic } from '../lib/haptics.js'
import { unlock, tone, noise, canPlay, getMaster, loopNoise } from '../lib/audio.js'
import { isLive } from '../lib/play.js'
import { fitCanvas, clearBacking, watchFrame } from '../lib/canvas.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const ICE = '#b7ecff'
const NEON = '#7dffea'
const MAG = '#ff4fd8'
const ORANGE = '#ff9a3a'
const BEST_KEY = 'playground-asteroids-best'
const HUD = 22
const STEP_S = 45

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function readBest() {
  try {
    const n = Number(localStorage.getItem(BEST_KEY))
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  } catch {
    /* private mode */
  }
  return 0
}

function writeBest(n) {
  try {
    localStorage.setItem(BEST_KEY, String(n))
  } catch {
    /* private mode */
  }
}

function sfxLaser() {
  tone({ type: 'sawtooth', freq: 920, duration: 0.12, peak: 0.07, slide: 240 })
  tone({ type: 'square', freq: 1480, duration: 0.07, peak: 0.04, slide: 420 })
}

function sfxBoom() {
  noise({ duration: 0.28, peak: 0.11, freq: 280, q: 0.7, type: 'lowpass', slide: 90 })
  tone({ type: 'sawtooth', freq: 140, duration: 0.22, peak: 0.08, slide: 55 })
  tone({ type: 'triangle', freq: 90, duration: 0.3, peak: 0.05, slide: 40 })
}

function sfxDeath() {
  noise({ duration: 0.42, peak: 0.1, freq: 220, q: 0.6, type: 'lowpass', slide: 60 })
  tone({ type: 'sawtooth', freq: 180, duration: 0.34, peak: 0.08, slide: 48 })
  tone({ type: 'sine', freq: 110, duration: 0.4, peak: 0.06, slide: 40 })
}

function sfxCelebrate() {
  tone({ type: 'sine', freq: 523, duration: 0.16, peak: 0.09 })
  tone({ type: 'triangle', freq: 659, duration: 0.2, peak: 0.08 })
  tone({ type: 'sine', freq: 784, duration: 0.28, peak: 0.07 })
  tone({ type: 'square', freq: 1046, duration: 0.18, peak: 0.045 })
}

function sfxTen() {
  tone({ type: 'triangle', freq: 880, duration: 0.12, peak: 0.08 })
  tone({ type: 'sine', freq: 1320, duration: 0.22, peak: 0.06, slide: 1760 })
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
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

  const jet = { x: 0, y: 0, vx: 0, vy: 0 }
  const rocks = []
  const shots = []
  const sparks = []
  const confetti = []
  const stars = []
  const keys = { l: false, r: false, u: false, d: false, fire: false }
  const stick = { nx: 0, ny: 0, active: false, id: null }
  let fireId = null
  let firing = false
  let phase = 'ready'
  let hits = 0
  let best = readBest()
  let bestAtRun = best
  let celebrated = false
  let heat = 0
  let elapsed = 0
  let spawnT = 0
  let fireT = 0
  let musicT = 0
  let tallyPop = 0
  let tallyHi = 0
  let peekAim = 1
  let raf = 0
  let last = performance.now()
  let t = 0
  let music = null
  let turbo = null

  function startEl() {
    return document.querySelector('.start')
  }

  function promptOpen() {
    return document.body.classList.contains('is-prompt')
  }

  function hudReserve() {
    if (peek || still) return Math.max(16, u)
    return HUD
  }

  function stickGeom() {
    const r = Math.max(44, u * 3.4)
    return { x: Math.max(16, u) + r, y: h - hudReserve() - r, r }
  }

  function fireGeom() {
    const r = Math.max(28, u * 2.55)
    return { x: w - Math.max(16, u) - r, y: h - hudReserve() - r, r }
  }

  function restY() {
    return h * 0.82
  }

  function playBounds() {
    const top = Math.max(96, u * 3.6)
    const bottom = h - hudReserve() - u * 2.2
    return {
      x0: u * 1.6,
      x1: w - u * 1.6,
      y0: top,
      y1: Math.max(top + u * 2, bottom),
    }
  }

  function layout() {
    const next = fitCanvas(canvas, ctx, frame)
    if (!next.ok) return false
    w = next.w
    h = next.h
    dpr = next.dpr
    u = Math.max(7, Math.min(w, h) / 28)
    if (!stars.length) seedStars()
    if (phase !== 'play') jet.y = restY()
    return true
  }

  function seedStars() {
    stars.length = 0
    const n = reduced ? 36 : 72
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        s: Math.random() < 0.18 ? 2 : 1,
        d: 0.2 + Math.random() * 0.8,
      })
    }
  }

  function level() {
    return hits + Math.floor(elapsed / STEP_S)
  }

  function speedMul() {
    return 1 + level() * 0.13
  }

  function spawnEvery() {
    return Math.max(0.34, 1.55 - level() * 0.1)
  }

  function stopTurbo() {
    if (!turbo) return
    turbo.stop()
    turbo = null
  }

  function stopMusic() {
    if (!music) return
    music.stop()
    music = null
  }

  function startTurbo() {
    if (turbo || peek || still) return
    turbo = loopNoise({ freq: 240, q: 0.7 })
  }

  function startMusic() {
    if (music || peek || still || !canPlay()) return
    const a = unlock()
    const dest = getMaster()
    if (!a || !dest) return
    const nodes = []
    function voice(type, freq) {
      const o = a.createOscillator()
      o.type = type
      o.frequency.value = freq
      const g = a.createGain()
      g.gain.value = 0.0001
      o.connect(g)
      g.connect(dest)
      o.start()
      nodes.push(o, g)
      return { o, g }
    }
    const bass = voice('sawtooth', 49)
    const sub = voice('sine', 49)
    const fifth = voice('triangle', 147)
    const tense = voice('sine', 196)
    const pulse = loopNoise({ freq: 140, q: 0.55 })
    music = {
      kick(heat) {
        const now = a.currentTime
        const p = 0.045 + Math.min(0.05, heat * 0.004)
        for (const v of [bass, sub]) {
          v.g.gain.cancelScheduledValues(now)
          v.g.gain.setValueAtTime(0.0001, now)
          v.g.gain.exponentialRampToValueAtTime(p, now + 0.025)
          v.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
        }
        fifth.g.gain.cancelScheduledValues(now)
        fifth.g.gain.setValueAtTime(0.0001, now)
        fifth.g.gain.exponentialRampToValueAtTime(0.02 + heat * 0.002, now + 0.04)
        fifth.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38)
        if (heat > 2) {
          tense.g.gain.cancelScheduledValues(now)
          tense.g.gain.setValueAtTime(0.0001, now)
          tense.g.gain.exponentialRampToValueAtTime(0.018 + heat * 0.0015, now + 0.05)
          tense.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
        }
        pulse?.set(0.012 + Math.min(0.03, heat * 0.002), 120 + heat * 12)
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
        pulse?.stop()
      },
    }
    bass.o.frequency.value = 49
    sub.o.frequency.value = 49
  }

  function syncAudio() {
    if (phase !== 'play' || peek || still || promptOpen()) {
      stopMusic()
      stopTurbo()
      return
    }
    if (canPlay()) {
      startMusic()
      startTurbo()
    } else {
      stopMusic()
      stopTurbo()
    }
    const spd = Math.hypot(jet.vx, jet.vy)
    turbo?.set(0.012 + Math.min(0.07, spd / (u * 90)), 180 + Math.min(420, spd * 0.8))
  }

  function resetStick() {
    stick.nx = 0
    stick.ny = 0
    stick.active = false
    stick.id = null
    fireId = null
    firing = false
    keys.fire = false
  }

  function resetWorld() {
    rocks.length = 0
    shots.length = 0
    sparks.length = 0
    confetti.length = 0
    jet.x = w * 0.5
    jet.y = restY()
    jet.vx = 0
    jet.vy = 0
    hits = 0
    heat = 0
    elapsed = 0
    spawnT = 0.28
    fireT = 0
    musicT = 0
    tallyPop = 0
    tallyHi = 0
    celebrated = false
    bestAtRun = best
    resetStick()
    stopMusic()
    stopTurbo()
  }

  function makeRock() {
    const r = u * (0.7 + Math.random() * 1.7)
    const n = 7 + ((Math.random() * 4) | 0)
    const verts = []
    for (let i = 0; i < n; i++) {
      verts.push({
        a: (i / n) * Math.PI * 2 + Math.random() * 0.24,
        k: 0.68 + Math.random() * 0.42,
      })
    }
    const pal = Math.random()
    return {
      x: clamp(jet.x + (Math.random() - 0.5) * w * 0.72, u * 1.6, w - u * 1.6),
      y: -r - u * 0.4,
      r,
      vx: (Math.random() - 0.5) * u * 2.2,
      vy: u * (6.4 + Math.random() * 3.6) * (1.18 - r / (u * 4.4)),
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.6,
      verts,
      hue: pal < 0.34 ? ICE : pal < 0.67 ? MAG : ORANGE,
    }
  }

  function burst(x, y, color, n = 16) {
    const count = reduced ? Math.min(8, n) : n
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = u * (4 + Math.random() * 10)
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: u * (0.08 + Math.random() * 0.16),
        life: 0.45 + Math.random() * 0.32,
        age: 0,
        color,
      })
    }
  }

  function sprayConfetti(x, y) {
    const n = reduced ? 28 : 64
    const pal = [NEON, ICE, MAG, ORANGE]
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.65 + Math.random() * Math.PI * 1.7
      const s = u * (12 + Math.random() * 26)
      confetti.push({
        x: x - u * (0.4 + Math.random() * 2.4),
        y: y + (Math.random() - 0.35) * u * 1.4,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - u * 6,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 16,
        w: u * (0.22 + Math.random() * 0.4),
        h: u * (0.5 + Math.random() * 0.9),
        life: 1.05 + Math.random() * 0.5,
        age: 0,
        color: pal[i % pal.length],
      })
    }
  }

  function shoot() {
    if (phase !== 'play' || fireT > 0) return
    fireT = 0.16
    const nose = jet.y - u * 1.55
    shots.push({ x: jet.x, y: nose, vy: u * 38 })
    if (!peek && !still) {
      taptic(8)
      sfxLaser()
    }
  }

  function begin() {
    unlock()
    resetWorld()
    phase = 'play'
    const btn = startEl()
    if (btn) btn.hidden = true
    syncAudio()
  }

  function die() {
    if (phase !== 'play') return
    if (peek) {
      resetWorld()
      phase = 'play'
      spawnT = 0.2
      return
    }
    phase = 'dead'
    burst(jet.x, jet.y, ICE, 22)
    resetStick()
    stopMusic()
    stopTurbo()
    if (!still) {
      taptic(22)
      sfxDeath()
    }
    const btn = startEl()
    if (btn) {
      btn.hidden = false
      btn.textContent = 'Start'
    }
  }

  function passBest() {
    if (celebrated || peek || still) return
    if (hits <= bestAtRun) return
    celebrated = true
    tallyPop = 1
    const pad = Math.max(14, u * 0.9)
    const y = Math.max(88, u * 3.2)
    sprayConfetti(w - pad, y)
    taptic(18)
    sfxCelebrate()
  }

  function hitTen() {
    if (hits <= 0 || hits % 10 !== 0) return
    tallyHi = 2.4
    if (peek || still) return
    taptic(12)
    sfxTen()
  }

  function hitRock(rock, i) {
    burst(rock.x, rock.y, rock.hue, 18)
    rocks.splice(i, 1)
    hits += 1
    heat += 1
    if (hits > best) {
      best = hits
      writeBest(best)
    }
    passBest()
    hitTen()
    if (!peek && !still) {
      taptic(14)
      sfxBoom()
    }
  }

  function pt(e) {
    const box = canvas.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  function setStickFrom(p) {
    const g = stickGeom()
    const dx = p.x - g.x
    const dy = p.y - g.y
    const m = Math.hypot(dx, dy) || 1
    const k = Math.min(1, m / g.r)
    stick.nx = (dx / m) * k
    stick.ny = (dy / m) * k
    stick.active = true
  }

  function onDown(e) {
    if (e.button || peek || still || !isLive() || promptOpen()) return
    unlock()
    if (phase !== 'play') return
    const p = pt(e)
    const st = stickGeom()
    const fr = fireGeom()
    const ds = Math.hypot(p.x - st.x, p.y - st.y)
    const df = Math.hypot(p.x - fr.x, p.y - fr.y)
    if (stick.id == null && ds <= st.r + 6) {
      stick.id = e.pointerId
      setStickFrom(p)
      return
    }
    if (fireId == null && df <= fr.r + 6) {
      fireId = e.pointerId
      firing = true
      shoot()
    }
  }

  function onMove(e) {
    if (e.pointerId === stick.id && phase === 'play') setStickFrom(pt(e))
  }

  function onUp(e) {
    if (e.pointerId === stick.id) {
      stick.id = null
      stick.active = false
      stick.nx = 0
      stick.ny = 0
    }
    if (e.pointerId === fireId) {
      fireId = null
      firing = false
    }
  }

  function onKey(e) {
    if (peek || still || promptOpen() || !isLive()) return
    const k = e.key
    const down = e.type === 'keydown'
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      keys.l = down
      e.preventDefault()
    }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      keys.r = down
      e.preventDefault()
    }
    if (k === 'ArrowUp' || k === 'w' || k === 'W') {
      keys.u = down
      e.preventDefault()
    }
    if (k === 'ArrowDown' || k === 's' || k === 'S') {
      keys.d = down
      e.preventDefault()
    }
    if (k === ' ' || k === 'Spacebar') {
      e.preventDefault()
      keys.fire = down
      if (down && !e.repeat && phase === 'play') shoot()
    }
  }

  if (!peek) {
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
  }

  function jetBox() {
    return { x: jet.x - u * 1.15, y: jet.y - u * 1.2, w: u * 2.3, h: u * 2.1 }
  }

  function overlapping(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  function step(dt) {
    fireT = Math.max(0, fireT - dt)
    tallyPop = Math.max(0, tallyPop - dt * 2.2)
    tallyHi = Math.max(0, tallyHi - dt)
    elapsed += dt
    heat = hits + Math.floor(elapsed / STEP_S)
    const mul = speedMul()
    const bounds = playBounds()

    let ax = stick.nx
    let ay = stick.ny
    if (keys.l) ax -= 1
    if (keys.r) ax += 1
    if (keys.u) ay -= 1
    if (keys.d) ay += 1
    const mag = Math.hypot(ax, ay)
    if (mag > 1) {
      ax /= mag
      ay /= mag
    }
    const speed = u * 24
    if (mag > 0.04) {
      jet.vx += (ax * speed - jet.vx) * Math.min(1, dt * 14)
      jet.vy += (ay * speed - jet.vy) * Math.min(1, dt * 14)
    } else {
      const damp = Math.pow(0.04, dt)
      jet.vx *= damp
      jet.vy *= damp
    }
    jet.x += jet.vx * dt
    jet.y += jet.vy * dt
    if (jet.x < bounds.x0) {
      jet.x = bounds.x0
      jet.vx = 0
    }
    if (jet.x > bounds.x1) {
      jet.x = bounds.x1
      jet.vx = 0
    }
    if (jet.y < bounds.y0) {
      jet.y = bounds.y0
      jet.vy = 0
    }
    if (jet.y > bounds.y1) {
      jet.y = bounds.y1
      jet.vy = 0
    }

    if ((firing || keys.fire) && phase === 'play') shoot()

    spawnT -= dt
    if (spawnT <= 0) {
      rocks.push(makeRock())
      spawnT = spawnEvery() * (0.75 + Math.random() * 0.5)
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]
      s.y -= s.vy * dt
      if (s.y < -u) shots.splice(i, 1)
    }

    const box = jetBox()
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i]
      r.x += r.vx * dt
      r.y += r.vy * mul * dt
      r.rot += r.spin * dt
      if (r.x < r.r) {
        r.x = r.r
        r.vx = Math.abs(r.vx)
      }
      if (r.x > w - r.r) {
        r.x = w - r.r
        r.vx = -Math.abs(r.vx)
      }
      const rockBox = { x: r.x - r.r * 0.78, y: r.y - r.r * 0.78, w: r.r * 1.56, h: r.r * 1.56 }
      let blasted = false
      for (let j = shots.length - 1; j >= 0; j--) {
        const s = shots[j]
        if (Math.hypot(s.x - r.x, s.y - r.y) < r.r * 1.12) {
          shots.splice(j, 1)
          hitRock(r, i)
          blasted = true
          break
        }
      }
      if (blasted) continue
      if (overlapping(box, rockBox)) {
        die()
        return
      }
      if (r.y - r.r > h) rocks.splice(i, 1)
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += u * 8 * dt
      p.vx *= 0.96
      if (p.age >= p.life) sparks.splice(i, 1)
    }

    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i]
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += u * 22 * dt
      p.vx *= 0.98
      p.rot += p.spin * dt
      if (p.age >= p.life) confetti.splice(i, 1)
    }

    musicT += dt
    const beat = 60 / (92 + Math.min(50, heat * 7))
    if (musicT >= beat) {
      musicT -= beat
      music?.kick(heat)
    }
  }

  function autoPeek(dt) {
    jet.vx += peekAim * u * 18 * dt
    if (jet.x < w * 0.28 || jet.x > w * 0.72) peekAim *= -1
    fireT = Math.max(0, fireT - dt)
    if (fireT <= 0) shoot()
  }

  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#041018')
    g.addColorStop(0.55, '#02050c')
    g.addColorStop(1, '#071018')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    const gap = u * 2.4
    const off = (t * u * 1.6) % gap
    ctx.strokeStyle = 'rgba(183,236,255,0.07)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= w; x += gap) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let y = -off; y <= h + gap; y += gap) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
    for (const s of stars) {
      const y = ((s.y * h * 2 + t * u * 3.2 * s.d) % (h + 6)) - 2
      ctx.globalAlpha = 0.2 + 0.5 * s.d
      ctx.fillStyle = ICE
      ctx.fillRect(s.x * w, y, s.s, s.s)
    }
    ctx.globalAlpha = 1
  }

  function drawJet() {
    const tilt = clamp(jet.vx / (u * 22), -0.35, 0.35)
    const glow = 0.55 + Math.min(0.7, Math.hypot(jet.vx, jet.vy) / (u * 28))
    ctx.save()
    ctx.translate(jet.x, jet.y)
    ctx.rotate(tilt)
    ctx.fillStyle = `rgba(125,255,234,${0.12 + glow * 0.12})`
    ctx.beginPath()
    ctx.ellipse(0, u * 0.85, u * 0.7, u * (0.35 + glow * 0.35), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = NEON
    ctx.shadowBlur = u * 0.7
    ctx.beginPath()
    ctx.moveTo(0, -u * 1.55)
    ctx.lineTo(u * 1.15, u * 0.85)
    ctx.lineTo(u * 0.28, u * 0.42)
    ctx.lineTo(-u * 0.28, u * 0.42)
    ctx.lineTo(-u * 1.15, u * 0.85)
    ctx.closePath()
    ctx.fillStyle = '#0a1820'
    ctx.fill()
    ctx.strokeStyle = NEON
    ctx.lineWidth = Math.max(1.3, u * 0.09)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -u * 0.7)
    ctx.lineTo(u * 0.32, u * 0.2)
    ctx.lineTo(-u * 0.32, u * 0.2)
    ctx.closePath()
    ctx.fillStyle = 'rgba(183,236,255,0.28)'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.restore()
  }

  function drawRock(r) {
    ctx.save()
    ctx.translate(r.x, r.y)
    ctx.rotate(r.rot)
    ctx.beginPath()
    r.verts.forEach((v, i) => {
      const x = Math.cos(v.a) * r.r * v.k
      const y = Math.sin(v.a) * r.r * v.k
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(2, 8, 16, 0.72)'
    ctx.fill()
    ctx.shadowColor = r.hue
    ctx.shadowBlur = u * 0.55
    ctx.strokeStyle = r.hue
    ctx.lineWidth = Math.max(1.2, u * 0.08)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.strokeStyle = r.hue
    ctx.globalAlpha = 0.28
    ctx.beginPath()
    ctx.moveTo(-r.r * 0.25, -r.r * 0.1)
    ctx.lineTo(r.r * 0.2, r.r * 0.15)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.restore()
  }

  function drawShots() {
    for (const s of shots) {
      ctx.save()
      ctx.shadowColor = NEON
      ctx.shadowBlur = u * 0.8
      ctx.strokeStyle = '#e7ffff'
      ctx.lineWidth = Math.max(2, u * 0.14)
      ctx.beginPath()
      ctx.moveTo(s.x, s.y + u * 0.9)
      ctx.lineTo(s.x, s.y - u * 0.2)
      ctx.stroke()
      ctx.strokeStyle = NEON
      ctx.lineWidth = Math.max(1, u * 0.06)
      ctx.beginPath()
      ctx.moveTo(s.x, s.y + u * 1.4)
      ctx.lineTo(s.x, s.y - u * 0.35)
      ctx.stroke()
      ctx.restore()
    }
  }

  function drawSparks() {
    for (const p of sparks) {
      const k = 1 - p.age / p.life
      ctx.save()
      ctx.globalAlpha = 0.3 + 0.7 * k
      ctx.shadowColor = p.color
      ctx.shadowBlur = u * 0.45
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * (0.5 + k), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  function drawConfetti() {
    for (const p of confetti) {
      const k = 1 - p.age / p.life
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = 0.25 + 0.75 * k
      ctx.shadowColor = p.color
      ctx.shadowBlur = u * 0.35
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h)
      ctx.restore()
    }
  }

  function mixHex(a, b, k) {
    const parse = (hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]
    const A = parse(a)
    const B = parse(b)
    const t = clamp(k, 0, 1)
    const ch = (i) => Math.round(A[i] + (B[i] - A[i]) * t)
    return `rgb(${ch(0)},${ch(1)},${ch(2)})`
  }

  function tallyHiK() {
    if (tallyHi <= 0) return 0
    if (tallyHi > 0.4) return 1
    return tallyHi / 0.4
  }

  function drawLabel(text, x, y, { align, bold, scale, fill, fontSize }) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.font = `${bold ? '700 ' : ''}${fontSize}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = Math.max(3, u * 0.22)
    ctx.shadowColor = ICE
    ctx.shadowBlur = u * 0.4
    ctx.strokeStyle = '#041018'
    ctx.fillStyle = fill
    ctx.strokeText(text, 0, 0)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }

  function drawScore() {
    const y = Math.max(88, u * 3.2)
    const pad = Math.max(14, u * 0.9)
    const size = Math.max(12, u * 0.95)
    const hi = tallyHiK()
    const scale = 1 + 0.22 * hi + 0.28 * tallyPop
    const fill = hi > 0 ? mixHex('#ffffff', MAG, hi) : '#ffffff'
    drawLabel(`Best ${best}`, pad, y, { align: 'left', bold: false, scale: 1, fill: '#ffffff', fontSize: size })
    drawLabel(`HITS ${hits}`, w - pad, y, { align: 'right', bold: true, scale, fill, fontSize: size })
  }

  function drawStick() {
    const g = stickGeom()
    const live = phase === 'play' && stick.active
    ctx.save()
    ctx.translate(g.x, g.y)
    ctx.strokeStyle = live ? NEON : ICE
    ctx.globalAlpha = live ? 0.95 : 0.72
    ctx.shadowColor = NEON
    ctx.shadowBlur = u * 0.55
    ctx.lineWidth = Math.max(1.6, u * 0.1)
    ctx.beginPath()
    ctx.arc(0, 0, g.r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, g.r * 0.72, 0, Math.PI * 2)
    ctx.globalAlpha = 0.18
    ctx.stroke()
    const kx = stick.nx * g.r * 0.52
    const ky = stick.ny * g.r * 0.52
    ctx.globalAlpha = live ? 1 : 0.8
    ctx.beginPath()
    ctx.arc(kx, ky, g.r * 0.34, 0, Math.PI * 2)
    ctx.fillStyle = '#07141c'
    ctx.fill()
    ctx.strokeStyle = NEON
    ctx.lineWidth = Math.max(1.4, u * 0.09)
    ctx.stroke()
    ctx.restore()
  }

  function drawFire() {
    const g = fireGeom()
    const live = phase === 'play' && (firing || keys.fire)
    ctx.save()
    ctx.translate(g.x, g.y)
    ctx.shadowColor = MAG
    ctx.shadowBlur = u * (live ? 0.9 : 0.45)
    ctx.lineWidth = Math.max(1.8, u * 0.12)
    ctx.strokeStyle = live ? MAG : ICE
    ctx.globalAlpha = live ? 1 : 0.78
    ctx.beginPath()
    ctx.arc(0, 0, g.r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, g.r * 0.78, 0, Math.PI * 2)
    ctx.fillStyle = live ? 'rgba(255,79,216,0.22)' : 'rgba(7,20,28,0.72)'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = live ? '#ffe9ff' : ICE
    ctx.globalAlpha = 1
    ctx.font = `700 ${Math.max(10, u * 0.72)}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('FIRE', 0, 1)
    ctx.restore()
  }

  function poseStill() {
    resetWorld()
    phase = 'play'
    jet.x = w * 0.42
    jet.y = restY()
    jet.vx = u * 8
    hits = 8
    heat = 8
    best = Math.max(best, 12)
    rocks.length = 0
    shots.length = 0
    sparks.length = 0
    confetti.length = 0
    rocks.push({
      x: w * 0.58,
      y: h * 0.38,
      r: u * 1.6,
      vx: 0,
      vy: 0,
      rot: 0.4,
      spin: 0,
      verts: [
        { a: 0, k: 1 },
        { a: 0.9, k: 0.78 },
        { a: 1.7, k: 1.05 },
        { a: 2.5, k: 0.72 },
        { a: 3.4, k: 0.96 },
        { a: 4.2, k: 0.7 },
        { a: 5.1, k: 1.02 },
        { a: 5.8, k: 0.8 },
      ],
      hue: MAG,
    })
    rocks.push({
      x: w * 0.22,
      y: h * 0.22,
      r: u * 1.05,
      vx: 0,
      vy: 0,
      rot: 1.1,
      spin: 0,
      verts: [
        { a: 0.2, k: 0.9 },
        { a: 1.1, k: 1.05 },
        { a: 2.0, k: 0.74 },
        { a: 3.0, k: 1 },
        { a: 4.1, k: 0.8 },
        { a: 5.0, k: 1.08 },
        { a: 5.8, k: 0.7 },
      ],
      hue: ORANGE,
    })
    rocks.push({
      x: w * 0.78,
      y: h * 0.16,
      r: u * 0.82,
      vx: 0,
      vy: 0,
      rot: 0.2,
      spin: 0,
      verts: [
        { a: 0, k: 1 },
        { a: 1.05, k: 0.76 },
        { a: 2.1, k: 1.04 },
        { a: 3.2, k: 0.7 },
        { a: 4.3, k: 0.98 },
        { a: 5.4, k: 0.8 },
      ],
      hue: ICE,
    })
    shots.push({ x: jet.x, y: h * 0.52, vy: 0 })
    rocks.splice(0, 1)
    burst(w * 0.58, h * 0.38, MAG, 26)
    for (const p of sparks) {
      p.age = p.life * 0.18
      p.x += p.vx * 0.1
      p.y += p.vy * 0.1
    }
  }

  function paintMeta() {
    const st = stickGeom()
    const fr = fireGeom()
    canvas.dataset.hits = String(hits)
    canvas.dataset.best = String(best)
    canvas.dataset.phase = phase
    canvas.dataset.shots = String(shots.length)
    canvas.dataset.jetx = String(Math.round(jet.x))
    canvas.dataset.jety = String(Math.round(jet.y))
    canvas.dataset.stick = `${Math.round(st.x)},${Math.round(st.y)},${Math.round(st.r)}`
    canvas.dataset.fire = `${Math.round(fr.x)},${Math.round(fr.y)},${Math.round(fr.r)}`
    canvas.dataset.fx = tallyPop > 0.15 ? 'best' : tallyHi > 0 ? 'ten' : ''
  }

  function draw() {
    clearBacking(canvas, ctx, dpr)
    drawBg()
    for (const r of rocks) drawRock(r)
    drawSparks()
    drawConfetti()
    drawShots()
    drawJet()
    drawStick()
    drawFire()
    drawScore()
    paintMeta()
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    if ((!isLive() || promptOpen()) && !peek && !still) {
      syncAudio()
      draw()
      raf = requestAnimationFrame(tick)
      return
    }
    if (!still && isLive()) {
      t += dt
      if (phase === 'play' || peek) {
        if (peek && !reduced) autoPeek(dt)
        if (phase === 'play') step(dt)
        syncAudio()
      }
    }
    draw()
    raf = requestAnimationFrame(tick)
  }

  if (!peek && !still) window.addEventListener('playground-start', begin)

  function waitingRocks() {
    if (phase === 'play' || still || peek || rocks.length) return
    const a = makeRock()
    a.y = h * 0.3
    a.vy = 0
    a.vx = 0
    const b = makeRock()
    b.y = h * 0.16
    b.x = w * 0.7
    b.vy = 0
    rocks.push(a, b)
  }

  const stopWatch = watchFrame(frame, () => {
    const was = w
    if (!layout()) return
    if (still) poseStill()
    else if (phase !== 'play' && Math.abs(was - w) > 1) {
      resetWorld()
      waitingRocks()
    }
  })
  layout()
  resetWorld()
  if (still) poseStill()
  else if (peek) {
    phase = 'play'
    spawnT = 0.2
  } else {
    waitingRocks()
  }
  last = performance.now()
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    stopWatch()
    stopMusic()
    stopTurbo()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKey)
    window.removeEventListener('playground-start', begin)
  }
}
