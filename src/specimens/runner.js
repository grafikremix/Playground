import { taptic } from '../lib/haptics.js'
import { unlock, tone, noise } from '../lib/audio.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const DURATION = 60
const HIT_INSET = 0.18

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function hitBox(e, inset) {
  const p = inset * Math.min(e.w, e.h)
  return { x: e.x + p, y: e.y + p, w: e.w - p * 2, h: e.h - p * 2 }
}

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t))
  const m = (s / 60) | 0
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function px(ctx, ox, oy, s, color, cells) {
  ctx.fillStyle = color
  for (let i = 0; i < cells.length; i++) {
    const [x, y, w, h] = cells[i]
    ctx.fillRect((ox + x * s) | 0, (oy + y * s) | 0, Math.max(1, (w * s) | 0), Math.max(1, (h * s) | 0))
  }
}

export function mount(stage, { still, peek } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  canvas.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none;'

  let startBtn = null
  let timerEl = null
  if (!peek && !still) {
    startBtn = document.createElement('button')
    startBtn.type = 'button'
    startBtn.className = 'start'
    startBtn.textContent = 'Start'
    timerEl = document.createElement('div')
    timerEl.className = 'timer'
    timerEl.textContent = '1:00'
    startBtn.addEventListener('click', () => begin())
    stage.replaceChildren(canvas, timerEl, startBtn)
  } else {
    stage.replaceChildren(canvas)
  }

  const frame = stage.closest('.stage-frame') || stage
  let w = 1
  let h = 1
  let dpr = 1
  let u = 10
  let floorH = 40
  let floorY = 200
  let cloudY = 120
  let heroW = 16
  let heroH = 24
  let block = 18
  let walkSpeed = 120
  let gravity = 2100
  let jumpV = 620

  const stars = [[], [], []]
  const clouds = []
  const enemies = []
  const hero = { x: 0, y: 0, vy: 0, grounded: true, plane: 'floor', t: 0 }
  let cam = 0
  let nextCloud = 0
  let spawnIn = 1.4
  let phase = 'ready'
  let clock = DURATION
  let swarming = false
  let swarmT = 0
  let swarmI = 0
  let peekJump = 0
  let raf = 0
  let last = performance.now()
  let footT = 0
  let lastCeil = 60
  let wasGrounded = true

  function sfxJump() {
    tone({ type: 'square', freq: 430, duration: 0.11, peak: 0.08, slide: 690 })
    noise({ duration: 0.07, peak: 0.04, freq: 1200, q: 0.8, type: 'highpass' })
  }

  function sfxCloud() {
    noise({ duration: 0.14, peak: 0.055, freq: 780, q: 0.7, type: 'bandpass', slide: 420 })
    tone({ type: 'sine', freq: 540, duration: 0.1, peak: 0.045, slide: 360 })
  }

  function sfxStep() {
    noise({ duration: 0.045, peak: 0.028, freq: 190, q: 0.8, type: 'lowpass' })
  }

  function sfxPass(kind) {
    if (kind === 'flyer') {
      tone({ type: 'triangle', freq: 920, duration: 0.18, peak: 0.055, slide: 480 })
    } else {
      tone({ type: 'sawtooth', freq: 140, duration: 0.16, peak: 0.05, slide: 78 })
      noise({ duration: 0.12, peak: 0.04, freq: 240, q: 0.7, type: 'lowpass' })
    }
  }

  function sfxDeath() {
    tone({ type: 'sawtooth', freq: 220, duration: 0.32, peak: 0.1, slide: 52 })
    noise({ duration: 0.28, peak: 0.08, freq: 320, q: 0.6, type: 'lowpass', slide: 80 })
  }

  function sfxStart() {
    tone({ type: 'sine', freq: 523, duration: 0.12, peak: 0.08 })
    tone({ type: 'sine', freq: 784, duration: 0.18, peak: 0.07 })
  }

  function sfxTick(sec) {
    const freq = 980 + (11 - sec) * 36
    tone({ type: 'square', freq, duration: 0.05, peak: 0.055 })
  }

  function sfxSwarm() {
    noise({ duration: 0.42, peak: 0.07, freq: 180, q: 0.6, type: 'lowpass', slide: 90 })
    tone({ type: 'sawtooth', freq: 110, duration: 0.38, peak: 0.06, slide: 70 })
    tone({ type: 'triangle', freq: 165, duration: 0.34, peak: 0.045, slide: 98 })
  }

  const SWARM = [
    { t: 0.15, kind: 'walker' },
    { t: 1.55, kind: 'flyer' },
    { t: 2.95, kind: 'walker' },
    { t: 4.35, kind: 'flyer' },
    { t: 5.75, kind: 'walker' },
    { t: 6.55, kind: 'flyer', extra: 9 },
  ]

  function seedStars() {
    stars[0].length = 0
    stars[1].length = 0
    stars[2].length = 0
    const counts = [28, 18, 10]
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < counts[layer]; i++) {
        stars[layer].push({
          x: Math.random(),
          y: 0.04 + Math.random() * 0.72,
          s: layer === 2 ? 2.2 : layer === 1 ? 1.5 : 1,
          tw: Math.random() * Math.PI * 2,
        })
      }
    }
  }

  function layout() {
    const box = frame.getBoundingClientRect()
    w = Math.max(1, box.width)
    h = Math.max(1, box.height)
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    u = Math.max(6.5, Math.min(w, h) / 34)
    floorH = Math.max(26, u * 3.1)
    floorY = h - floorH
    cloudY = floorY - u * 7.1
    heroW = u * 1.75
    heroH = u * 2.55
    block = u * 2.15
    walkSpeed = u * 8.2
    gravity = u * 210
    const rise = floorY - cloudY + u * 1.15
    jumpV = Math.sqrt(2 * gravity * rise)
    if (!stars[0].length) seedStars()
  }

  function resetWorld() {
    clouds.length = 0
    enemies.length = 0
    cam = 0
    hero.x = w * 0.3
    hero.y = floorY
    hero.vy = 0
    hero.grounded = true
    hero.plane = 'floor'
    hero.t = 0
    nextCloud = w * 0.42
    spawnIn = 1.6
    clock = DURATION
    swarming = false
    swarmT = 0
    swarmI = 0
    fillClouds()
  }

  function fillClouds() {
    while (nextCloud < cam + w + block * 10) {
      const gap = block * (2.6 + Math.random() * 3.4)
      const n = Math.random() < 0.42 ? 2 : 1
      clouds.push({ x: nextCloud, w: n * block })
      nextCloud += n * block + gap
    }
    while (clouds.length && clouds[0].x + clouds[0].w < cam - block * 2) clouds.shift()
  }

  function spawn(kind, extra = 0) {
    const x = cam + w + block * 1.4 + extra * u
    if (kind === 'walker') {
      const eh = heroH * 0.72
      enemies.push({
        kind,
        x,
        y: floorY - eh,
        w: heroW * 1.05,
        h: eh,
        vx: -walkSpeed * 0.38,
      })
    } else {
      const eh = heroH * 0.58
      enemies.push({
        kind,
        x,
        y: cloudY - eh + u * 0.15,
        w: heroW * 1.15,
        h: eh,
        vx: -walkSpeed * 0.46,
      })
    }
  }

  function maybeSpawn(dt) {
    if (swarming) return
    spawnIn -= dt
    if (spawnIn > 0) return
    const visible = enemies.filter((e) => e.x + e.w > cam && e.x < cam + w)
    if (visible.length) {
      spawnIn = 0.2
      return
    }
    const pair = Math.random() < 0.05
    if (pair) {
      spawn('walker')
      spawn('flyer', 11)
    } else {
      spawn(Math.random() < 0.5 ? 'walker' : 'flyer')
    }
    spawnIn = 1.5 + Math.random() * 0.9
  }

  function runSwarm(dt) {
    swarmT += dt
    while (swarmI < SWARM.length && swarmT >= SWARM[swarmI].t) {
      const step = SWARM[swarmI++]
      spawn(step.kind, step.extra || 0)
    }
    if (swarmI >= SWARM.length && enemies.length === 0) {
      swarming = false
      spawnIn = 1.8
    }
  }

  function begin() {
    unlock()
    resetWorld()
    phase = 'play'
    lastCeil = 60
    footT = 0
    if (startBtn) startBtn.hidden = true
    if (timerEl) timerEl.textContent = formatTime(clock)
    sfxStart()
  }

  function die() {
    if (phase !== 'play') return
    phase = 'dead'
    taptic(18)
    sfxDeath()
    if (startBtn) {
      startBtn.hidden = false
      startBtn.textContent = 'Start'
    }
  }

  function promptOpen() {
    const win = document.querySelector('.prompt-window')
    return win && !win.hidden
  }

  function jump() {
    if (phase !== 'play' || promptOpen()) return
    if (!hero.grounded) return
    hero.vy = -jumpV
    hero.grounded = false
    if (!peek) {
      taptic(8)
      sfxJump()
    }
  }

  function cloudUnder(feetX, feetY) {
    if (Math.abs(feetY - cloudY) > u * 0.85) return null
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i]
      if (feetX + heroW * 0.62 > c.x && feetX + heroW * 0.38 < c.x + c.w) return c
    }
    return null
  }

  function stepHero(dt) {
    wasGrounded = hero.grounded
    hero.t += dt
    if (phase === 'play' || peek) {
      hero.x += walkSpeed * dt
      if (!hero.grounded) hero.vy += gravity * dt
      hero.y += hero.vy * dt
    }

    const cloud = cloudUnder(hero.x, hero.y)
    if (hero.vy >= 0 && cloud && hero.y >= cloudY - 2 && hero.y <= cloudY + u * 0.9) {
      hero.y = cloudY
      hero.vy = 0
      hero.grounded = true
      hero.plane = 'cloud'
    } else if (hero.y >= floorY) {
      hero.y = floorY
      hero.vy = 0
      hero.grounded = true
      hero.plane = 'floor'
    } else {
      hero.grounded = false
      if (hero.y < floorY - u) hero.plane = hero.y <= cloudY + u ? 'cloud' : 'air'
    }

    if (!peek && !still && phase === 'play' && !wasGrounded && hero.grounded && hero.plane === 'cloud') {
      sfxCloud()
    }
    if (!peek && !still && phase === 'play' && hero.grounded && hero.plane === 'floor') {
      footT += dt
      if (footT > 0.3) {
        footT = 0
        sfxStep()
      }
    } else {
      footT = 0.18
    }

    cam = hero.x - w * 0.3
    fillClouds()
  }

  function stepEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i]
      e.x += e.vx * dt
      if (e.kind === 'flyer') e.y = cloudY - e.h + u * 0.15 + Math.sin(hero.t * 4 + e.x * 0.01) * u * 0.18
      if (!e.passed && e.x + e.w < hero.x) {
        e.passed = true
        if (!peek && !still && phase === 'play') sfxPass(e.kind)
      }
      if (e.x + e.w < cam - block * 2) enemies.splice(i, 1)
    }
  }

  function collide() {
    if (phase !== 'play' || peek) return
    const hb = hitBox({ x: hero.x, y: hero.y - heroH, w: heroW, h: heroH }, HIT_INSET)
    for (const e of enemies) {
      const eb = hitBox(e, 0.12)
      if (!aabb(hb, eb)) continue
      if (e.kind === 'walker' && hero.plane === 'cloud' && hero.grounded) continue
      die()
      return
    }
  }

  function autoPeek(dt) {
    peekJump -= dt
    if (hero.grounded && peekJump <= 0) {
      const threat = enemies.find((e) => e.kind === 'walker' && e.x - hero.x < block * 5 && e.x > hero.x)
      if (threat || Math.random() < 0.008) {
        jump()
        peekJump = 0.7
      }
    }
  }

  function drawStars(t) {
    const depths = [0.12, 0.28, 0.52]
    const cols = ['#1c3d52', '#3d6f88', '#b7ecff']
    for (let layer = 0; layer < 3; layer++) {
      const depth = depths[layer]
      const col = cols[layer]
      for (const st of stars[layer]) {
        const sx = ((st.x * w - cam * depth) % w + w) % w
        const sy = st.y * floorY
        const tw = 0.55 + 0.45 * Math.sin(t * 2.1 + st.tw)
        ctx.globalAlpha = layer === 0 ? 0.45 * tw : tw
        ctx.fillStyle = col
        const s = st.s
        ctx.fillRect((sx) | 0, (sy) | 0, s, s)
        if (layer === 2) {
          ctx.globalAlpha = 0.28 * tw
          ctx.fillRect((sx - 1) | 0, sy | 0, s + 2, 1)
          ctx.fillRect(sx | 0, (sy - 1) | 0, 1, s + 2)
        }
      }
    }
    ctx.globalAlpha = 1
  }

  function drawFloor() {
    ctx.fillStyle = '#071018'
    ctx.fillRect(0, floorY, w, h - floorY)
    ctx.fillStyle = '#123044'
    ctx.fillRect(0, floorY, w, Math.max(2, u * 0.22))
    const tile = Math.max(10, u * 1.6)
    const ox = -((cam % tile) + tile) % tile
    ctx.fillStyle = '#0b1c28'
    for (let x = ox; x < w + tile; x += tile) {
      ctx.fillRect((x) | 0, (floorY + u * 0.22) | 0, 1, h - floorY)
    }
    ctx.fillStyle = '#1a455c'
    for (let x = ox; x < w + tile; x += tile * 2) {
      ctx.fillRect((x + 3) | 0, (floorY + u * 0.55) | 0, Math.max(2, tile * 0.35) | 0, Math.max(2, u * 0.28) | 0)
    }
    ctx.fillStyle = 'rgba(183,236,255,0.12)'
    ctx.fillRect(0, floorY - 1, w, 1)
  }

  function drawClouds() {
    for (const c of clouds) {
      const x = c.x - cam
      if (x > w + 8 || x + c.w < -8) continue
      const s = Math.max(2, u * 0.42)
      const top = cloudY - s * 3.1
      px(ctx, x, top, s, '#3d6f88', [
        [1, 2, 4, 3],
        [4, 1, 5, 4],
        [8, 2, 4, 3],
      ])
      px(ctx, x, top, s, '#8fd4ee', [
        [2, 2, 3, 1],
        [5, 1, 4, 1],
      ])
      px(ctx, x, top, s, '#b7ecff', [
        [1, 3, c.w / s - 1.2, 2.2],
        [2, 2.2, 3, 1],
      ])
      if (c.w > block * 1.4) {
        px(ctx, x + block * 0.72, top, s, '#b7ecff', [
          [0, 3, 6, 2.2],
          [1, 1.6, 4, 2],
        ])
        px(ctx, x + block * 0.72, top, s, '#8fd4ee', [[1, 1.4, 3, 1]])
      }
    }
  }

  function drawHero() {
    const x = hero.x - cam
    const y = hero.y - heroH
    const s = Math.max(2, heroW / 8)
    const walk = hero.grounded ? ((hero.t * 8) | 0) % 2 : 0
    const jump = !hero.grounded
    px(ctx, x, y, s, '#163044', [[1, 1, 6, 10]])
    px(ctx, x, y, s, '#b7ecff', [
      [2, 1, 5, 3],
      [1, 4, 6, 4],
    ])
    px(ctx, x, y, s, '#7ad0ea', [[2, 2, 4, 2]])
    px(ctx, x, y, s, '#e8fbff', [[3, 2, 2, 1]])
    px(ctx, x, y, s, '#3d6f88', [[2, 8, 5, 2]])
    if (jump) {
      px(ctx, x, y, s, '#9ee4f6', [
        [0, 5, 2, 1],
        [6, 4, 2, 1],
        [2, 10, 2, 2],
        [5, 10, 2, 2],
      ])
    } else {
      px(ctx, x, y, s, '#9ee4f6', [
        [1 + walk, 10, 2, 2],
        [5 - walk, 10, 2, 2],
      ])
    }
  }

  function drawWalker(e) {
    const x = e.x - cam
    const y = e.y
    const s = Math.max(2, e.w / 7)
    const stomp = ((hero.t * 6) | 0) % 2
    px(ctx, x, y, s, '#4a1d2a', [[0, 2, 7, 4]])
    px(ctx, x, y, s, '#c45a6a', [
      [1, 1, 5, 4],
      [0, 3, 7, 2],
    ])
    px(ctx, x, y, s, '#f0c9a0', [
      [2, 2, 1, 1],
      [5, 2, 1, 1],
    ])
    px(ctx, x, y, s, '#3d6f88', [
      [1 + stomp, 6, 2, 2],
      [4 - stomp, 6, 2, 2],
    ])
  }

  function drawFlyer(e) {
    const x = e.x - cam
    const y = e.y
    const s = Math.max(2, e.w / 8)
    px(ctx, x, y, s, '#1c3d52', [[1, 2, 6, 3]])
    px(ctx, x, y, s, '#7ad0ea', [
      [0, 2, 8, 2],
      [2, 1, 4, 1],
    ])
    px(ctx, x, y, s, '#b7ecff', [[2, 2, 4, 1]])
    px(ctx, x, y, s, '#c45a6a', [[3, 3, 2, 1]])
  }

  function draw() {
    ctx.fillStyle = '#02050c'
    ctx.fillRect(0, 0, w, h)
    drawStars(hero.t)
    drawClouds()
    drawFloor()
    for (const e of enemies) {
      if (e.kind === 'walker') drawWalker(e)
      else drawFlyer(e)
    }
    drawHero()
  }

  function poseStill() {
    phase = 'play'
    resetWorld()
    hero.x = w * 0.3 + u * 2
    cam = hero.x - w * 0.3
    hero.y = cloudY - u * 2.4
    hero.vy = -u * 4
    hero.grounded = false
    hero.plane = 'air'
    clock = 47
    clouds.length = 0
    clouds.push({ x: hero.x + u * 6, w: block * 2 })
    clouds.push({ x: hero.x + u * 18, w: block })
    clouds.push({ x: hero.x - u * 14, w: block * 2 })
    const eh = heroH * 0.72
    enemies.length = 0
    enemies.push({
      kind: 'walker',
      x: hero.x + u * 11,
      y: floorY - eh,
      w: heroW * 1.05,
      h: eh,
      vx: 0,
    })
    const fh = heroH * 0.58
    enemies.push({
      kind: 'flyer',
      x: hero.x + u * 22,
      y: cloudY - fh,
      w: heroW * 1.15,
      h: fh,
      vx: 0,
    })
  }

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    if (!still) {
      if (phase === 'play' || peek) {
        if (phase === 'play') {
          clock -= dt
          if (clock <= 0) {
            clock = 0
            if (!swarming && swarmI === 0) {
              swarming = true
              swarmT = 0
              if (!peek && !still) sfxSwarm()
            }
          }
          if (timerEl) timerEl.textContent = formatTime(clock)
          const ceil = Math.ceil(clock)
          if (clock > 0 && ceil <= 10 && ceil >= 1 && ceil !== lastCeil) sfxTick(ceil)
          lastCeil = ceil
        }
        stepHero(dt)
        stepEnemies(dt)
        if (swarming) runSwarm(dt)
        else maybeSpawn(dt)
        collide()
        if (peek && !reduced) autoPeek(dt)
      } else {
        hero.t += dt * 0.35
      }
    }
    draw()
    raf = requestAnimationFrame(tick)
  }

  function onPointer(e) {
    if (e.button) return
    unlock()
    if (phase === 'play') {
      e.preventDefault()
      jump()
    }
  }

  function onKey(e) {
    if (e.code !== 'Space' && e.code !== 'Enter') return
    if (e.repeat) return
    if (promptOpen()) return
    e.preventDefault()
    if (phase === 'play') jump()
    else if ((phase === 'ready' || phase === 'dead') && !peek && !still) begin()
  }

  if (!peek) {
    canvas.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
  }

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
    spawn('walker')
    spawnIn = 1.2
  }
  last = performance.now()
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onPointer)
    window.removeEventListener('keydown', onKey)
  }
}
