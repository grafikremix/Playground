import { clamp, lerp, reduced, spring, whenVisible } from '../lib/motion.js'
import { trackPointers } from '../lib/gestures.js'
import { taptic, tapticPattern } from '../lib/haptics.js'

function feel(t) {
  const s = Math.sign(t) || 1
  return s * Math.pow(Math.abs(t), 0.42)
}

export function mount(el, { preview = false, still = false } = {}) {
  el.innerHTML = `
    <div class="elastic">
      <div class="readout">50</div>
      <svg viewBox="0 0 520 150" preserveAspectRatio="none">
        <path class="band" fill="none" stroke="#b7ecff" stroke-width="3.2" stroke-linecap="round"/>
        <circle class="peg l" cx="36" cy="78" r="5" fill="#b7ecff"/>
        <circle class="peg r" cx="484" cy="78" r="5" fill="#b7ecff"/>
        <circle class="knob" cx="260" cy="78" r="14" fill="#02050c" stroke="#e7f8ff" stroke-width="2.6"/>
      </svg>
    </div>
  `
  const wrap = el.querySelector('.elastic')
  const band = wrap.querySelector('.band')
  const knob = wrap.querySelector('.knob')
  const readout = wrap.querySelector('.readout')
  const svg = wrap.querySelector('svg')

  let value = still ? 0.7 : 0.5
  let display = still ? 0.7 : 0.5
  let vel = still ? 0 : 0
  let dragging = !!still
  let heldExtreme = 0
  let twang = still ? 1 : 0
  let stretchMul = still ? 2.4 : 1
  if (still) {
    band.setAttribute('stroke-width', '8')
    band.setAttribute(
      'd',
      'M 36 78 Q 150 150 250 100 Q 360 28 484 78',
    )
    knob.setAttribute('cx', '250')
    knob.setAttribute('cy', '100')
    knob.setAttribute('r', '18')
  }

  const left = 36
  const right = 484
  const midY = 78

  function vOfClientX(clientX) {
    const r = svg.getBoundingClientRect()
    const x = ((clientX - r.left) / r.width) * 520
    return clamp((x - left) / (right - left), 0, 1)
  }

  trackPointers(wrap, {
    touchAction: preview ? 'pan-y' : 'none',
    down({ n }) {
      dragging = n === 1
      if (n === 1) taptic(8)
    },
    move({ n, event, pinch }) {
      if (n >= 2) {
        stretchMul = clamp(stretchMul * pinch, 0.7, 1.8)
        taptic(6)
        return
      }
      if (n === 1 && dragging) {
        const linear = vOfClientX(event.clientX)
        const fromMid = (linear - 0.5) * 2
        const power = 0.42 / stretchMul
        const mapped = 0.5 + Math.sign(fromMid) * Math.pow(Math.abs(fromMid), power) * 0.5
        value = clamp(mapped, 0, 1)
        if (value < 0.12 || value > 0.88) {
          heldExtreme += 0.016
          if (Math.round(heldExtreme * 8) !== Math.round((heldExtreme - 0.016) * 8)) taptic(5)
        } else heldExtreme = 0
      }
    },
    up({ n, flick }) {
      if (n > 0) return
      dragging = false
      const extreme = display < 0.12 || display > 0.88
      if (extreme && heldExtreme < (reduced ? 0.05 : 0.4)) {
        twang = 1
        value = display < 0.5 ? 0.34 : 0.66
        tapticPattern([0, 12, 40, 18])
      } else if (flick > 800) {
        taptic(10)
      }
      heldExtreme = 0
    },
  })

  const stop = whenVisible(wrap, (dt) => {
    if (still) {
      band.setAttribute('stroke-width', '8')
      band.setAttribute('d', 'M 36 78 Q 150 150 250 100 Q 360 28 484 78')
      knob.setAttribute('cx', '250')
      knob.setAttribute('cy', '100')
      readout.textContent = '84'
      return
    }
    if (dragging) {
      display = lerp(display, value, reduced ? 0.5 : 0.3)
      vel = 0
    } else if (twang) {
      const [p, v] = spring(display, vel, value, dt, 240, 7)
      display = p
      vel = v
      twang *= Math.exp(-1.1 * dt)
      if (Math.abs(display - value) < 0.003 && Math.abs(vel) < 0.04) twang = 0
    } else {
      const [p, v] = spring(display, vel, value, dt, 140, 14)
      display = p
      vel = v
    }

    const x = lerp(left, right, display)
    const stretch = Math.abs(display - 0.5) * 2
    const sag = (1 - stretch) * 10 * stretchMul + Math.sin(performance.now() / 50) * twang * 8
    const y = midY + (dragging ? 10 : 0)
    const c1x = lerp(left, x, 0.5)
    const c2x = lerp(x, right, 0.5)
    band.setAttribute(
      'd',
      `M ${left} ${midY} Q ${c1x} ${midY + sag + 16} ${x} ${y} Q ${c2x} ${midY + sag + 16} ${right} ${midY}`,
    )
    band.setAttribute('stroke-width', String((3.4 - stretch * 1.4) / stretchMul))
    knob.setAttribute('cx', x)
    knob.setAttribute('cy', y)
    readout.textContent = String(Math.round(display * 100))
    svg.setAttribute('aria-valuenow', readout.textContent)
    void feel
  })

  svg.setAttribute('role', 'slider')
  svg.setAttribute('aria-valuemin', '0')
  svg.setAttribute('aria-valuemax', '100')
  svg.setAttribute('tabindex', '0')
  svg.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.08 : 0.03
    if (e.key === 'ArrowRight') value = clamp(value + step, 0, 1)
    if (e.key === 'ArrowLeft') value = clamp(value - step, 0, 1)
  })

  return stop
}
