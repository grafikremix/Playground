import './styles.css'
import { fillStudio, withBase, specimenMeta, specimens } from './chrome.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ideaMeta(spec) {
  return `
    <div class="idea-meta">
      <span class="idea-id">Idea ${escapeHtml(spec.idea)}</span>
      <time class="idea-date" datetime="${escapeHtml(spec.date)}">${escapeHtml(spec.date)}</time>
      <details class="prompt-fold">
        <summary>prompt</summary>
        <pre class="prompt-text" data-prompt></pre>
      </details>
    </div>
  `
}

export function boot(slug, mount) {
  const spec = specimenMeta(slug)
  const i = specimens.findIndex((s) => s.slug === slug)
  const still = new URLSearchParams(location.search).has('still')
  const app = document.getElementById('app')
  if (!spec || i < 0) {
    document.title = 'Radley’s AI Playground'
    app.innerHTML = `<div class="site"><a class="back" href="${withBase('')}">← Back</a></div>`
    return
  }
  document.title = `${spec.title} — Radley’s AI Playground`
  if (still) document.body.classList.add('is-still')
  const full = spec.full && !still
  if (full) document.body.classList.add('is-full')

  app.innerHTML = full
    ? `
    <div class="site">
      <nav class="chrome">
        <a class="back" href="${withBase('')}">← Back</a>
        ${ideaMeta(spec)}
      </nav>
      <div class="stage-frame">
        <div data-stage></div>
      </div>
    </div>
  `
    : `
    <div class="site">
      <nav class="chrome">
        <a class="back" href="${withBase('')}">← Back</a>
        ${ideaMeta(spec)}
      </nav>
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
  prompt.textContent = spec.prompt ?? ''
  fillStudio(app)
  mount(app.querySelector('[data-stage]'), { preview: false, still })
}

export { fillStudio, withBase, specimens }
