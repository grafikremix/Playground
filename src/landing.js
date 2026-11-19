import './styles.css'
import { withBase, specimens } from './chrome.js'

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

grid.querySelectorAll('.tile').forEach(bindTile)

function bindTile(tile) {
  const hit = tile.querySelector('.tile-hit')
  // Long-press hook: hold-to-bloom was removed. Attach a new hold gesture here later.
  hit.addEventListener('contextmenu', (e) => e.preventDefault())
  hit.addEventListener('dragstart', (e) => e.preventDefault())
}
