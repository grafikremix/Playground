import { reduced, whenVisible } from '../lib/motion.js'
import { trackPointers } from '../lib/gestures.js'
import { taptic } from '../lib/haptics.js'

const TASKS = [
  'Rinse the brushes',
  'Scan the contact sheet',
  'Call the framer',
  'Buy tracing paper',
  'Stretch the canvas',
  'Write the wall text',
]

export function mount(el, { preview = false, still = false } = {}) {
  const items = (preview ? TASKS.slice(0, 4) : TASKS).map((label, i) => ({
    id: i,
    label,
    done: false,
    drips: [],
    tick: 0,
  }))

  el.innerHTML = `<div class="gravity" role="list"></div>`
  const root = el.querySelector('.gravity')

  function flip(mutate) {
    const nodes = [...root.querySelectorAll('.g-item')]
    const first = new Map(nodes.map((n) => [n.dataset.id, n.getBoundingClientRect()]))
    mutate()
    ;[...root.querySelectorAll('.g-item')].forEach((n) => {
      const a = first.get(n.dataset.id)
      if (!a) return
      const b = n.getBoundingClientRect()
      const dy = a.top - b.top
      if (Math.abs(dy) < 1 || reduced) return
      n.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: 720, easing: 'cubic-bezier(.2,.75,.2,1)' },
      )
    })
  }

  function paint() {
    const ordered = [...items].sort((a, b) => Number(a.done) - Number(b.done) || a.id - b.id)
    root.innerHTML = ordered
      .map(
        (it) => `
      <div class="g-item ${it.done ? 'done' : ''}" data-id="${it.id}" role="listitem">
        <button class="g-box" aria-pressed="${it.done}" aria-label="${it.label}"></button>
        <div class="label">${it.label}</div>
      </div>`,
      )
      .join('')

    root.querySelectorAll('.g-item').forEach((row) => {
      const id = Number(row.dataset.id)
      const it = items.find((x) => x.id === id)
      const btn = row.querySelector('.g-box')
      const c = document.createElement('canvas')
      btn.appendChild(c)
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      c.width = 30 * dpr
      c.height = 52 * dpr
      const ctx = c.getContext('2d')
      ctx.scale(dpr, dpr)
      it._ctx = ctx
      it._row = row

      btn.addEventListener('click', () => toggle(it))

      let startY = 0
      trackPointers(row, {
        touchAction: 'pan-y',
        down({ arr }) {
          startY = arr[0]?.y ?? 0
        },
        move() {},
        up({ vy, n }) {
          if (n > 0) return
          if (vy > 420 && !it.done) {
            toggle(it)
            taptic(20)
          } else if (vy < -420 && it.done) {
            toggle(it)
            taptic(10)
          } else if (Math.abs((row.getBoundingClientRect().height) ) && false) {
            void startY
          }
        },
      })
    })
  }

  function toggle(it) {
    flip(() => {
      it.done = !it.done
      if (it.done) {
        it.tick = 0
        it.drips = [{ x: 14, y: 16, vy: 10, len: 0, alive: true }]
        taptic(12)
      } else {
        it.drips = []
        it.tick = 0
        taptic(7)
      }
      paint()
    })
  }

  if (still) {
    ;[0, 2, 4].forEach((id) => {
      const it = items.find((x) => x.id === id)
      if (it) {
        it.done = true
        it.tick = 1
        it.drips = [{ x: 14, y: 16, vy: 16, len: 26, alive: true }]
      }
    })
  }
  paint()

  const stop = whenVisible(root, (dt) => {
    items.forEach((it) => {
      if (!it._ctx) return
      const ctx = it._ctx
      ctx.clearRect(0, 0, 30, 52)
      if (it.done) {
        it.tick = Math.min(1, it.tick + dt / (reduced ? 0.1 : 0.26))
        ctx.strokeStyle = '#b7ecff'
        ctx.lineWidth = 2.4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(7, 12)
        ctx.lineTo(7 + 5 * it.tick, 12 + 6 * it.tick)
        if (it.tick > 0.42) {
          const t = (it.tick - 0.42) / 0.58
          ctx.lineTo(12 + 8 * t, 18 - 9 * t)
        }
        ctx.stroke()
      }
      it.drips.forEach((d) => {
        if (!d.alive) return
        d.vy += 46 * dt
        d.len += d.vy * dt
        if (d.len > 30) d.alive = false
        ctx.strokeStyle = 'rgba(183,236,255,.7)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x, d.y + d.len)
        ctx.stroke()
        ctx.fillStyle = '#b7ecff'
        ctx.beginPath()
        ctx.ellipse(d.x, d.y + d.len, 1.7, 2.5, 0, 0, Math.PI * 2)
        ctx.fill()
      })
      if (it.done && it.drips.every((d) => !d.alive) && Math.random() < (reduced ? 0 : 0.01)) {
        it.drips.push({
          x: 12 + Math.random() * 4,
          y: 16,
          vy: 8,
          len: 0,
          alive: true,
        })
      }
    })
  })

  return stop
}
