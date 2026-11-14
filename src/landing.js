import './styles.css'
import { fillStudio, withBase, specimens } from './chrome.js'
import { ditherToPhosphor } from './lib/dither.js'

const HOLD = 260
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

fillStudio()

const grid = document.getElementById('grid')
grid.innerHTML = specimens
  .map((s) => {
    const src = (ext) => withBase(`experiments/${s.slug}/still.${ext}`)
    const pic = (cls) => `
      <picture class="still-layer ${cls}">
        <source type="image/avif" srcset="${src('avif')}" />
        <source type="image/webp" srcset="${src('webp')}" />
        <img src="${src('jpg')}" alt="${s.title}. ${s.blurb}" draggable="false" width="1200" height="1200" decoding="async" ${s.featured ? 'fetchpriority="high"' : ''} />
      </picture>`
    return `
    <li class="tile ${s.featured ? 'tile-feature' : ''}">
      <span class="num">${s.n}</span>
      <a class="tile-hit" href="${withBase(`specimens/${s.slug}.html`)}" draggable="false">
        <div class="still">${pic('still-bw')}${pic('still-color')}</div>
        <div class="tile-label">
          <h2>${s.title}</h2>
          <p>${s.blurb}</p>
        </div>
      </a>
    </li>`
  })
  .join('')

grid.querySelectorAll('.tile').forEach((tile) => {
  const bw = tile.querySelector('.still-bw img')
  if (bw) ditherToPhosphor(bw)
  bindTile(tile)
})

function bindTile(tile) {
  const hit = tile.querySelector('.tile-hit')
  const color = tile.querySelector('.still-color')
  let r = 0
  let target = 0
  let anim = 0
  let mx = 48
  let my = 42
  let held = false
  let moved = false
  let suppress = false
  let sx = 0
  let sy = 0
  let timer = 0
  let ptype = 'mouse'
  let t0 = 0

  const cover = () => {
    const b = tile.getBoundingClientRect()
    return Math.hypot(b.width, b.height) * 0.92
  }

  const paint = () => {
    color.style.setProperty('--mx', `${mx}%`)
    color.style.setProperty('--my', `${my}%`)
    color.style.setProperty('--r', `${r}px`)
  }

  const tick = () => {
    anim = 0
    if (target > 0) {
      const t = performance.now() - t0
      r = reduced ? target : target * (1 - Math.exp(-t / 280))
      if (r < target - 2) anim = requestAnimationFrame(tick)
      else r = target
    } else {
      r += (0 - r) * (reduced ? 1 : 0.22)
      if (r > 0.6) anim = requestAnimationFrame(tick)
      else r = 0
    }
    paint()
  }

  const local = (e) => {
    const b = tile.getBoundingClientRect()
    mx = ((e.clientX - b.left) / b.width) * 100
    my = ((e.clientY - b.top) / b.height) * 100
  }

  const bloom = (e) => {
    local(e)
    if (target === 0) t0 = performance.now()
    target = cover()
    if (!anim) anim = requestAnimationFrame(tick)
  }

  const dim = () => {
    target = 0
    tile.classList.remove('is-lit')
    if (!anim) anim = requestAnimationFrame(tick)
  }

  hit.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') {
      tile.classList.add('is-lit')
      bloom(e)
    }
  })
  hit.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      bloom(e)
      return
    }
    if (!timer && !held) return
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 14) {
      moved = true
      clearTimeout(timer)
      timer = 0
    }
    if (held) bloom(e)
  })
  hit.addEventListener('pointerdown', (e) => {
    if (e.button) return
    held = false
    moved = false
    suppress = false
    ptype = e.pointerType
    sx = e.clientX
    sy = e.clientY
    local(e)
    paint()
    timer = window.setTimeout(() => {
      held = true
      suppress = true
      tile.classList.add('is-lit')
      bloom(e)
      try {
        navigator.vibrate?.(10)
      } catch {
        /* ignore */
      }
    }, HOLD)
  })
  hit.addEventListener('pointerup', () => {
    clearTimeout(timer)
    timer = 0
    if (held && ptype !== 'mouse') dim()
  })
  hit.addEventListener('pointercancel', () => {
    clearTimeout(timer)
    timer = 0
    dim()
  })
  hit.addEventListener('pointerleave', () => {
    clearTimeout(timer)
    timer = 0
    held = false
    dim()
  })
  hit.addEventListener('click', (e) => {
    if (suppress || moved) e.preventDefault()
  })
  hit.addEventListener('contextmenu', (e) => e.preventDefault())
  hit.addEventListener('dragstart', (e) => e.preventDefault())
}
