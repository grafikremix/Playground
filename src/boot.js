import './styles.css'
import { fillStudio, withBase, specimenMeta, specimens } from './chrome.js'

export function boot(slug, mount) {
  fillStudio()
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
        <span class="counter">${spec.n} / ${String(specimens.length).padStart(2, '0')}</span>
      </nav>
      <header class="specimen-head">
        <h1>${spec.title}</h1>
        <div class="studio-note">
          <time datetime="${spec.date}">${spec.date}</time>
          <span class="rule-stamp">breaks ${spec.rule}</span>
          <p>${spec.note}</p>
        </div>
      </header>
      <div class="stage-frame">
        <div data-stage></div>
        <p class="hint">${spec.hint}</p>
      </div>
    </div>
  `
  fillStudio(app)
  mount(app.querySelector('[data-stage]'), { preview: false, still })

  if (specimens.length) {
    const prev = specimens[(i - 1 + specimens.length) % specimens.length]
    const next = specimens[(i + 1) % specimens.length]
    const foot = document.createElement('footer')
    foot.className = 'colophon'
    foot.innerHTML = `
      <a href="${withBase(`specimens/${prev.slug}.html`)}">← ${prev.title}</a>
      <a href="${withBase(`specimens/${next.slug}.html`)}">${next.title} →</a>
    `
    app.querySelector('.site').appendChild(foot)
  }
}

export { fillStudio, withBase, specimens }
