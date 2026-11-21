import { taptic } from '../lib/haptics.js'
import { unlock, tone, noise, canPlay, getMaster } from '../lib/audio.js'
import { isLive } from '../lib/play.js'
import { fitCanvas, clearBacking, watchFrame } from '../lib/canvas.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const BEST_KEY = 'playground-chick-cross-best'
const COLS = 5
const ICE = '#b7ecff'
const MAG = '#ff4fd8'
const ORANGE = '#ff9a3a'
const GOLD = '#ffe08a'
const BG = '#02050c'
const BIOMES = ['forest', 'desert', 'lake']

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

function sfxHop() {
  tone({ type: 'sine', freq: 780, duration: 0.07, peak: 0.07, slide: 1180 })
  tone({ type: 'triangle', freq: 1180, duration: 0.09, peak: 0.045, slide: 1640 })
}

function sfxBump() {
  noise({ duration: 0.06, peak: 0.04, freq: 280, q: 0.8, type: 'lowpass' })
}

function sfxHorn() {
  tone({ type: 'sawtooth', freq: 196, duration: 0.42, peak: 0.08, slide: 148 })
  tone({ type: 'square', freq: 98, duration: 0.38, peak: 0.05 })
}

function sfxRumble() {
  noise({ duration: 0.36, peak: 0.08, freq: 90, q: 0.6, type: 'lowpass', slide: 55 })
}

function sfxSplash() {
  noise({ duration: 0.28, peak: 0.09, freq: 720, q: 0.7, type: 'bandpass', slide: 180 })
  tone({ type: 'sine', freq: 420, duration: 0.18, peak: 0.05, slide: 140 })
}

function sfxSquash() {
  noise({ duration: 0.22, peak: 0.1, freq: 220, q: 0.7, type: 'lowpass', slide: 70 })
  tone({ type: 'triangle', freq: 180, duration: 0.2, peak: 0.07, slide: 70 })
}

function sfxSwoosh() {
  noise({ duration: 0.22, peak: 0.05, freq: 880, q: 0.8, type: 'bandpass', slide: 320 })
  tone({ type: 'sine', freq: 520, duration: 0.2, peak: 0.04, slide: 240 })
}

function sfxLeft() {
  tone({ type: 'sine', freq: 240, duration: 0.22, peak: 0.06, slide: 90 })
  noise({ duration: 0.16, peak: 0.05, freq: 160, q: 0.7, type: 'lowpass' })
}

function biomeOf(row) {
  return BIOMES[Math.floor(Math.max(0, row) / 10) % 3]
}

