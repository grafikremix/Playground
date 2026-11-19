import './styles.css'
import { withBase, specimens } from './chrome.js'

const HOLD = 350
const MOVE = 14
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const grid = document.getElementById('grid')
grid.innerHTML = specimens
  .map((s) => {
    const src = (ext) => withBase(`experiments/${s.slug}/still.${ext}`)
    return `
    <li class="tile ${s.featured ? 'tile-feature' : ''}">
      <span class="num">Idea ${s.idea}</span>
      <a class="tile-hit" href="${withBase(`specimens/${s.slug}.html`)}" draggable="false">
        <div class="still">
          <picture class="still-layer">
            <source type="image/avif" srcset="${src('avif')}" />
            <source type="image/webp" srcset="${src('webp')}" />
            <img src="${src('jpg')}" alt="${s.title}. ${s.blurb}" draggable="false" width="1200" height="1200" decoding="async" ${s.featured ? 'fetchpriority="high"' : ''} />
          </picture>
        </div>
        <div class="tile-label">
          <h2>${s.title}</h2>
          <p>${s.blurb}</p>
        </div>
      </a>
    </li>`
  })
  .join('')

let peekTile = null

function stopPeek() {
  if (!peekTile) return
  const tile = peekTile
  const iframe = tile.querySelector('.tile-peek')
  tile.classList.remove('is-peek')
  peekTile = null
  if (!iframe) return
  iframe.src = 'about:blank'
  iframe.remove()
}

function startPeek(tile) {
  if (reduced || peekTile === tile) return
  stopPeek()
  const hit = tile.querySelector('.tile-hit')
  const url = new URL(hit.href, location.href)
  url.searchParams.set('peek', '1')
  const iframe = document.createElement('iframe')
  iframe.className = 'tile-peek'
  iframe.sandbox = 'allow-scripts allow-same-origin'
  iframe.tabIndex = -1
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('allow', '')
  iframe.src = url.href
  hit.appendChild(iframe)
  peekTile = tile
  requestAnimationFrame(() => tile.classList.add('is-peek'))
}

grid.querySelectorAll('.tile').forEach(bindTile)

function bindTile(tile) {
  const hit = tile.querySelector('.tile-hit')
  let timer = 0
  let sx = 0
  let sy = 0
  let moved = false
  let holdPeek = false
  let pressed = false

  const arm = (fromHold) => {
    if (reduced) return
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = 0
      if (fromHold) holdPeek = true
      startPeek(tile)
    }, HOLD)
  }

  const disarm = () => {
    clearTimeout(timer)
    timer = 0
  }

  hit.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !pressed) arm(false)
  })

  hit.addEventListener('pointerdown', (e) => {
    if (e.button) return
    pressed = true
    moved = false
    holdPeek = false
    sx = e.clientX
    sy = e.clientY
    try {
      hit.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    arm(true)
  })

  hit.addEventListener('pointermove', (e) => {
    if (!pressed && e.pointerType === 'mouse') return
    if (!pressed) return
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE) {
      moved = true
      disarm()
      if (holdPeek) stopPeek()
    }
  })

  const endPress = () => {
    pressed = false
    disarm()
    if (holdPeek) stopPeek()
  }

  hit.addEventListener('pointerup', endPress)
  hit.addEventListener('pointercancel', endPress)
  hit.addEventListener('pointerleave', () => {
    if (!pressed) {
      disarm()
      if (peekTile === tile) stopPeek()
    }
  })
  hit.addEventListener('lostpointercapture', () => {
    if (pressed) endPress()
  })
  hit.addEventListener('click', (e) => {
    if (holdPeek || moved) e.preventDefault()
    holdPeek = false
    moved = false
  })
  hit.addEventListener('contextmenu', (e) => e.preventDefault())
  hit.addEventListener('dragstart', (e) => e.preventDefault())
}
