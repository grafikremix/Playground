import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('../node_modules/playwright-core')

const BASE = process.env.WF_BASE || 'http://127.0.0.1:5173'
const MIN_RMS = Number(process.env.WF_MIN_RMS || 0.01)

async function peakRms(page, ms = 1600) {
  return page.evaluate(async (wait) => {
    const t0 = performance.now()
    let peak = 0
    while (performance.now() - t0 < wait) {
      const r = window.__waterfall?.rms?.() || 0
      if (r > peak) peak = r
      await new Promise((res) => requestAnimationFrame(res))
    }
    return peak
  }, ms)
}

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})

await page.goto(`${BASE}/specimens/waterfall.html`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForSelector('.start')
await page.click('.start')
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__waterfall)
await page.waitForTimeout(200)
await page.evaluate(() => {
  window.__waterfall.setPressure('fast')
  const s = window.__waterfall.stats()
  const cx = s.viewW / 2
  window.__waterfall.drawPolyline([
    { x: cx - 110, y: 150 },
    { x: cx + 110, y: 150 },
  ])
})
await page.waitForTimeout(900)
await page.evaluate(() => window.__waterfall.pourOnBoats(80))
const peak = await peakRms(page, 1800)
const snap = await page.evaluate(() => window.__waterfall.stats())

await browser.close()
const trigOk = (snap.trigPerSec || 0) <= 4
const ok = peak >= MIN_RMS && trigOk && errors.length === 0
console.log(JSON.stringify({ ok, peak, minRms: MIN_RMS, rmsPeak: snap.rmsPeak, trigPerSec: snap.trigPerSec, ctxState: snap.ctxState, solver: snap.solver, fps: snap.fps, errors }, null, 2))
if (!ok) process.exit(1)
