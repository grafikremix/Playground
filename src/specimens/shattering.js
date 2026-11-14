import { clamp, reduced, whenVisible } from '../lib/motion.js'
import { trackPointers } from '../lib/gestures.js'
import { taptic, tapticPattern } from '../lib/haptics.js'

const pile = []

function poly(w, h) {
  const cuts = 5 + Math.floor(Math.random() * 4)
  const pts = []
  for (let i = 0; i < cuts; i++) {
    const a = (i / cuts) * Math.PI * 2 + Math.random() * 0.4
    const r = 0.35 + Math.random() * 0.65
    pts.push([Math.cos(a) * w * r, Math.sin(a) * h * r])
  }
  return pts
}

export function mount(el, { preview = false, still = false } = {}) {
  el.innerHTML = `
    <div class="shatter-ui">
      <button class="open-btn" type="button">Ask a question you will skip</button>
    </div>
  `
  const ui = el.querySelector('.shatter-ui')
  const frame = el.closest('.stage-frame') || el
  const field =
    document.getElementById('shard-field') ||
    (() => {
      const f = document.createElement('div')
      f.className = 'shard-field'
      f.id = preview || still ? '' : 'shard-field'
      if (preview || still) {
        f.style.position = 'absolute'
        f.style.inset = '0'
        f.style.zIndex = '2'
        frame.style.position = 'relative'
        frame.appendChild(f)
      } else document.body.appendChild(f)
      return f
    })()

  let layer = null
  let fieldScale = 1
  let fieldRot = 0
  const pilePts = new Map()
  let lastPileDist = 0
  let lastPileAngle = 0

  function applyPileGesture() {
    const arr = [...pilePts.values()]
    if (arr.length < 2) return
    const dist = Math.hypot(arr[1].x - arr[0].x, arr[1].y - arr[0].y)
    const angle = Math.atan2(arr[1].y - arr[0].y, arr[1].x - arr[0].x)
    if (lastPileDist > 8) {
      fieldScale = clamp(fieldScale * (dist / lastPileDist), 0.6, 2.2)
      fieldRot += angle - lastPileAngle
      field.style.transform = `scale(${fieldScale}) rotate(${fieldRot}rad)`
      field.style.transformOrigin = '50% 80%'
      taptic(5)
    }
    lastPileDist = dist
    lastPileAngle = angle
  }

  function open() {
    if (layer) return
    layer = document.createElement('div')
    layer.className = 'modal-layer'
    layer.innerHTML = `
      <div class="modal-card" role="dialog" aria-labelledby="m-title">
        <h3 id="m-title">Skip this one?</h3>
        <p>A wall label, a typeface, a date. Decide later, which is to say never.</p>
        <div class="modal-actions">
          <button type="button" data-keep>Keep it open</button>
          <button type="button" class="ghost-btn" data-skip>Not now</button>
        </div>
      </div>
    `
    frame.appendChild(layer)
    layer.querySelector('[data-keep]').addEventListener('click', () => {
      taptic(8)
      layer.remove()
      layer = null
    })
    const card = layer.querySelector('.modal-card')
    const skip = () => shatter(card)
    layer.querySelector('[data-skip]').addEventListener('click', skip)
    trackPointers(card, {
      down() {},
      move() {},
      up({ flick }) {
        if (flick > 700) shatter(card)
      },
    })
  }

  function shatter(card) {
    const r = card.getBoundingClientRect()
    const host = preview ? field.getBoundingClientRect() : { left: 0, top: 0 }
    layer.remove()
    layer = null
    tapticPattern([0, 12, 30, 24, 40, 10])

    const n = reduced ? 6 : 14
    for (let i = 0; i < n; i++) {
      const w = 28 + Math.random() * 46
      const h = 22 + Math.random() * 40
      const pts = poly(w, h)
      const s = {
        x: r.left - host.left + r.width * Math.random(),
        y: r.top - host.top + r.height * Math.random(),
        vx: (Math.random() - 0.5) * 380,
        vy: -80 - Math.random() * 240,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 8,
        w,
        h,
        pts,
        settled: false,
      }
      const node = document.createElement('div')
      node.className = 'shard'
      const fill = Math.random() > 0.5 ? 'rgba(183,236,255,0.92)' : 'rgba(127,182,204,0.78)'
      node.style.cssText = `
        width:${w}px;height:${h}px;left:0;top:0;
        background:${fill};
        clip-path: polygon(${pts.map((p) => `${p[0] + w / 2}px ${p[1] + h / 2}px`).join(',')});
        border: 1.5px solid rgba(231,248,255,0.85);
        box-shadow: 0 0 14px rgba(183,236,255,0.35);
        opacity: 1;
      `
      field.appendChild(node)
      s.node = node
      pile.push(s)

      trackPointers(node, {
        down({ arr, event }) {
          s.settled = false
          s.held = true
          pilePts.set(event.pointerId, { x: arr[0]?.cx ?? 0, y: arr[0]?.cy ?? 0 })
          lastPileDist = 0
          taptic(6)
        },
        move({ dx, dy, n: pn, event, arr }) {
          pilePts.set(event.pointerId, { x: event.clientX, y: event.clientY })
          if (pilePts.size >= 2) {
            applyPileGesture()
            return
          }
          if (pn >= 2) return
          s.x += dx
          s.y += dy
          s.vx = dx * 40
          s.vy = dy * 40
          void arr
        },
        up({ vx, vy, event }) {
          s.held = false
          pilePts.delete(event.pointerId)
          lastPileDist = 0
          s.vx = vx * 0.25
          s.vy = vy * 0.25
        },
      })
    }
  }

  ui.querySelector('.open-btn').addEventListener('click', () => {
    taptic(8)
    open()
  })

  function spawnStillShards() {
    const hostW = 720
    const hostH = 720
    const n = 12
    const fills = ['#b7ecff', '#e7f8ff', '#7fb6cc', '#b7ecff']
    for (let i = 0; i < n; i++) {
      const w = 88 + (i % 4) * 18
      const h = 70 + ((i + 2) % 3) * 22
      const pts = []
      const cuts = 6
      for (let k = 0; k < cuts; k++) {
        const a = (k / cuts) * Math.PI * 2 + i * 0.11
        const r = 0.52 + ((i + k) % 3) * 0.16
        pts.push([Math.cos(a) * w * r, Math.sin(a) * h * r])
      }
      const a = (i / n) * Math.PI * 2
      const s = {
        x: hostW * 0.5 + Math.cos(a) * 210 - w / 2,
        y: hostH * 0.5 + Math.sin(a) * 190 - h / 2,
        vx: 0,
        vy: 0,
        rot: a * 0.35,
        vr: 0,
        w,
        h,
        pts,
        settled: true,
      }
      const node = document.createElement('div')
      node.className = 'shard'
      node.style.cssText = `
        width:${w}px;height:${h}px;left:0;top:0;
        background:${fills[i % fills.length]};
        clip-path: polygon(${pts.map((p) => `${p[0] + w / 2}px ${p[1] + h / 2}px`).join(',')});
        border: 2px solid #e7f8ff;
        box-shadow: 0 0 22px rgba(183,236,255,0.55);
        opacity: 1;
      `
      field.appendChild(node)
      s.node = node
      pile.push(s)
      node.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}rad)`
    }
  }

  if (still) {
    ui.querySelector('.open-btn').style.visibility = 'hidden'
    spawnStillShards()
  }

  const bounds = () =>
    preview ? field.getBoundingClientRect() : { width: innerWidth, height: innerHeight }

  const stop = whenVisible(frame, (dt) => {
    const b = bounds()
    pile.forEach((s) => {
      if (s.held) {
        s.node.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}rad)`
        return
      }
      if (!s.settled) {
        s.vy += 980 * dt * 0.55
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.rot += s.vr * dt
        s.vx *= Math.exp(-0.6 * dt)
        const floor = (preview ? b.height : innerHeight) - 28
        if (s.y > floor) {
          s.y = floor
          s.vy *= -0.28
          s.vr *= 0.5
          if (Math.abs(s.vy) < 24) {
            s.settled = true
            s.vy = 0
            if (!still) s.node.style.opacity = '0.72'
          }
        }
      }
      s.node.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}rad)`
    })
  })

  return stop
}
