import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('../node_modules/playwright-core')

const BASE = process.env.SB_BASE || 'http://127.0.0.1:5173'
const MIN_RMS = Number(process.env.SB_MIN_RMS || 0.01)

const CASES = [
  { name: 'open-lofi', steps: [['open-lofi', 0], ['ambient-lofi', 1], ['ol-deep-space-loop', 2]] },
  { name: 'plinkfx', steps: [['plinkfx', 0], ['px-ice', 1], ['px-snd-ice', 2]] },
  { name: 'zzfxm', steps: [['zzfxm', 0], ['zz-pads', 1], ['zz-ice-sheet', 2]] },
  { name: 'tone-icy-pad', steps: [['tone', 0], ['tn-pads', 1], ['tn-icy-pad', 2]] },
  { name: 'tone-glass-room', steps: [['tone', 0], ['tn-pads', 1], ['tn-glass-room', 2]] },
  { name: 'tone-slow-arp', steps: [['tone', 0], ['tn-pulses', 1], ['tn-slow-arp', 2]] },
  { name: 'tone-crt-hum', steps: [['tone', 0], ['tn-pulses', 1], ['tn-crt-hum', 2]] },
]

async function peakRms(page, ms = 1600) {
  return page.evaluate(async (wait) => {
    const t0 = performance.now()
    let peak = 0
    while (performance.now() - t0 < wait) {
      const r = window.__soundBrowser?.rms?.() || 0
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

await page.goto(`${BASE}/specimens/sound-browser.html`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForSelector('.start')
await page.click('.start')
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__soundBrowser)
await page.waitForTimeout(400)

const results = []
for (const c of CASES) {
  for (const [id, depth] of c.steps) {
    await page.evaluate(([sid, d]) => window.__soundBrowser.select(sid, d), [id, depth])
    await page.waitForTimeout(80)
  }
  await page.waitForFunction((id) => window.__soundBrowser?.stats()?.playing?.id === id, c.steps.at(-1)[0], { timeout: 8000 })
  const peak = await peakRms(page, 1800)
  const snap = await page.evaluate(() => window.__soundBrowser.stats())
  results.push({
    name: c.name,
    engine: snap.playing?.engine,
    id: snap.playing?.id,
    peak,
    rms: snap.rms,
    ctxState: snap.ctxState,
    toneBound: snap.toneBound,
    ok: peak >= MIN_RMS,
  })
}

await page.evaluate(() => document.querySelector('.sb-toggle')?.click())
await page.waitForTimeout(250)
const paused = await page.evaluate(() => ({ paused: window.__soundBrowser.stats().paused, rms: window.__soundBrowser.rms() }))

await browser.close()

const fails = results.filter((r) => !r.ok)
const pauseOk = paused.paused === true && paused.rms < MIN_RMS
const consoleOk = errors.length === 0

console.log(
  JSON.stringify(
    {
      ok: fails.length === 0 && pauseOk && consoleOk,
      minRms: MIN_RMS,
      results,
      paused,
      pauseOk,
      errors,
    },
    null,
    2,
  ),
)
if (fails.length || !pauseOk || !consoleOk) process.exit(1)
