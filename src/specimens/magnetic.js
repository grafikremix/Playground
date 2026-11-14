import { clamp, lerp, reduced, whenVisible } from '../lib/motion.js'
import { trackPointers } from '../lib/gestures.js'
import { taptic } from '../lib/haptics.js'

export function mount(el, { preview = false, still = false } = {}) {
  el.innerHTML = `
    <div class="magnetic">
      <canvas></canvas>
      <input class="ghost" aria-label="Magnetic field" maxlength="42" autocomplete="off" autocorrect="off" spellcheck="false" />
    </div>
  `
  const wrap = el.querySelector('.magnetic')
  const canvas = wrap.querySelector('canvas')
  const input = wrap.querySelector('input')
  const ctx = canvas.getContext('2d')

  let letters = []
  let dust = makeDust(preview ? 16 : 26)
  let focused = false
  let w = 400
  let h = 160
  let field = { scale: 1, rot: 0, ox: 0, oy: 0 }
  let magnetGrab = false

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    w = wrap.clientWidth || 400
    h = wrap.clientHeight || 160
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()

  function caretX() {
    return 22 + letters.length * 15
  }

  if (still) {
    focused = true
    const word = 'remix'
    input.value = word
    const cx = (wrap.clientWidth || 560) * 0.42
    const cy = (wrap.clientHeight || 280) * 0.48
    ;[...word].forEach((ch, i) => {
      letters.push({
        ch,
        x: cx + i * 28 - 48,
        y: cy + Math.sin(i * 1.1) * 10,
        vx: 0,
        vy: 0,
        rot: (i - 2) * 0.12,
        rv: 0,
        tx: cx + i * 26 - 40,
        ty: cy,
      })
    })
    field.rot = -0.08
    field.scale = 1.35
    field.ox = 36
    field.oy = -8
  }

  wrap.addEventListener('click', () => input.focus())
  input.addEventListener('focus', () => {
    focused = true
    taptic(8)
  })
  input.addEventListener('blur', () => { focused = false })
  input.addEventListener('input', () => {
    const next = [...input.value]
    if (next.length > letters.length) {
      const ch = next[next.length - 1]
      letters.push({
        ch,
        x: caretX(),
        y: h * 0.62,
        vx: (Math.random() - 0.5) * 80,
        vy: -40 - Math.random() * 50,
        rot: (Math.random() - 0.5) * 0.5,
        rv: 0,
        tx: 0,
        ty: 0,
      })
      taptic(9)
    } else if (next.length < letters.length) {
      letters.pop()
      taptic(6)
    }
  })

  trackPointers(wrap, {
    touchAction: preview ? 'pan-y' : 'none',
    down({ n, arr }) {
      if (n === 1) {
        magnetGrab = true
        input.focus()
      }
      void arr
    },
    move({ n, pinch, rotate, dx, dy, arr }) {
      if (n >= 2) {
        magnetGrab = false
        field.scale = clamp(field.scale * pinch, 0.7, 1.8)
        field.rot += rotate
        field.ox += dx * 0.4
        field.oy += dy * 0.4
        taptic(6)
        return
      }
      if (n === 1 && magnetGrab && arr[0]) {
        field.ox = arr[0].x - caretX()
        field.oy = arr[0].y - h * 0.55
      }
    },
    up({ n }) {
      if (n === 0) magnetGrab = false
    },
  })

  const stop = whenVisible(wrap, (dt) => {
    const magnetX = still
      ? (letters[2]?.x ?? w * 0.45)
      : caretX() + field.ox * 0.15
    const magnetY = still
      ? (letters[2]?.y ?? h * 0.48) - 6
      : h * 0.62 + field.oy * 0.1

    letters.forEach((L, i) => {
      if (still) return
      L.tx = 22 + i * 15
      L.ty = h * 0.62
      const k = reduced ? 70 : 34
      L.vx += (L.tx - L.x) * k * dt
      L.vy += (L.ty - L.y) * k * dt
      if (focused) {
        const pull = 12 / (1 + Math.hypot(magnetX - L.x, magnetY - L.y) / 40)
        L.vx += (magnetX - L.x) * pull * dt
        L.vy += (magnetY - L.y) * pull * dt
      }
      L.vx *= Math.exp(-8 * dt)
      L.vy *= Math.exp(-8 * dt)
      L.x += L.vx * dt
      L.y += L.vy * dt
      const ang = Math.atan2(magnetY - L.y, magnetX - L.x)
      L.rot = lerp(L.rot, focused ? ang * 0.18 : 0, 0.1)
    })

    dust.forEach((d) => {
      if (focused) {
        d.vx += (magnetX - d.x) * 5 * dt
        d.vy += (magnetY - 20 - d.y) * 3 * dt
        d.life -= dt * 0.4
      } else {
        d.x += Math.sin(d.p + performance.now() / 900) * 6 * dt
        d.y += Math.cos(d.p * 1.3 + performance.now() / 1200) * 5 * dt
        d.x = lerp(d.x, d.hx, 0.012)
        d.y = lerp(d.y, d.hy, 0.012)
        d.life = lerp(d.life, 1, 0.05)
      }
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vx *= 0.95
      d.vy *= 0.95
    })

    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(w / 2 + field.ox * 0.2, h / 2 + field.oy * 0.2)
    ctx.rotate(field.rot)
    ctx.scale(field.scale, field.scale)
    ctx.translate(-w / 2, -h / 2)

    if (!letters.length) {
      ctx.font = '13px "IBM Plex Mono", monospace'
      dust.forEach((d) => {
        ctx.save()
        ctx.globalAlpha = clamp(d.life, 0, 0.75)
        ctx.fillStyle = '#3d6f88'
        ctx.translate(d.x, d.y)
        ctx.rotate(d.rot)
        ctx.fillText(d.ch, 0, 0)
        ctx.restore()
      })
    }

    ctx.fillStyle = '#b7ecff'
    ctx.font = `${still ? 42 : 22}px "Silkscreen", "IBM Plex Mono", monospace`
    letters.forEach((L) => {
      ctx.save()
      ctx.translate(L.x, L.y)
      ctx.rotate(L.rot)
      ctx.fillText(L.ch, 0, 0)
      ctx.restore()
    })

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 240)
    ctx.strokeStyle = '#e7f8ff'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(magnetX, magnetY - 18)
    ctx.lineTo(magnetX, magnetY + 8)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(magnetX, magnetY - 5, 3 + pulse * (focused ? 2 : 0.4), 0, Math.PI * 2)
    ctx.stroke()

    if (focused) {
      ctx.strokeStyle = 'rgba(183,236,255,0.35)'
      ctx.lineWidth = 1.1
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + performance.now() / 2000
        ctx.beginPath()
        ctx.moveTo(magnetX + Math.cos(ang) * 6, magnetY - 5 + Math.sin(ang) * 6)
        ctx.lineTo(magnetX + Math.cos(ang) * 28, magnetY - 5 + Math.sin(ang) * 18)
        ctx.stroke()
      }
    }
    ctx.restore()
  })

  const ro = new ResizeObserver(resize)
  ro.observe(wrap)
  return () => {
    stop()
    ro.disconnect()
  }
}

function makeDust(n) {
  const phrase = 'type something, or don’t'
  return Array.from({ length: n }, (_, i) => ({
    ch: phrase[i % phrase.length],
    x: 18 + (i * 17) % 280 + Math.random() * 10,
    y: 42 + (i % 5) * 16 + Math.random() * 8,
    hx: 22 + (i * 14) % 260,
    hy: 50 + (i % 4) * 18,
    vx: 0,
    vy: 0,
    rot: (Math.random() - 0.5) * 0.3,
    p: Math.random() * 7,
    life: 1,
  }))
}
