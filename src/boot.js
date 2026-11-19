import './styles.css'
import { fillStudio, withBase, specimenMeta, specimens } from './chrome.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ideaChrome(spec) {
  const id = `prompt-window-${spec.slug}`
  return `
    <nav class="chrome">
      <a class="back" href="${withBase('')}">← Back</a>
      <span class="idea-hud">Idea ${escapeHtml(spec.idea)} · ${escapeHtml(spec.title)}</span>
      <button class="prompt-open" type="button" aria-expanded="false" aria-controls="${id}">
        View Prompt
      </button>
    </nav>
    <div class="prompt-window" id="${id}" role="dialog" aria-labelledby="${id}-title" hidden>
      <button class="prompt-close" type="button" aria-label="Close">×</button>
      <h2 class="prompt-title" id="${id}-title">${escapeHtml(spec.title)}</h2>
      <p class="prompt-blurb">${escapeHtml(spec.blurb)}</p>
      <pre class="prompt-text" data-prompt></pre>
      <time class="idea-date" datetime="${escapeHtml(spec.date)}">${escapeHtml(spec.date)}</time>
    </div>
  `
}

function bindPrompt(root) {
  const open = root.querySelector('.prompt-open')
  const win = root.querySelector('.prompt-window')
  const close = root.querySelector('.prompt-close')
  if (!open || !win || !close) return

  const setOpen = (on) => {
    win.hidden = !on
    open.setAttribute('aria-expanded', String(on))
    if (on) close.focus()
    else open.focus()
  }

  open.addEventListener('click', () => setOpen(win.hidden))
  close.addEventListener('click', () => setOpen(false))
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || win.hidden) return
    e.preventDefault()
    setOpen(false)
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
  if (full) document.body.classList.add('is-full')

  if (peek) {
    app.innerHTML = `<div class="stage-frame"><div data-stage></div></div>`
    mount(app.querySelector('[data-stage]'), { preview: true, still: false, peek: true })
    return
  }

  app.innerHTML = full
    ? `
    <div class="site">
      ${ideaChrome(spec)}
      <div class="stage-frame">
        <div data-stage></div>
      </div>
    </div>
  `
    : `
    <div class="site">
      ${ideaChrome(spec)}
      <header class="specimen-head">
        <h1>${escapeHtml(spec.title)}</h1>
      </header>
      <div class="stage-frame">
        <div data-stage></div>
        <p class="hint">${escapeHtml(spec.hint)}</p>
      </div>
    </div>
  `
  const prompt = app.querySelector('[data-prompt]')
  if (prompt) prompt.textContent = spec.prompt ?? ''
  fillStudio(app)
  bindPrompt(app)
  mount(app.querySelector('[data-stage]'), { preview: peek, still, peek })
}

export { fillStudio, withBase, specimens }
