const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const ICE = [183, 236, 255]

export async function ditherToPhosphor(img, rgb = ICE) {
  await img.decode().catch(() => {})
  const size = 220
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  c.setAttribute('aria-hidden', 'true')
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.filter = 'contrast(2.4) saturate(0.15) brightness(1.28)'
  ctx.drawImage(img, 0, 0, size, size)
  ctx.filter = 'none'
  const data = ctx.getImageData(0, 0, size, size)
  const d = data.data
  const mask = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11
      const t = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16
      mask[y * size + x] = lum / 255 > t * 0.2 + 0.07 ? 1 : 0
    }
  }
  const thick = new Uint8Array(mask)
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (mask[y * size + x]) continue
      if (
        mask[y * size + x - 1] ||
        mask[y * size + x + 1] ||
        mask[(y - 1) * size + x] ||
        mask[(y + 1) * size + x]
      ) {
        thick[y * size + x] = 1
      }
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const on = thick[y * size + x]
      d[i] = on ? rgb[0] : 0
      d[i + 1] = on ? rgb[1] : 4
      d[i + 2] = on ? rgb[2] : 12
      d[i + 3] = 255
    }
  }
  ctx.putImageData(data, 0, 0)
  img.replaceWith(c)
  return c
}
