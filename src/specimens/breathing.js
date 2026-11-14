import { clamp, reduced, whenVisible } from '../lib/motion.js'
import { onTilt, requestTilt } from '../lib/gestures.js'
import { taptic } from '../lib/haptics.js'

const PERIOD = 4200

export function mount(el, { preview = false, still = false } = {}) {
  el.innerHTML = `
    <div>
      <div class="lung-meter" aria-hidden="true"><i></i></div>
      <div class="breathing">
        <button class="breath-btn" type="button" data-act="send">Send proof</button>
        ${preview ? '' : '<button class="breath-btn alt" type="button" data-act="hold">Hold the show</button>'}
      </div>
      <div class="breath-status" aria-live="polite">wait for the exhale</div>
    </div>
  `
  const status = el.querySelector('.breath-status')
  const meter = el.querySelector('.lung-meter i')
  const btns = [...el.querySelectorAll('.breath-btn')]
  const lung = document.querySelector('.cursor-lung') || createLung()
  let tracking = false
  let tiltBias = 0
  let lastEdge = ''
  let lastMsg = 0
  let tiltOff = () => {}

  function phase(now) {
    if (still) {
      const t = 0.48
      const s = (1 - Math.cos(t * Math.PI * 2)) / 2
      return { t, s, inhaling: false, scale: 1.08 }
    }
    const t = ((now + tiltBias) % PERIOD) / PERIOD
    const s = (1 - Math.cos(t * Math.PI * 2)) / 2
    const inhaling = t < 0.5
    return { t, s, inhaling, scale: 1 + s * (reduced ? 0.02 : 0.07) }
  }

  function isExhale(now) {
    const { inhaling, t } = phase(now)
    return !inhaling && t >= 0.52
  }

  function fire(btn) {
    const act = btn.dataset.act
    status.textContent = act === 'send' ? 'sent on the breath out' : 'held, for now'
    lastMsg = performance.now()
    taptic(16)
    btn.animate([{ filter: 'none' }, { filter: 'contrast(1.2)' }, { filter: 'none' }], {
      duration: 400,
    })
  }

  function refuse(btn) {
    status.textContent = 'not yet'
    lastMsg = performance.now()
    taptic(7)
    btn.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-2.2deg)' },
        { transform: 'rotate(1.6deg)' },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 280, easing: 'ease-out' },
    )
  }

  async function maybeTilt() {
    const ok = await requestTilt()
    if (!ok) {
      status.textContent = 'tilt not granted. the breath is still yours.'
      lastMsg = performance.now()
      return
    }
    tiltOff()
    tiltOff = onTilt(({ beta }) => {
      tiltBias = clamp(beta, -40, 40) * 18
    })
    status.textContent = 'the room is breathing with you'
    lastMsg = performance.now()
  }

  btns.forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      tracking = true
      lung.style.display = 'block'
      lung.style.left = `${e.clientX}px`
      lung.style.top = `${e.clientY}px`
      btn.setPointerCapture?.(e.pointerId)
    })
    btn.addEventListener('pointermove', (e) => {
      if (!tracking) return
      lung.style.left = `${e.clientX}px`
      lung.style.top = `${e.clientY}px`
    })
    btn.addEventListener('pointerup', (e) => {
      tracking = false
      lung.style.display = 'none'
      if (reduced || isExhale(performance.now())) fire(btn)
      else refuse(btn)
      if (e.pointerType === 'touch' && !window._pgTiltAsked) {
        window._pgTiltAsked = true
        maybeTilt()
      }
    })
    btn.addEventListener('pointercancel', () => {
      tracking = false
      lung.style.display = 'none'
    })
  })

  const stage = el.closest('.stage-frame') || el
  stage.addEventListener('click', (e) => {
    if (e.target.closest('.breath-btn')) return
    if (!window._pgTiltAsked) {
      window._pgTiltAsked = true
      maybeTilt()
    }
  })

  const stop = whenVisible(el, (_dt, now) => {
    const { scale, inhaling, s } = phase(now)
    btns.forEach((btn) => {
      btn.style.transform = `scale(${scale})`
    })
    if (meter) meter.style.transform = `scale(${0.55 + s * 0.7})`
    if (tracking) {
      const r = 18 + s * 10
      lung.style.width = `${r * 2}px`
      lung.style.height = `${r * 2}px`
      lung.style.opacity = String(0.4 + s * 0.4)
    }
    const edge = inhaling ? 'in' : 'out'
    if (edge !== lastEdge) {
      lastEdge = edge
      if (!reduced) taptic(edge === 'out' ? 10 : 5)
    }
    if (now - lastMsg > 2200) status.textContent = inhaling ? 'inhale' : 'exhale'
  })

  return () => {
    stop()
    tiltOff()
    lung.style.display = 'none'
  }
}

function createLung() {
  const d = document.createElement('div')
  d.className = 'cursor-lung'
  document.body.appendChild(d)
  return d
}
