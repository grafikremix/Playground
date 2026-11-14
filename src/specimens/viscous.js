import { clamp, reduced, whenVisible } from '../lib/motion.js'
import { trackPointers } from '../lib/gestures.js'
import { taptic } from '../lib/haptics.js'

let uid = 0

export function mount(el, { preview = false, still = false } = {}) {
  const id = `goo-${uid++}`
  el.innerHTML = `
    <div class="viscous" role="switch" aria-checked="false" tabindex="0">
      <svg viewBox="0 0 400 180" aria-hidden="true">
        <defs>
          <filter id="${id}" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/>
          </filter>
        </defs>
        <rect class="well" x="40" y="58" width="320" height="64" rx="32" fill="rgba(28,23,18,0.05)" stroke="#1c1712" stroke-width="1.4"/>
        <g class="spin">
          <g class="blobs" filter="url(#${id})"></g>
        </g>
      </svg>
      <div class="readout">off</div>
    </div>
  `
  const wrap = el.querySelector('.viscous')
  const svg = wrap.querySelector('svg')
  const layer = wrap.querySelector('.blobs')
  const spin = wrap.querySelector('.spin')
  const readout = wrap.querySelector('.readout')

  const blobs = [
    { x: 110, y: 90, r: 28, vx: 0, vy: 0 },
    { x: 92, y: 84, r: 16, vx: 0, vy: 0 },
    { x: 124, y: 96, r: 14, vx: 0, vy: 0 },
    { x: 104, y: 102, r: 11, vx: 0, vy: 0 },
  ]
  const drops = []
  let on = !!still
  let dragging = false
  let pinch = still ? 1.28 : 1
  let rot = still ? 0.18 : 0
  let rotV = 0

  function toSvg(x, y) {
    const r = svg.getBoundingClientRect()
    return {
      x: ((x) / r.width) * 400,
      y: ((y) / r.height) * 180,
    }
  }

  function targetX() {
    return on ? 286 : 114
  }

  function splash(speed, dir) {
    const n = reduced ? 2 : 4 + Math.min(6, Math.floor(Math.abs(speed) / 180))
    const main = blobs[0]
    for (let i = 0; i < n; i++) {
      drops.push({
        x: main.x,
        y: main.y,
        r: 6 + Math.random() * 6,
        vx: dir * (40 + Math.random() * 80) + (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.6) * 70,
        life: 1,
      })
    }
    taptic(18)
  }

  if (still) {
    blobs.forEach((b) => {
      b.x += 160
    })
    splash(520, 1)
    readout.textContent = 'on'
    wrap.setAttribute('aria-checked', 'true')
  }

  function settle(fromFlick) {
    const mid = 200
    if (fromFlick) on = blobs[0].vx > 0 || (blobs[0].vx === 0 && blobs[0].x > mid)
    else on = blobs[0].x > mid
    wrap.setAttribute('aria-checked', String(on))
    readout.textContent = on ? 'on' : 'off'
    taptic(on ? 14 : 8)
  }

  trackPointers(wrap, {
    touchAction: preview ? 'pan-y' : 'none',
    down({ n, arr }) {
      dragging = n === 1
      if (n === 1) {
        const p = toSvg(arr[0].x, arr[0].y)
        blobs[0].x = p.x
      }
    },
    move({ n, arr, pinch: pz, rotate, vx }) {
      if (n >= 2) {
        dragging = false
        pinch = clamp(pinch * pz, 0.7, 1.65)
        rotV += rotate * 8
        taptic(8)
        return
      }
      if (n === 1 && dragging) {
        const p = toSvg(arr[0].x, arr[0].y)
        blobs[0].x = clamp(p.x, 70, 330)
        blobs[0].y = clamp(p.y, 70, 110)
        blobs[0].vx = vx * 0.35
      }
    },
    up({ flick, vx, n }) {
      if (n > 0) return
      const hard = flick > 520
      if (hard) splash(flick, Math.sign(vx) || 1)
      if (Math.abs(vx) > 90) {
        on = vx > 0
        wrap.setAttribute('aria-checked', String(on))
        readout.textContent = on ? 'on' : 'off'
        taptic(12)
      } else settle(false)
      dragging = false
    },
  })

  wrap.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      on = !on
      blobs[0].vx += on ? 90 : -90
      readout.textContent = on ? 'on' : 'off'
      wrap.setAttribute('aria-checked', String(on))
      taptic(12)
    }
  })

  const stop = whenVisible(wrap, (dt) => {
    const tx = dragging ? blobs[0].x : targetX()
    const ty = 90
    const k = reduced ? 70 : 38
    blobs.forEach((b, i) => {
      const wobble = Math.sin(performance.now() / 380 + i) * (4 + pinch * 2)
      if (!dragging || i) {
        b.vx += (tx + wobble - b.x) * k * dt
        b.vy += (ty - b.y) * k * dt
      }
      b.vx *= Math.exp(-6.5 * dt)
      b.vy *= Math.exp(-6.5 * dt)
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.x = clamp(b.x, 72, 328)
      b.y = clamp(b.y, 72, 108)
    })

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.vy += 50 * dt
      d.vx *= Math.exp(-2.4 * dt)
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.life -= dt * 0.5
      if (d.life <= 0 || d.x < 40 || d.x > 360) drops.splice(i, 1)
    }

    rot += rotV * dt
    rotV *= Math.exp(-2.2 * dt)
    spin.setAttribute('transform', `rotate(${(rot * 180) / Math.PI} 200 90)`)

    const fill = on ? '#d63a12' : '#2f5e56'
    const all = blobs.concat(drops)
    layer.innerHTML = all
      .map(
        (b) =>
          `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${(b.r * pinch).toFixed(1)}" fill="${fill}"/>`,
      )
      .join('')
    void preview
  })

  return stop
}
