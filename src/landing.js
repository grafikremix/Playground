import './styles.css'
import { withBase, specimens } from './chrome.js'
import { watchBuild } from './lib/fresh.js'
import { mountCrt } from './lib/crt.js'
import { mountTronBg } from './lib/tron-bg.js'
import { canPlay, tone } from './lib/audio.js'

watchBuild()
mountCrt()
mountTronBg()

const TITLE = 'Radley’s\nAI Playground'
const LEDES = [
  'An interactive AI playground for my random ideas. My only rule: I prompt once and allow myself just one edit. Most ideas are from me but sometimes I’ll have a special guest!',
  'Random ideas from my head, made interactive with AI. One prompt, one edit, that’s the rule. Mostly mine, with the occasional special guest.',
  'My interactive AI playground. I get one prompt and one edit per idea, no more. Most ideas are mine. Some come from special guests.',
  'Ideas I dream up, built by AI from a single prompt. One edit allowed, then it ships. Now and then a special guest takes a turn.',
  'A playground for whatever pops into my head. I prompt once, edit once, and let AI build the rest. Special guests welcome.',
  'One idea. One prompt. One edit, max. Mostly from me, sometimes from a special guest, all brought to life with AI.',
  'Straight out of my head and into the browser. One prompt, one edit, built by AI. Special guests drop in sometimes.',
  'I think it up, prompt it once, and AI builds it. One edit allowed. Every so often a special guest gets the keyboard.',
  'A sandbox for my stray ideas. Each one gets a single prompt and a single edit. Mostly me, occasionally a special guest.',
  'Half-baked ideas, fully playable. One prompt from me, one edit at most, AI does the building. Guests welcome.',
  'My rule is simple: one prompt, one edit, ship it. The ideas are mine, the building is AI’s, and sometimes a special guest joins in.',
  'Little experiments from my brain, brought to life with AI. One prompt each. One edit, tops. Special guests now and then.',
  'Whatever I’m daydreaming about, built in one prompt. I allow myself one edit. Some days a special guest takes over.',
  'An interactive notebook of random ideas. I prompt, AI builds, I get one edit. Mostly mine, plus the odd special guest.',
  'Ideas first, AI second. One prompt per idea and only one edit allowed. Special guests appear from time to time.',
  'Playable ideas from my head. I write the prompt once and edit once. Every now and then a special guest writes one.',
  'No drafts, no redos. One prompt, one edit, built by AI. Mostly my ideas, sometimes a special guest’s.',
  'A place where my random thoughts become interactive. One prompt, one edit, AI handles the rest. Special guests included.',
  'I bring the ideas, AI brings them to life. One prompt and one edit per idea. Occasionally a special guest brings one too.',
  'Random ideas, one take each. I prompt once, allow one edit, and let it be. Most are mine. Some are from special guests.',
]
const LEDE_KEY = 'playground-lede-last'
const INTRO_KEY = 'playground-intro'

function todayStamp() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function readIntro() {
  try {
    const raw = localStorage.getItem(INTRO_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (o && typeof o.date === 'string' && typeof o.lede === 'string' && o.lede) return o
  } catch {
    /* private mode or bad json */
  }
  return null
}

function writeIntro(date, lede) {
  try {
    localStorage.setItem(INTRO_KEY, JSON.stringify({ date, lede }))
    localStorage.setItem(LEDE_KEY, lede)
  } catch {
    /* private mode */
  }
}

function pickLede() {
  let last = ''
  try {
    last = localStorage.getItem(LEDE_KEY) || ''
  } catch {
    /* private mode */
  }
  const pool = LEDES.filter((s) => s !== last)
  const next = (pool.length ? pool : LEDES)[(Math.random() * (pool.length ? pool.length : LEDES.length)) | 0]
  return next
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

let lastTick = 0
function keyTick() {
  if (!canPlay()) return
  const now = performance.now()
  if (now - lastTick < 32) return
  lastTick = now
  tone({ type: 'square', freq: 1880 + Math.random() * 420, duration: 0.016, peak: 0.012 })
}

function cadence(ch, n, budget) {
  const base = budget / Math.max(1, n)
  let m = 0.68 + Math.random() * 0.72
  if (ch === ' ' || ch === '\u00a0') m *= 1.18
  if (/[.,!:]/.test(ch)) m *= 1.85
  return Math.max(7, base * m)
}

function fillTyped(el, text) {
  el.replaceChildren()
  String(text)
    .split('\n')
    .forEach((part, i) => {
      if (i) el.appendChild(document.createElement('br'))
      if (part) el.append(part)
    })
}

function parkCaret(line) {
  if (!line) return
  let caret = document.querySelector('.mast .type-caret')
  if (!caret) {
    caret = document.createElement('span')
    caret.className = 'type-caret'
    caret.setAttribute('aria-hidden', 'true')
  }
  line.appendChild(caret)
}

async function typeInto(el, text, budget) {
  el.replaceChildren()
  const chars = [...text]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === '\n') el.appendChild(document.createElement('br'))
    else el.append(ch)
    keyTick()
    await wait(cadence(ch, chars.length, budget))
  }
}

const HOLD = 350
const MOVE = 14
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function byNewest(a, b) {
  const date = String(b.date || '').localeCompare(String(a.date || ''))
  if (date) return date
  return (b.idea ?? 0) - (a.idea ?? 0)
}

const grid = document.getElementById('grid')
grid.innerHTML = [...specimens]
  .sort(byNewest)
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

function revealTiles() {
  document.documentElement.classList.add('is-intro-done')
  const tiles = [...grid.querySelectorAll('.tile')]
  tiles.forEach((tile, i) => {
    tile.style.animationDelay = reduced ? '0s' : `${Math.min(i, 8) * 0.055}s`
    tile.classList.add('is-in')
  })
}

function paintLede(text) {
  const lede = document.querySelector('.lede')
  if (!lede) return
  const sr = lede.querySelector('.sr-only')
  const ghost = lede.querySelector('.type-ghost')
  if (sr) sr.textContent = text
  if (ghost) ghost.textContent = text
}

async function playIntro() {
  const titleOut = document.querySelector('[data-type="title"]')
  const ledeOut = document.querySelector('[data-type="lede"]')
  const ledeLine = ledeOut?.parentElement
  const titleLine = titleOut?.parentElement
  const today = todayStamp()
  const saved = readIntro()
  const replay = !(saved && saved.date === today && saved.lede)
  const lede = replay ? pickLede() : saved.lede
  if (replay) writeIntro(today, lede)
  paintLede(lede)

  if (!titleOut || !ledeOut || reduced || !replay) {
    if (titleOut) fillTyped(titleOut, TITLE)
    if (ledeOut) fillTyped(ledeOut, lede)
    parkCaret(ledeLine)
    revealTiles()
    return
  }

  titleOut.replaceChildren()
  ledeOut.replaceChildren()
  parkCaret(titleLine)

  await typeInto(titleOut, TITLE, 980)
  await wait(140)
  parkCaret(ledeLine)
  await typeInto(ledeOut, lede, 1680)
  parkCaret(ledeLine)
  revealTiles()
}

playIntro()

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
