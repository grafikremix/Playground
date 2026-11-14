import { clamp, reduced, whenVisible } from '../lib/motion.js'
import { taptic, tapticPattern } from '../lib/haptics.js'

const CHOICES = [
  { id: 'reprint', label: 'Reprint the poster' },
  { id: 'leave', label: 'Leave it' },
  { id: 'burn', label: 'Burn the plate' },
]

export function mount(el, { preview = false, still = false } = {}) {
  const items = (preview ? CHOICES.slice(0, 2) : CHOICES).map((c, i) => ({
    ...c,
    pressure: still && i === 0 ? 0.92 : still && i === 1 ? 0.22 : 0,
    selected: still && i === 0,
  }))

  el.innerHTML = `<div class="pressure" role="radiogroup" aria-label="Pressure radios"></div>`
  const root = el.querySelector('.pressure')

  root.innerHTML = items
    .map(
      (it) => `
      <button class="p-opt" type="button" role="radio" aria-checked="false" data-id="${it.id}">
        <span class="p-disc"><canvas></canvas></span>
        <span class="p-label">${it.label}</span>
        <span class="p-meta">pencil</span>
      </button>`,
    )
    .join('')

  const canvases = new Map()
  root.querySelectorAll('.p-opt').forEach((btn) => {
    const it = items.find((x) => x.id === btn.dataset.id)
    const canvas = btn.querySelector('canvas')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = 48 * dpr
    canvas.height = 48 * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    canvases.set(it.id, { btn, ctx, meta: btn.querySelector('.p-meta') })

    let holding = false
    let from = 0
    let t0 = 0
    let undoing = false

    const start = (e) => {
      e.preventDefault()
      holding = true
      t0 = performance.now()
      undoing = it.selected && it.pressure > 0.62
      from = it.pressure
      btn.setPointerCapture?.(e.pointerId)
      taptic(8)
    }
    const end = () => {
      if (!holding) return
      holding = false
      const dur = (performance.now() - t0) / (reduced ? 280 : 1100)
      if (undoing) {
        const need = it.pressure
        if (dur >= need * 0.9) {
          it.selected = false
          it.pressure = 0
          taptic(14)
        } else {
          it.pressure = from
          taptic(6)
        }
      } else {
        it.pressure = clamp(Math.max(it.pressure, dur), 0.08, 1)
        items.forEach((o) => {
          if (o.id !== it.id) {
            if (o.pressure > 0.62) {
              /* firm choice stays until held */
            } else {
              o.selected = false
              o.pressure = 0
            }
          }
        })
        const blocked = items.some((o) => o.id !== it.id && o.selected && o.pressure > 0.62)
        if (blocked) {
          it.selected = false
          tapticPattern([0, 8, 30, 8])
        } else {
          it.selected = true
          taptic(it.pressure > 0.62 ? 22 : 10)
        }
      }
      syncAria()
    }

    btn.addEventListener('pointerdown', start)
    btn.addEventListener('pointerup', end)
    btn.addEventListener('pointercancel', end)
    btn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        it.pressure = clamp(it.pressure + 0.25, 0.1, 1)
        items.forEach((o) => {
          if (o.id !== it.id && o.pressure <= 0.62) {
            o.selected = false
            o.pressure = 0
          }
        })
        it.selected = true
        syncAria()
        taptic(12)
      }
    })

    it._tick = (now) => {
      if (!holding) return
      const dur = (now - t0) / (reduced ? 280 : 1100)
      if (undoing) it.pressure = clamp(from * (1 - dur / Math.max(0.2, from)), 0, 1)
      else it.pressure = clamp(dur, 0, 1)
      if (Math.floor(it.pressure * 8) !== Math.floor((it.pressure - 0.016) * 8)) taptic(5)
    }
  })

  function syncAria() {
    items.forEach((it) => {
      const { btn } = canvases.get(it.id)
      btn.setAttribute('aria-checked', String(it.selected))
    })
  }

  const stop = whenVisible(root, (_dt, now) => {
    items.forEach((it) => {
      it._tick?.(now)
      const { ctx, meta } = canvases.get(it.id)
      draw(ctx, it.pressure, it.selected)
      meta.textContent =
        it.pressure > 0.78 ? 'stamp' : it.pressure > 0.4 ? 'ink' : it.pressure > 0.08 ? 'pencil' : '—'
    })
  })

  return stop
}

function draw(ctx, p, on) {
  ctx.clearRect(0, 0, 48, 48)
  ctx.fillStyle = '#02050c'
  ctx.fillRect(0, 0, 48, 48)
  if (p <= 0.02 && !on) return

  if (p < 0.45) {
    ctx.strokeStyle = `rgba(183,236,255,${0.35 + p})`
    ctx.lineWidth = 1.2
    for (let i = 0; i < 12 * p + 3; i++) {
      ctx.beginPath()
      ctx.moveTo(10 + Math.random() * 28, 8 + Math.random() * 32)
      ctx.lineTo(12 + Math.random() * 26, 10 + Math.random() * 30)
      ctx.stroke()
    }
  } else {
    ctx.fillStyle = `rgba(183,236,255,${0.45 + p * 0.5})`
    ctx.beginPath()
    ctx.arc(24, 24, 6 + p * 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#02050c'
    ctx.font = `${10 + p * 8}px "Silkscreen", "IBM Plex Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (p > 0.7) ctx.fillText('•', 24, 25)
    ctx.strokeStyle = `rgba(231,248,255,${Math.min(1, (p - 0.6) * 1.8)})`
    ctx.lineWidth = 2.4
    if (p > 0.78) ctx.strokeRect(6, 6, 36, 36)
  }
}
