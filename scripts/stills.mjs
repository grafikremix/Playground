#!/usr/bin/env node
// Capture mid-interaction stills from the running experiments.
// Usage: npm run stills
// Optional: PLAYGROUND_URL=http://127.0.0.1:4173 npm run stills

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { specimens } from '../src/experiments.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'public', 'experiments')
const SIZE = 1200
const url = process.env.PLAYGROUND_URL || 'http://127.0.0.1:5173'

function cropBox(w, h, crop = { x: 0.5, y: 0.5, z: 1 }) {
  const side = Math.min(w, h) / (crop.z || 1)
  const cx = w * (crop.x ?? 0.5)
  const cy = h * (crop.y ?? 0.5)
  const left = Math.max(0, Math.min(w - side, cx - side / 2))
  const top = Math.max(0, Math.min(h - side, cy - side / 2))
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(Math.min(side, w)),
    height: Math.round(Math.min(side, h)),
  }
}

async function grain(size) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      noise: { type: 'gaussian', mean: 140, sigma: 32 },
    },
  })
    .png()
    .toBuffer()
}

async function treat(buf, crop) {
  const meta = await sharp(buf).metadata()
  const region = cropBox(meta.width, meta.height, crop)
  const base = sharp(buf)
    .extract(region)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .modulate({ brightness: 0.97, saturation: 1.18 })
    .linear(1.18, -20)
  const raw = await base.toBuffer()
  const noise = await grain(SIZE)
  const composed = sharp(raw)
            .composite([{ input: noise, blend: 'overlay', opacity: 0.22 }])
    .sharpen({ sigma: 0.6 })
  return composed
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--hide-scrollbars'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
  })

  for (const spec of specimens) {
    const dest = join(OUT, spec.slug)
    await mkdir(dest, { recursive: true })
    const href = `${url.replace(/\/$/, '')}/specimens/${spec.slug}.html?still=1`
    console.log('still', spec.slug, href)
    await page.goto(href, { waitUntil: 'networkidle' })
    await page.waitForTimeout(spec.slug === 'shattering' ? 220 : 650)
    const target = page.locator('.stage-frame')
    await target.waitFor({ state: 'visible' })
    const buf = await target.screenshot({ type: 'png' })
    const treated = await treat(buf, spec.crop)
    await treated.clone().jpeg({ quality: 86, mozjpeg: true }).toFile(join(dest, 'still.jpg'))
    await treated.clone().webp({ quality: 78 }).toFile(join(dest, 'still.webp'))
    await treated.avif({ quality: 55 }).toFile(join(dest, 'still.avif'))
  }

  await browser.close()
  console.log('wrote', OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
