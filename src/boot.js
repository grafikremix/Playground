import './styles.css'
import { fillStudio, withBase, specimenMeta, specimens } from './chrome.js'
import { unlock, soundOn, setSoundOn } from './lib/audio.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function speakerOn() {
  return `<svg class="sound-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.5 9.2h3.1L13 5.2v13.6l-5.4-4H4.5z"/>
    <path d="M16.1 9.1c1.15.85 1.9 2.05 1.9 2.9s-.75 2.05-1.9 2.9" fill="none"/>
    <path d="M18.6 6.8c1.85 1.4 3.05 3.25 3.05 5.2s-1.2 3.8-3.05 5.2" fill="none"/>
  </svg>`
}

function speakerOff() {
  return `<svg class="sound-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.5 9.2h3.1L13 5.2v13.6l-5.4-4H4.5z"/>
    <path d="M16.2 8.2l6.1 7.6M22.3 8.2l-6.1 7.6" fill="none"/>
  </svg>`
}

function ideaChrome(spec) {
  const id = `prompt-window-${spec.slug}`
  const on = soundOn()
  return `
    <nav class="chrome">
      <a class="back" href="${withBase('')}">← Back</a>
      <span class="idea-hud">${escapeHtml(spec.title)}</span>
      <button class="prompt-open" type="button" aria-expanded="false" aria-controls="${id}">
        View Prompt
      </button>
    </nav>
    <button
      class="sound-toggle"
      type="button"
      aria-label="Sound"
      aria-pressed="${on ? 'true' : 'false'}"
    >${on ? speakerOn() : speakerOff()}</button>
    <div class="prompt-window" id="${id}" role="dialog" aria-modal="false" aria-labelledby="${id}-title" hidden>
      <button class="prompt-close" type="button" aria-label="Close">×</button>
      <div class="prompt-scroll">
        <h2 class="prompt-title" id="${id}-title">${escapeHtml(spec.title)}</h2>
        <p class="prompt-blurb">${escapeHtml(spec.blurb)}</p>
        <pre class="prompt-text" data-prompt></pre>
      </div>
      <div class="prompt-foot">
        <span class="idea-id">Idea ${escapeHtml(spec.idea)}</span>
        <time class="idea-date" datetime="${escapeHtml(spec.date)}">${escapeHtml(spec.date)}</time>
      </div>
    </div>
  `
}

function stageMarkup(hint) {
  return `
      <div class="stage-frame">
        <div data-stage></div>
        <button class="start" type="button">Start</button>
        ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}
      </div>`
}

function focusables(win) {
  return [...win.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'),
  )
}

function bindPrompt(root) {
  const open = root.querySelector('.prompt-open')
  const win = root.querySelector('.prompt-window')
  const close = root.querySelector('.prompt-close')
  if (!open || !win || !close) return

  const setOpen = (on) => {
    win.hidden = !on
    open.setAttribute('aria-expanded', String(on))
    win.setAttribute('aria-modal', on ? 'true' : 'false')
    document.body.classList.toggle('is-prompt', on)
    if (on) close.focus()
    else open.focus()
  }

  open.addEventListener('click', () => setOpen(win.hidden))
  close.addEventListener('click', () => setOpen(false))
  document.addEventListener('keydown', (e) => {
    if (win.hidden) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key !== 'Tab') return
    const nodes = focusables(win)
    if (!nodes.length) {
      e.preventDefault()
      close.focus()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    } else if (!win.contains(document.activeElement)) {
      e.preventDefault()
      first.focus()
    }
  })
  document.addEventListener('focusin', (e) => {
    if (win.hidden) return
    if (win.contains(e.target)) return
    close.focus()
  })
}

function paintSound(btn) {
  const on = soundOn()
  btn.setAttribute('aria-pressed', on ? 'true' : 'false')
  btn.innerHTML = on ? speakerOn() : speakerOff()
}

function bindSound(root) {
  const btn = root.querySelector('.sound-toggle')
  if (!btn) return
  paintSound(btn)
  btn.addEventListener('click', () => {
    unlock()
    setSoundOn(!soundOn())
    paintSound(btn)
  })
}

function bindStart(root) {
  const btn = root.querySelector('.start')
  if (!btn) return
  btn.addEventListener('click', () => {
    unlock()
    document.body.classList.remove('is-waiting')
    document.body.classList.add('is-live')
    btn.hidden = true
    window.dispatchEvent(new Event('playground-start'))
  })
}

export function boot(slug, mount) {
  const spec = specimenMeta(slug)
  const i = specimens.findIndex((s) => s.slug === slug)
  const params = new URLSearchParams(location.search)
  const still = params.has('still')
  const peek = params.has('peek')
  const app = document.getElementById('app')
  if (!spec || i < 0) {
    document.title = 'Radley’s AI Playground'
    app.innerHTML = `<div class="site"><a class="back" href="${withBase('')}">← Back</a></div>`
    return
  }
  document.title = `${spec.title} — Radley’s AI Playground`
  if (still) document.body.classList.add('is-still')
  if (peek) document.body.classList.add('is-peek')
  const full = spec.full && !still && !peek
  if (full) {
    document.body.classList.add('is-full')
    document.body.classList.add('is-waiting')
  }

  if (peek) {
    app.innerHTML = `<div class="stage-frame"><div data-stage></div></div>`
    mount(app.querySelector('[data-stage]'), { preview: true, still: false, peek: true })
    return
  }

  app.innerHTML = full
    ? `
    <div class="site">
      ${ideaChrome(spec)}
      ${stageMarkup()}
    </div>
  `
    : `
    <div class="site">
      ${ideaChrome(spec)}
      <header class="specimen-head">
        <h1>${escapeHtml(spec.title)}</h1>
      </header>
      ${stageMarkup(spec.hint)}
    </div>
  `
  const prompt = app.querySelector('[data-prompt]')
  if (prompt) prompt.textContent = spec.prompt ?? ''
  fillStudio(app)
  bindPrompt(app)
  bindSound(app)
  if (!still) bindStart(app)
  mount(app.querySelector('[data-stage]'), { preview: peek, still, peek })
}

export { fillStudio, withBase, specimens }
