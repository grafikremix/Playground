import { experiments, lede, picture } from './catalog.js'
import { bindTiles } from './bloom.js'

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

function hexToRgb(hex) {
  const h = hex.trim().replace('#', '')
  if (h.length < 6) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function cssHex(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return hexToRgb(v)
}

async function dither(img, onRgb, midRgb) {
  await img.decode().catch(() => {})
  const size = 148
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.filter = 'contrast(1.55)'
  ctx.drawImage(img, 0, 0, size, size)
  ctx.filter = 'none'
  const data = ctx.getImageData(0, 0, size, size)
  const d = data.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11
      const t = (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16
      const ink = 1 - lum / 255
      let rgb = [0, 2, 0]
      if (ink > t * 0.5 + 0.16) rgb = onRgb
      else if (midRgb && ink > t * 0.28 + 0.1) rgb = midRgb
      d[i] = rgb[0]
      d[i + 1] = rgb[1]
      d[i + 2] = rgb[2]
      d[i + 3] = 255
    }
  }
  ctx.putImageData(data, 0, 0)
  img.replaceWith(c)
}

export async function mountTerminal() {
  document.getElementById('lede').textContent = lede
  document.getElementById('grid').innerHTML = experiments
    .map(
      (s) => `
        <li class="tile" data-tile>
          <a class="cell" data-hit href="../specimens/${s.slug}.html" draggable="false">
            <div class="frame">
              <div class="still">
                ${picture(s.slug, 'still-bw', s.title, s.blurb)}
                ${picture(s.slug, 'still-color', s.title, s.blurb)}
              </div>
            </div>
            <div class="row"><span class="n">${s.n}</span><h2>${s.slug}.still</h2></div>
            <p class="blurb">${s.title} — ${s.blurb}</p>
          </a>
        </li>`,
    )
    .join('')

  const onRgb = cssHex('--p') || [108, 255, 106]
  const midRgb = cssHex('--p2')
  await Promise.all(
    [...document.querySelectorAll('.still-bw img')].map((img) => dither(img, onRgb, midRgb)),
  )
  bindTiles()
}
