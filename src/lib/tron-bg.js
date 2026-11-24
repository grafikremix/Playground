const ICE = [183, 236, 255]
const CELL = 56
const MAX_STREAKS = 3
const DUST_N = 36

function rgba(a) {
  return `rgba(${ICE[0]},${ICE[1]},${ICE[2]},${a})`
}

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function mountTronBg() {
  if (typeof document === 'undefined') return
  const { body } = document
  if (!body || !body.classList.contains('home')) return
  if (body.querySelector(':scope > .tron-bg')) return

  const canvas = document.createElement('canvas')
  canvas.className = 'tron-bg'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.pointerEvents = 'none'
  body.insertBefore(canvas, body.firstChild)
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
  if (!ctx) return

  let w = 1
  let h = 1
  let dpr = 1
  let raf = 0
  let last = 0
  let frames = 0
  let fpsStamp = 0
  let fps = 0
  let reduced = reducedMotion()
  let scroll = 0
  const streaks = []
  const dust = []
  const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

  function gridShift() {
    return {
      ox: reduced ? 0 : (scroll * 0.07) % CELL,
      oy: reduced ? 0 : (scroll * 0.18) % CELL,
    }
  }

  function size() {
    w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1)
    h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
    dpr = Math.min(1.75, window.devicePixelRatio || 1)
    const bw = Math.max(1, Math.round(w * dpr))
    const bh = Math.max(1, Math.round(h * dpr))
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function seedDust() {
    dust.length = 0
    for (let i = 0; i < DUST_N; i++) {
      dust.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.55 + Math.random() * 0.85,
        a: 0.05 + Math.random() * 0.09,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 1.1 + Math.random() * 3.2,
      })
    }
  }

  function spawnStreak() {
    if (streaks.length >= MAX_STREAKS) return
    const vert = Math.random() < 0.55
    const life = 2.6 + Math.random() * 3.2
    streaks.push({
      axis: vert ? 'v' : 'h',
      cell: vert ? ((Math.random() * (w / CELL + 2)) | 0) : ((Math.random() * (h / CELL + 2)) | 0),
      t: Math.random() * (vert ? h : w),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 20 + Math.random() * 24,
      len: 20 + Math.random() * 36,
      life,
      max: life,
      cool: 0.4,
    })
  }

  function linePos(s, ox, oy) {
    return s.axis === 'v' ? s.cell * CELL - ox : s.cell * CELL - oy
  }

  function stepStreaks(dt) {
    if (streaks.length < 2 && Math.random() < 0.012) spawnStreak()
    else if (streaks.length < MAX_STREAKS && Math.random() < 0.0035) spawnStreak()
    const { ox, oy } = gridShift()
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i]
      s.life -= dt
      s.cool -= dt
      s.t += s.dir * s.speed * dt
      if (s.cool <= 0) {
        const origin = s.axis === 'v' ? oy : ox
        const rel = (s.t + origin) / CELL
        if (Math.abs(rel - Math.round(rel)) < 0.038 && Math.random() < 0.2) {
          const oldCell = s.cell
          s.cell = Math.round(rel)
          s.axis = s.axis === 'v' ? 'h' : 'v'
          s.t = oldCell * CELL - (s.axis === 'h' ? ox : oy)
          if (Math.random() < 0.45) s.dir *= -1
          s.cool = 0.38
        }
      }
      const limit = s.axis === 'v' ? h + 90 : w + 90
      if (s.life < 0 || s.t < -90 || s.t > limit) streaks.splice(i, 1)
    }
  }

  function stepDust(dt) {
    for (const p of dust) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.x < -4) p.x += w + 8
      else if (p.x > w + 4) p.x -= w + 8
      if (p.y < -4) p.y += h + 8
      else if (p.y > h + 4) p.y -= h + 8
    }
  }

  function drawGrid() {
    const { ox, oy } = gridShift()
    ctx.lineWidth = 1
    ctx.strokeStyle = rgba(0.06)
    ctx.beginPath()
    for (let x = -ox; x <= w + CELL; x += CELL) {
      const px = Math.round(x) + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
    }
    for (let y = -oy; y <= h + CELL; y += CELL) {
      const py = Math.round(y) + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(w, py)
    }
    ctx.stroke()

    const floorTop = h * 0.52
    const vanishX = w * 0.5
    ctx.strokeStyle = rgba(0.045)
    ctx.beginPath()
    const rows = 11
    for (let i = 1; i <= rows; i++) {
      const t = i / rows
      const y = floorTop + (h + 36 - floorTop) * t * t
      if (y > h + 8) continue
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    const cols = 16
    for (let i = -cols; i <= cols; i++) {
      ctx.moveTo(vanishX, floorTop)
      ctx.lineTo(vanishX + i * (w * 0.14), h + 40)
    }
    ctx.stroke()
  }

  function drawStreaks() {
    const { ox, oy } = gridShift()
    for (const s of streaks) {
      const age = s.max - s.life
      const fade = Math.max(0, Math.min(1, age / 0.35, s.life / 0.5))
      const line = Math.round(linePos(s, ox, oy)) + 0.5
      ctx.strokeStyle = rgba(0.15 * fade)
      ctx.lineWidth = 1.3
      ctx.beginPath()
      if (s.axis === 'v') {
        ctx.moveTo(line, s.t)
        ctx.lineTo(line, s.t - s.dir * s.len)
      } else {
        ctx.moveTo(s.t, line)
        ctx.lineTo(s.t - s.dir * s.len, line)
      }
      ctx.stroke()
      ctx.strokeStyle = rgba(0.26 * fade)
      ctx.lineWidth = 0.55
      ctx.stroke()
    }
  }

  function drawDust() {
    const drift = reduced ? 0 : scroll * 0.52
    ctx.fillStyle = rgba(1)
    for (const p of dust) {
      const y = ((p.y + drift) % (h + 8) + h + 8) % (h + 8)
      ctx.globalAlpha = p.a
      ctx.fillRect(p.x, y, p.r, p.r)
    }
    ctx.globalAlpha = 1
  }

  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = 1
    drawGrid()
    if (!reduced) {
      drawDust()
      drawStreaks()
    }
  }

  function tick(now) {
    raf = 0
    if (document.hidden) return
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016)
    last = now
    frames += 1
    if (now - fpsStamp >= 1000) {
      fps = frames
      frames = 0
      fpsStamp = now
    }
    scroll = window.scrollY || 0
    if (!reduced) {
      stepStreaks(dt)
      stepDust(dt)
    }
    paint()
    if (!reduced) raf = requestAnimationFrame(tick)
  }

  function start() {
    if (raf) return
    last = performance.now()
    fpsStamp = last
    frames = 0
    scroll = reduced ? 0 : window.scrollY || 0
    if (reduced) {
      streaks.length = 0
      paint()
      return
    }
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  function onVis() {
    if (document.hidden) stop()
    else start()
  }

  function onMotion() {
    reduced = reducedMotion()
    streaks.length = 0
    stop()
    size()
    seedDust()
    start()
  }

  size()
  seedDust()
  if (!reduced) {
    spawnStreak()
    spawnStreak()
  }
  start()

  window.addEventListener('resize', () => {
    size()
    seedDust()
    if (reduced) paint()
  })
  document.addEventListener('visibilitychange', onVis)
  mql?.addEventListener?.('change', onMotion)

  const stats = () => ({
    reduced,
    w,
    h,
    dpr,
    fps,
    scroll,
    gridOy: gridShift().oy,
    gridOx: gridShift().ox,
    dustOy: reduced ? 0 : scroll * 0.52,
    streaks: streaks.length,
    streakT: streaks[0]?.t ?? null,
    streakLife: streaks[0]?.life ?? null,
    dust: dust.length,
    hidden: document.hidden,
    running: !!raf,
    pe: getComputedStyle(canvas).pointerEvents,
    z: getComputedStyle(canvas).zIndex,
  })
  canvas.__tron = stats
  window.__tronBg = stats
}
