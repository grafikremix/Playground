import './styles.css'
import { fillStudio, withBase, specimenMeta, specimens } from './chrome.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function boot(slug, mount) {
  const spec = specimenMeta(slug)
  const i = specimens.findIndex((s) => s.slug === slug)
  const still = new URLSearchParams(location.search).has('still')
  const app = document.getElementById('app')
  if (!spec || i < 0) {
    document.title = 'Playground'
    app.innerHTML = `<div class="site"><a class="back" href="${withBase('')}">← playground</a></div>`
    return
  }
  document.title = `${spec.title} — Playground`
  if (still) document.body.classList.add('is-still')

  app.innerHTML = `
    <div class="site">
      <nav class="chrome">
        <a class="back" href="${withBase('')}">← playground</a>
        <a class="mark" href="${withBase('')}" data-monogram data-print="gr">gr</a>
        <span class="counter">${escapeHtml(spec.n)} / ${String(specimens.length).padStart(2, '0')}</span>
      </nav>
      <header class="specimen-head">
        <h1>${escapeHtml(spec.title)}</h1>
        <time class="idea-date" datetime="${escapeHtml(spec.date)}">${escapeHtml(spec.date)}</time>
        <figure class="prompt">
          <figcaption class="prompt-mark">prompt</figcaption>
          <pre class="prompt-text" data-prompt></pre>
        </figure>
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