function accent(biome) {
  if (biome === 'desert') return ORANGE
  if (biome === 'lake') return MAG
  return ICE
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
  let cell = 48
  let rowH = 52
  let side = 16
  let bottom = 72

  const chick = { col: 2, row: 3, fx: 2, fy: 3, fromC: 2, fromR: 3, hop: 0 }
  const rows = new Map()
  const sparks = []
  let phase = 'ready'
  let cam = 0
  let score = 0
  let best = readBest()
  let nextRow = 0
  let hopLock = 0
  let lastBiome = 'forest'
  let music = null
  let musicT = 0
  let peekT = 0
  let deadT = 0
  let squash = 0
  let raf = 0
  let last = performance.now()
  let t = 0

  function startEl() {
    return document.querySelector('.start')
  }

  function promptOpen() {
    return document.body.classList.contains('is-prompt')
  }

  function layout() {
    const next = fitCanvas(canvas, ctx, frame)
    if (!next.ok) return false
    w = next.w
    h = next.h
    dpr = next.dpr
    u = Math.max(7, Math.min(w, h) / 28)
    side = Math.max(10, u * 0.7)
    bottom = Math.max(64, u * 5.2)
    cell = (w - side * 2) / COLS
    rowH = Math.max(46, Math.min(64, cell * 0.92))
    return true
  }

  function rowY(row) {
    return h - bottom - (row - cam + 0.55) * rowH
  }

  function colX(col) {
    return side + (col + 0.5) * cell
  }

  function arrowGeom(sideName) {
    const r = Math.max(28, u * 2.4)
    const y = h - Math.max(18, u * 1.15) - r
    const x = sideName === 'left' ? Math.max(16, u) + r : w - Math.max(16, u) - r
    return { x, y, r, dir: sideName }
  }

  function makeRow(i) {
    const biome = biomeOf(i)
    const hue = accent(biome)
    const row = {
      i,
      biome,
      type: 'grass',
      hue,
      block: new Array(COLS).fill(false),
      cars: [],
      pads: [],
      dir: i % 2 === 0 ? 1 : -1,
      speed: 0,
      warn: 0,
      warned: false,
      train: null,
      trainIn: 1.4 + Math.random() * 1.6,
    }
    if (i <= 4) {
      row.type = 'grass'
      return row
    }
    const roll = Math.random()
    if (biome === 'lake') {
      if (roll < 0.62) row.type = 'water'
      else if (roll < 0.78) row.type = 'rail'
      else if (roll < 0.9) row.type = 'road'
      else row.type = 'grass'
    } else if (biome === 'desert') {
      if (roll < 0.34) row.type = 'road'
      else if (roll < 0.56) row.type = 'rail'
      else row.type = 'grass'
    } else if (roll < 0.3) row.type = 'road'
    else if (roll < 0.5) row.type = 'rail'
    else row.type = 'grass'

    if (row.type === 'grass') {
      const n = 1 + ((Math.random() * 2) | 0)
      let placed = 0
      while (placed < n) {
        const c = (Math.random() * COLS) | 0
        if (c === 2 && i < 8) continue
        if (!row.block[c]) {
          row.block[c] = true
          placed += 1
        } else break
      }
    }
    if (row.type === 'road') {
      row.speed = (u * (5.5 + Math.random() * 4.5)) * row.dir
      const count = 1 + ((Math.random() * 2) | 0)
      for (let k = 0; k < count; k++) {
        row.cars.push({
          x: ((k + Math.random()) / count) * (w + cell * 3) * row.dir,
          w: cell * (0.9 + Math.random() * 0.45),
          hue: Math.random() < 0.5 ? ICE : MAG,
        })
      }
    }
    if (row.type === 'water') {
      row.speed = u * (1.6 + Math.random() * 1.8) * row.dir
      const n = 2 + ((Math.random() * 2) | 0)
      for (let k = 0; k < n; k++) {
        row.pads.push({
          x: (k + 0.25 + Math.random() * 0.3) * (COLS / n) * cell + side,
          w: cell * (0.82 + Math.random() * 0.16),
        })
      }
    }
    return row
  }

  function ensureRows() {
    const lo = Math.floor(cam) - 2
    const hi = Math.floor(cam + h / rowH + 6)
    while (nextRow <= hi) {
      rows.set(nextRow, makeRow(nextRow))
      nextRow += 1
    }
    for (const i of [...rows.keys()]) {
      if (i < lo - 2) rows.delete(i)
    }
  }

  function resetWorld() {
    rows.clear()
    sparks.length = 0
    nextRow = 0
    chick.col = 2
    chick.row = 3
    chick.fx = 2
    chick.fy = 3
    chick.fromC = 2
    chick.fromR = 3
    chick.hop = 0
    cam = 0
    score = 0
    hopLock = 0
    lastBiome = 'forest'
    deadT = 0
    squash = 0
    peekT = 0
    ensureRows()
    stopMusic()
  }

  function burst(x, y, color, n = 14) {
    const count = reduced ? Math.min(7, n) : n
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = u * (5 + Math.random() * 10)
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: u * (0.08 + Math.random() * 0.14),
        life: 0.4 + Math.random() * 0.28,
        age: 0,
        color,
      })
    }
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
    const lead = voice('square', 392)
    const bass = voice('triangle', 98)
    const sparkle = voice('sine', 784)
    music = {
      step(step) {
        const now = a.currentTime
        const notes = [392, 440, 523, 587, 523, 440, 392, 330]
        const n = notes[step % notes.length]
        lead.o.frequency.setValueAtTime(n, now)
        lead.g.gain.cancelScheduledValues(now)
        lead.g.gain.setValueAtTime(0.0001, now)
        lead.g.gain.exponentialRampToValueAtTime(0.028, now + 0.02)
        lead.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
        bass.o.frequency.setValueAtTime(n / 4, now)
        bass.g.gain.cancelScheduledValues(now)
        bass.g.gain.setValueAtTime(0.0001, now)
        bass.g.gain.exponentialRampToValueAtTime(0.03, now + 0.02)
        bass.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
        if (step % 4 === 0) {
          sparkle.o.frequency.setValueAtTime(n * 2, now)
          sparkle.g.gain.cancelScheduledValues(now)
          sparkle.g.gain.setValueAtTime(0.0001, now)
          sparkle.g.gain.exponentialRampToValueAtTime(0.018, now + 0.015)
          sparkle.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
        }
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
      },
    }
  }

  function stopMusic() {
    if (!music) return
    music.stop()
    music = null
  }

  function syncAudio() {
    if (phase !== 'play' || peek || still || promptOpen()) {
      stopMusic()
      return
    }
    if (canPlay()) startMusic()
    else stopMusic()
  }

  function die(kind) {
    if (phase !== 'play') return
    if (peek) {
      resetWorld()
      phase = 'play'
      return
    }
    phase = 'dead'
    deadT = 0.55
    const x = colX(chick.fx)
    const y = rowY(chick.fy)
    if (kind === 'water') {
      burst(x, y, ICE, 18)
      if (!still) {
        taptic(16)
        sfxSplash()
      }
    } else if (kind === 'left') {
      burst(x, y, ICE, 10)
      if (!still) {
        taptic(12)
        sfxLeft()
      }
    } else {
      squash = 1
      burst(x, y, MAG, 16)
      if (!still) {
        taptic(20)
        sfxSquash()
      }
    }
    stopMusic()
  }

  function showStart() {
    const btn = startEl()
    if (btn) {
      btn.hidden = false
      btn.textContent = 'Start'
    }
  }

  function onPad() {
    const row = rows.get(Math.round(chick.row))
    if (!row || row.type !== 'water') return null
    const x = colX(chick.fx)
    for (const p of row.pads) {
      if (x > p.x - p.w * 0.5 && x < p.x + p.w * 0.5) return p
    }
    return null
  }

  function canLand(col, rowI) {
    if (col < 0 || col >= COLS) return false
    const row = rows.get(rowI)
    if (!row) return true
    if (row.type === 'grass' && row.block[col]) return false
    return true
  }

  function hop(dc, dr) {
    if (phase !== 'play' || hopLock > 0 || chick.hop > 0) return
    const nc = chick.col + dc
    const nr = chick.row + dr
    if (dr < 0) return
    if (!canLand(nc, nr)) {
      if (!peek && !still) sfxBump()
      return
    }
    chick.fromC = chick.fx
    chick.fromR = chick.fy
    chick.col = nc
    chick.row = nr
    chick.hop = 1
    hopLock = 0.08
    if (nr > score) {
      score = nr
      if (score > best) {
        best = score
        writeBest(best)
      }
    }
    const b = biomeOf(nr)
    if (b !== lastBiome) {
      lastBiome = b
      if (!peek && !still) sfxSwoosh()
    }
    if (!peek && !still) {
      taptic(8)
      sfxHop()
    }
  }

  function begin() {
    unlock()
    resetWorld()
    phase = 'play'
    lastBiome = biomeOf(chick.row)
    const btn = startEl()
    if (btn) btn.hidden = true
    syncAudio()
  }

  function hitArrow(p) {
    for (const name of ['left', 'right']) {
      const g = arrowGeom(name)
      if (Math.hypot(p.x - g.x, p.y - g.y) <= g.r + 4) return name
    }
    return null
  }

  function onDown(e) {
    if (e.button || peek || still || !isLive() || promptOpen()) return
    unlock()
    if (phase !== 'play') return
    const box = canvas.getBoundingClientRect()
    const p = { x: e.clientX - box.left, y: e.clientY - box.top }
    const a = hitArrow(p)
    if (a === 'left') hop(-1, 0)
    else if (a === 'right') hop(1, 0)
    else hop(0, 1)
  }

  function onKey(e) {
    if (peek || still || promptOpen() || !isLive()) return
    if (e.type !== 'keydown' || e.repeat) return
    const k = e.key
    if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') {
      e.preventDefault()
      if (phase === 'play') hop(0, 1)
    }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      e.preventDefault()
      if (phase === 'play') hop(-1, 0)
    }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      e.preventDefault()
      if (phase === 'play') hop(1, 0)
    }
  }

  if (!peek) {
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', onKey)
  }

  function step(dt) {
    hopLock = Math.max(0, hopLock - dt)
    squash = Math.max(0, squash - dt * 1.8)
    if (chick.hop > 0) {
      chick.hop = Math.max(0, chick.hop - dt / 0.12)
      const k = 1 - chick.hop
      const e = k * k * (3 - 2 * k)
      chick.fx = chick.fromC + (chick.col - chick.fromC) * e
      chick.fy = chick.fromR + (chick.row - chick.fromR) * e
    } else {
      chick.fx = chick.col
      chick.fy = chick.row
    }

    const spd = 0.36 + Math.min(0.42, score * 0.01)
    cam += spd * dt
    ensureRows()

    for (const row of rows.values()) {
      if (row.type === 'road') {
        for (const c of row.cars) {
          c.x += row.speed * dt
          if (row.dir > 0 && c.x - c.w > w + cell) c.x = -cell * 2
          if (row.dir < 0 && c.x + c.w < -cell) c.x = w + cell * 2
        }
      }
      if (row.type === 'water') {
        for (const p of row.pads) {
          p.x += row.speed * dt
          if (row.dir > 0 && p.x - p.w > w + cell) p.x = -cell
          if (row.dir < 0 && p.x + p.w < -cell) p.x = w + cell
        }
      }
      if (row.type === 'rail') {
        row.trainIn -= dt
        if (row.warn > 0) {
          row.warn = Math.max(0, row.warn - dt)
          if (row.warn <= 0 && !row.train) {
            const dir = row.dir
            row.train = {
              x: dir > 0 ? -cell * 4 : w + cell * 4,
              w: cell * 3.4,
              vx: dir * u * 38,
            }
            if (!peek && !still && Math.abs(rowY(row.i) - h * 0.45) < h * 0.55) sfxRumble()
          }
        } else if (!row.train && row.trainIn <= 0) {
          row.warn = 1.05
          row.warned = true
          row.trainIn = 2.2 + Math.random() * 1.8
          if (!peek && !still && rowY(row.i) < h && rowY(row.i) > 0) sfxHorn()
        }
        if (row.train) {
          row.train.x += row.train.vx * dt
          if (row.train.x > w + cell * 5 || row.train.x < -cell * 5) row.train = null
        }
      }
    }

    const pad = onPad()
    if (pad && chick.hop <= 0) {
      const cx = colX(chick.fx)
      const nx = cx + rows.get(chick.row).speed * dt
      chick.fx = (nx - side) / cell - 0.5
      chick.col = clamp(Math.round(chick.fx), 0, COLS - 1)
    }

    if (phase === 'play' && chick.hop <= 0) {
      const row = rows.get(chick.row)
      const x = colX(chick.fx)
      const y = rowY(chick.fy)
      if (y > h - bottom + rowH * 0.55 || chick.row < cam - 0.35) {
        die('left')
        return
      }
      if (row?.type === 'water' && !onPad()) {
        die('water')
        return
      }
      if (row?.type === 'road') {
        for (const c of row.cars) {
          if (x > c.x - c.w * 0.5 && x < c.x + c.w * 0.5) {
            die('hit')
            return
          }
        }
      }
      if (row?.type === 'rail' && row.train) {
        const tr = row.train
        if (x > tr.x - tr.w * 0.5 && x < tr.x + tr.w * 0.5) {
          die('hit')
          return
        }
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += u * 10 * dt
      if (p.age >= p.life) sparks.splice(i, 1)
    }

    if (phase === 'dead') {
      deadT -= dt
      if (deadT <= 0) showStart()
    }

    musicT += dt
    if (musicT >= 0.22) {
      musicT -= 0.22
      music?.step(Math.floor(t * 4))
    }
  }

  function autoPeek(dt) {
    peekT -= dt
    if (peekT > 0 || chick.hop > 0) return
    peekT = 0.42
    const ahead = rows.get(chick.row + 1)
    if (ahead?.type === 'grass' && ahead.block[chick.col]) {
      if (canLand(chick.col - 1, chick.row)) hop(-1, 0)
      else hop(1, 0)
      return
    }
    if (ahead?.type === 'rail' && (ahead.warn > 0 || ahead.train)) {
      if (canLand(chick.col, chick.row + 1) === false) hop(1, 0)
      else hop(0, 1)
      return
    }
    hop(0, 1)
  }

  function drawRow(row) {
    const y = rowY(row.i)
    if (y < -rowH || y > h + rowH) return
    const x0 = side
    const rw = COLS * cell
    ctx.save()
    if (row.type === 'water') {
      ctx.fillStyle = 'rgba(8, 24, 40, 0.9)'
      ctx.fillRect(x0, y - rowH * 0.5, rw, rowH)
      ctx.strokeStyle = row.hue
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let k = -2; k < 4; k++) {
        const yy = y + Math.sin(t * 2 + row.i + k) * 2 + k * 7
        ctx.moveTo(x0, yy)
        ctx.lineTo(x0 + rw, yy)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      for (const p of row.pads) {
        ctx.save()
        ctx.translate(p.x, y + 2)
        ctx.shadowColor = row.hue
        ctx.shadowBlur = u * 0.4
        ctx.strokeStyle = row.hue
        ctx.fillStyle = 'rgba(6, 18, 28, 0.85)'
        ctx.lineWidth = Math.max(1.3, u * 0.08)
        ctx.beginPath()
        ctx.ellipse(0, 0, p.w * 0.5, rowH * 0.28, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.ellipse(0, 0, p.w * 0.18, rowH * 0.1, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    } else if (row.type === 'road') {
      ctx.fillStyle = 'rgba(6, 12, 20, 0.92)'
      ctx.fillRect(x0, y - rowH * 0.5, rw, rowH)
      ctx.strokeStyle = 'rgba(183,236,255,0.22)'
      ctx.setLineDash([6, 10])
      ctx.beginPath()
      ctx.moveTo(x0 + 6, y)
      ctx.lineTo(x0 + rw - 6, y)
      ctx.stroke()
      ctx.setLineDash([])
      for (const c of row.cars) {
        ctx.save()
        ctx.translate(c.x, y)
        ctx.shadowColor = c.hue
        ctx.shadowBlur = u * 0.45
        ctx.strokeStyle = c.hue
        ctx.fillStyle = 'rgba(4, 10, 16, 0.85)'
        ctx.lineWidth = Math.max(1.2, u * 0.08)
        const hw = c.w * 0.5
        const hh = rowH * 0.22
        ctx.beginPath()
        ctx.rect(-hw, -hh, c.w, hh * 2)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(-hw + 6, -hh + 4)
        ctx.lineTo(hw - 6, -hh + 4)
        ctx.stroke()
        ctx.restore()
      }
    } else if (row.type === 'rail') {
      ctx.fillStyle = 'rgba(8, 10, 16, 0.92)'
      ctx.fillRect(x0, y - rowH * 0.5, rw, rowH)
      ctx.strokeStyle = ORANGE
      ctx.globalAlpha = row.warn > 0 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 14)) : 0.28
      ctx.lineWidth = Math.max(1.4, u * 0.09)
      ctx.beginPath()
      ctx.moveTo(x0, y - 7)
      ctx.lineTo(x0 + rw, y - 7)
      ctx.moveTo(x0, y + 7)
      ctx.lineTo(x0 + rw, y + 7)
      ctx.stroke()
      ctx.globalAlpha = 1
      const blink = row.warn > 0 && Math.sin(t * 14) > 0
      ctx.fillStyle = blink ? ORANGE : 'rgba(255,154,58,0.25)'
      ctx.shadowColor = ORANGE
      ctx.shadowBlur = blink ? u * 0.7 : 0
      ctx.beginPath()
      ctx.arc(x0 + 10, y, 4, 0, Math.PI * 2)
      ctx.arc(x0 + rw - 10, y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      if (row.train) {
        ctx.save()
        ctx.translate(row.train.x, y)
        ctx.shadowColor = MAG
        ctx.shadowBlur = u * 0.7
        ctx.fillStyle = 'rgba(12, 6, 16, 0.9)'
        ctx.strokeStyle = MAG
        ctx.lineWidth = Math.max(1.4, u * 0.1)
        const hw = row.train.w * 0.5
        ctx.beginPath()
        ctx.rect(-hw, -rowH * 0.28, row.train.w, rowH * 0.56)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = GOLD
        ctx.beginPath()
        ctx.arc(hw * 0.72 * Math.sign(row.train.vx || 1), 0, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    } else {
      ctx.fillStyle = row.biome === 'desert' ? 'rgba(18, 14, 8, 0.55)' : 'rgba(4, 12, 20, 0.5)'
      ctx.fillRect(x0, y - rowH * 0.5, rw, rowH)
      ctx.strokeStyle = 'rgba(183,236,255,0.07)'
      ctx.strokeRect(x0, y - rowH * 0.5, rw, rowH)
      for (let c = 0; c < COLS; c++) {
        if (!row.block[c]) continue
        const x = colX(c)
        ctx.save()
        ctx.translate(x, y)
        ctx.shadowColor = row.hue
        ctx.shadowBlur = u * 0.4
        ctx.strokeStyle = row.hue
        ctx.lineWidth = Math.max(1.2, u * 0.08)
        if (row.biome === 'desert' && c % 2 === 0) {
          ctx.beginPath()
          ctx.moveTo(0, rowH * 0.28)
          ctx.lineTo(0, -rowH * 0.28)
          ctx.moveTo(0, -rowH * 0.02)
          ctx.lineTo(-u * 0.45, -rowH * 0.16)
          ctx.moveTo(0, rowH * 0.06)
          ctx.lineTo(u * 0.42, -rowH * 0.08)
          ctx.stroke()
        } else if (row.biome === 'desert') {
          ctx.beginPath()
          ctx.moveTo(0, rowH * 0.12)
          ctx.lineTo(u * 0.42, -rowH * 0.08)
          ctx.lineTo(0, -rowH * 0.28)
          ctx.lineTo(-u * 0.42, -rowH * 0.08)
          ctx.closePath()
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.moveTo(0, -rowH * 0.32)
          ctx.lineTo(-u * 0.85, rowH * 0.12)
          ctx.lineTo(u * 0.85, rowH * 0.12)
          ctx.closePath()
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(0, rowH * 0.12)
          ctx.lineTo(0, rowH * 0.28)
          ctx.stroke()
        }
        ctx.restore()
      }
    }
    ctx.restore()
  }

  function drawChick() {
    const x = colX(chick.fx)
    const y = rowY(chick.fy) - (1 - Math.cos((1 - chick.hop) * Math.PI)) * u * 0.55
    const s = squash > 0 ? 1 - squash * 0.45 : 1
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1 + (1 - s) * 0.5, s)
    ctx.shadowColor = GOLD
    ctx.shadowBlur = u * 0.7
    ctx.lineWidth = Math.max(1.5, u * 0.11)
    ctx.fillStyle = 'rgba(8, 14, 18, 0.85)'
    ctx.strokeStyle = GOLD
    ctx.beginPath()
    ctx.ellipse(0, u * 0.1, u * 0.95, u * 0.82, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = ICE
    ctx.beginPath()
    ctx.ellipse(u * 0.1, -u * 0.55, u * 0.55, u * 0.5, -0.2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = ORANGE
    ctx.beginPath()
    ctx.moveTo(u * 0.52, -u * 0.55)
    ctx.lineTo(u * 1.02, -u * 0.44)
    ctx.lineTo(u * 0.52, -u * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = ICE
    ctx.beginPath()
    ctx.arc(0, -u * 0.64, 2, 0, Math.PI * 2)
    ctx.arc(u * 0.22, -u * 0.66, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = GOLD
    ctx.beginPath()
    ctx.moveTo(-u * 0.24, u * 0.82)
    ctx.lineTo(-u * 0.1, u * 1.08)
    ctx.moveTo(u * 0.26, u * 0.82)
    ctx.lineTo(u * 0.4, u * 1.08)
    ctx.stroke()
    ctx.restore()
  }

  function drawArrows() {
    for (const name of ['left', 'right']) {
      const g = arrowGeom(name)
      ctx.save()
      ctx.translate(g.x, g.y)
      ctx.shadowColor = ICE
      ctx.shadowBlur = u * 0.5
      ctx.strokeStyle = ICE
      ctx.fillStyle = 'rgba(4, 12, 18, 0.72)'
      ctx.lineWidth = Math.max(1.5, u * 0.1)
      ctx.beginPath()
      ctx.arc(0, 0, g.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      const s = g.r * 0.38
      if (name === 'left') {
        ctx.moveTo(s * 0.55, -s)
        ctx.lineTo(-s * 0.7, 0)
        ctx.lineTo(s * 0.55, s)
      } else {
        ctx.moveTo(-s * 0.55, -s)
        ctx.lineTo(s * 0.7, 0)
        ctx.lineTo(-s * 0.55, s)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }
  }

  function strokeLabel(text, x, y, align) {
    ctx.font = `${Math.max(12, u * 0.95)}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = Math.max(3, u * 0.22)
    ctx.shadowColor = ICE
    ctx.shadowBlur = u * 0.35
    ctx.strokeStyle = '#041018'
    ctx.fillStyle = '#ffffff'
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
    ctx.shadowBlur = 0
  }

  function drawScores() {
    const y = Math.max(86, u * 3.15)
    const pad = Math.max(14, u * 0.9)
    ctx.save()
    ctx.fillStyle = 'rgba(2, 5, 12, 0.55)'
    ctx.fillRect(0, y - 16, w, 32)
    ctx.restore()
    strokeLabel(`SCORE ${score}`, pad, y, 'left')
    strokeLabel(`BEST ${best}`, w - pad, y, 'right')
  }

  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#041018')
    g.addColorStop(1, BG)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.save()
    ctx.strokeStyle = 'rgba(183,236,255,0.06)'
    ctx.lineWidth = 1
    const step = Math.max(18, cell)
    const ox = side
    for (let x = ox; x <= w - side; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    ctx.restore()
  }

  function poseStill() {
    resetWorld()
    phase = 'play'
    cam = 18
    chick.row = 22
    chick.col = 2
    chick.fx = 2
    chick.fy = 22
    score = 22
    best = Math.max(best, 28)
    lastBiome = 'lake'
    ensureRows()
    for (let i = 16; i < 30; i++) {
      const row = makeRow(i)
      row.biome = 'lake'
      row.hue = MAG
      row.type = i === 20 || i === 24 || i === 16 ? 'grass' : 'water'
      row.block = new Array(COLS).fill(false)
      row.cars = []
      row.train = null
      row.warn = 0
      if (row.type === 'water') {
        row.speed = u * 1.2 * (i % 2 === 0 ? 1 : -1)
        row.pads = [
          { x: side + cell * 1.5, w: cell * 0.9 },
          { x: side + cell * 3.2, w: cell * 0.86 },
        ]
      }
      rows.set(i, row)
    }
    const land = rows.get(22)
    if (land) {
      land.type = 'water'
      land.pads = [{ x: colX(2), w: cell * 0.95 }]
      land.speed = 0
    }
  }

  function poseScene(kind) {
    resetWorld()
    phase = 'ready'
    if (kind === 'train') {
      cam = 2
      chick.row = 5
      chick.col = 2
      chick.fx = 2
      chick.fy = 5
      score = 5
      for (let i = 0; i < 14; i++) {
        const row = makeRow(i)
        row.type = i === 7 ? 'rail' : i === 9 ? 'road' : 'grass'
        row.biome = 'forest'
        row.hue = ICE
        row.block = new Array(COLS).fill(false)
        row.cars = []
        row.train = null
        row.warn = i === 7 ? 1 : 0
        if (row.type === 'grass' && i > 2 && i !== 5) {
          row.block[i % COLS] = true
          row.block[(i + 2) % COLS] = true
          row.block[2] = false
        }
        if (i === 7) {
          row.train = { x: w * 0.48, w: cell * 3.35, vx: u * 18 }
        }
        if (i === 9) {
          row.speed = 0
          row.cars = [{ x: side + cell * 1.2, w: cell * 1.15, hue: ICE }]
        }
        rows.set(i, row)
      }
      nextRow = 14
    } else if (kind === 'lake') {
      cam = 20
      chick.row = 23
      chick.col = 2
      chick.fx = 2
      chick.fy = 23
      score = 23
      for (let i = 18; i < 30; i++) {
        const row = makeRow(i)
        row.biome = 'lake'
        row.hue = MAG
        row.type = i % 3 === 0 ? 'grass' : 'water'
        row.block = new Array(COLS).fill(false)
        row.train = null
        row.warn = 0
        if (row.type === 'water') {
          row.speed = 0
          row.pads = [
            { x: side + cell * (0.8 + (i % 3)), w: cell * 0.9 },
            { x: side + cell * 3.1, w: cell * 0.84 },
          ]
        }
        rows.set(i, row)
      }
      const land = rows.get(23)
      if (land) {
        land.type = 'water'
        land.pads = [{ x: colX(2), w: cell * 0.95 }]
      }
      nextRow = 30
    } else {
      cam = 2
      chick.row = 4
      chick.col = 2
      chick.fx = 2
      chick.fy = 4
      score = 0
      for (let i = 0; i < 14; i++) {
        const row = makeRow(i)
        row.biome = 'forest'
        row.hue = ICE
        if (i <= 4) row.type = 'grass'
        else if (i === 6 || i === 8) row.type = 'road'
        else row.type = 'grass'
        row.block = new Array(COLS).fill(false)
        row.train = null
        row.warn = 0
        if (row.type === 'grass' && i > 3) {
          row.block[i % COLS] = true
          row.block[(i + 3) % COLS] = true
          row.block[2] = false
        }
        if (row.type === 'road') {
          row.speed = 0
          row.cars = [{ x: side + cell * (i === 6 ? 3.15 : 1.35), w: cell * 1.2, hue: i === 6 ? ICE : MAG }]
        }
        rows.set(i, row)
      }
      nextRow = 14
    }
    chick.fromC = chick.col
    chick.fromR = chick.row
  }

  function draw() {
    clearBacking(canvas, ctx, dpr)
    drawBg()
    const keys = [...rows.keys()].sort((a, b) => a - b)
    for (const i of keys) drawRow(rows.get(i))
    for (const p of sparks) {
      const k = 1 - p.age / p.life
      ctx.save()
      ctx.globalAlpha = 0.3 + 0.7 * k
      ctx.fillStyle = p.color
      ctx.shadowColor = p.color
      ctx.shadowBlur = u * 0.4
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * (0.5 + k), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    drawChick()
    if (!peek && !still) drawArrows()
    drawScores()
    canvas.dataset.score = String(score)
    canvas.dataset.biome = biomeOf(Math.round(cam + 4))
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
      if (phase === 'play' || phase === 'dead') {
        if (peek && phase === 'play' && !reduced) autoPeek(dt)
        step(dt)
        syncAudio()
      }
    }
    draw()
    raf = requestAnimationFrame(tick)
  }

  if (!peek && !still) window.addEventListener('playground-start', begin)

  const stopWatch = watchFrame(frame, () => {
    const was = w
    if (!layout()) return
    if (still) poseStill()
    else if (phase !== 'play' && Math.abs(was - w) > 1) {
      resetWorld()
      if (!peek) poseScene('forest')
    }
  })
  layout()
  resetWorld()
  if (still) poseStill()
  else if (peek) {
    phase = 'play'
    cam = 2
  } else {
    poseScene('forest')
  }
  last = performance.now()
  raf = requestAnimationFrame(tick)

  canvas.__scene = poseScene

  return () => {
    cancelAnimationFrame(raf)
    stopWatch()
    stopMusic()
    delete canvas.__scene
    canvas.removeEventListener('pointerdown', onDown)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('playground-start', begin)
  }
}
