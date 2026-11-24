import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { webkit: wk } = require('../node_modules/playwright-core')

const BASE = process.env.WF_BASE || 'http://127.0.0.1:5173'

function fakeAudio() {
  class FakeParam {
    constructor(v = 0) {
      this.value = v
    }
    setTargetAtTime(v) {
      this.value = v
    }
    setValueAtTime(v) {
      this.value = v
    }
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    cancelScheduledValues() {}
    connect() {
      return this
    }
    disconnect() {}
  }
  class FakeNode {
    constructor() {
      this.gain = new FakeParam(1)
      this.frequency = new FakeParam(440)
      this.Q = new FakeParam(1)
      this.fftSize = 256
      this.frequencyBinCount = 128
      this.buffer = null
      this.loop = false
      this.playbackRate = new FakeParam(1)
    }
    connect() {
      return this
    }
    disconnect() {}
    start() {}
    stop() {}
    getByteTimeDomainData(a) {
      for (let i = 0; i < a.length; i++) a[i] = 128 + Math.sin(i / 6) * 40
    }
  }
  class FakeBuf {
    constructor(ch, n, rate) {
      this.numberOfChannels = ch
      this.length = n
      this.sampleRate = rate
      this._ch = Array.from({ length: ch }, () => new Float32Array(n))
    }
    getChannelData(i) {
      return this._ch[i]
    }
  }
  class FakeAC {
    constructor() {
      this.state = 'running'
      this.currentTime = 0
      this.sampleRate = 44100
      this.destination = new FakeNode()
    }
    addEventListener() {}
    removeEventListener() {}
    resume() {
      this.state = 'running'
      return Promise.resolve()
    }
    close() {
      this.state = 'closed'
      return Promise.resolve()
    }
    createGain() {
      return new FakeNode()
    }
    createOscillator() {
      return new FakeNode()
    }
    createBiquadFilter() {
      return new FakeNode()
    }
    createAnalyser() {
      return new FakeNode()
    }
    createBufferSource() {
      return new FakeNode()
    }
    createBuffer(ch, n, rate) {
      return new FakeBuf(ch, n, rate)
    }
    decodeAudioData() {
      return Promise.resolve(new FakeBuf(1, 1, 44100))
    }
  }
  window.AudioContext = FakeAC
  window.webkitAudioContext = FakeAC
}

function hair(c) {
  return /183/.test(c) && /236/.test(c)
}

async function launchPage() {
  const browser = await wk.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  await ctx.addInitScript(fakeAudio)
  const page = await ctx.newPage()
  page.__browser = browser
  return page
}

async function pointers(page, events) {
  for (const ev of events) {
    await page.evaluate((e) => {
      const el = document.querySelector('.wf-wrap canvas') || document.querySelector('canvas')
      el.dispatchEvent(
        new PointerEvent(e.type, {
          bubbles: true,
          cancelable: true,
          pointerId: e.id,
          pointerType: 'touch',
          clientX: e.x,
          clientY: e.y,
          buttons: e.type === 'pointerup' ? 0 : 1,
        }),
      )
    }, ev)
  }
}

const errors = []
const report = {}
const page = await launchPage()
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})

await page.goto(`${BASE}/specimens/waterfall.html`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForSelector('.start')
report.hud = await page.evaluate(() => ({
  back: document.querySelector('.back')?.textContent.trim(),
  prompt: document.querySelector('.prompt-open')?.textContent.trim(),
  borders: {
    back: { w: getComputedStyle(document.querySelector('.back')).borderTopWidth, c: getComputedStyle(document.querySelector('.back')).borderTopColor },
    prompt: { w: getComputedStyle(document.querySelector('.prompt-open')).borderTopWidth, c: getComputedStyle(document.querySelector('.prompt-open')).borderTopColor },
    start: { w: getComputedStyle(document.querySelector('.start')).borderTopWidth, c: getComputedStyle(document.querySelector('.start')).borderTopColor },
  },
}))
await page.click('.start')
await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__waterfall)
await page.waitForTimeout(400)

report.afterStart = await page.evaluate(() => {
  const hud = document.querySelector('.wf-hud')
  const gauge = [...document.querySelectorAll('[data-rate]')].map((b) => b.textContent.trim())
  const reset = document.querySelector('.wf-reset')
  return {
    gauge,
    reset: reset?.textContent.trim(),
    resetBorder: getComputedStyle(reset).borderTopColor,
    gaugeBorder: getComputedStyle(document.querySelector('[data-rate]')).borderTopColor,
    stats: window.__waterfall.stats(),
  }
})

const box = await page.locator('canvas').evaluate((el) => {
  const r = el.getBoundingClientRect()
  return { l: r.left, t: r.top, w: r.width, h: r.height }
})
const cx = box.l + box.w / 2
const y = box.t + 180
await pointers(page, [
  { type: 'pointerdown', id: 1, x: cx - 90, y },
  { type: 'pointermove', id: 1, x: cx, y },
  { type: 'pointermove', id: 1, x: cx + 90, y },
  { type: 'pointerup', id: 1, x: cx + 90, y },
])
await page.waitForTimeout(1600)
report.drawn = await page.evaluate(() => window.__waterfall.stats())

await page.evaluate(() => {
  window.__waterfall.reset()
  const s = window.__waterfall.stats()
  const cx = s.viewW / 2
  window.__waterfall.drawPolyline([
    { x: cx - 120, y: 170 },
    { x: cx + 120, y: 170 },
  ])
})
await page.waitForTimeout(1800)
report.split = await page.evaluate(() => window.__waterfall.stats())

await page.evaluate(() => {
  window.__waterfall.reset()
  const s = window.__waterfall.stats()
  const cx = s.viewW / 2
  window.__waterfall.drawPolyline([
    { x: cx - 80, y: 250 },
    { x: cx - 70, y: 340 },
    { x: cx, y: 365 },
    { x: cx + 70, y: 340 },
    { x: cx + 80, y: 250 },
  ])
})
await page.waitForTimeout(1600)
report.bowlFill = await page.evaluate(() => window.__waterfall.stats())
await page.waitForTimeout(2200)
report.bowlOver = await page.evaluate(() => window.__waterfall.stats())

await page.evaluate(() => {
  window.__waterfall.reset()
  const s = window.__waterfall.stats()
  const cx = s.viewW / 2
  window.__waterfall.drawPolyline([
    { x: cx - 20, y: 140 },
    { x: cx + 130, y: 340 },
  ])
})
await page.waitForTimeout(1600)
report.slope = await page.evaluate(() => {
  const s = window.__waterfall.stats()
  return { particles: s.particles, splitRight: s.splitRight, splitLeft: s.splitLeft, fps: s.fps }
})

await page.evaluate(() => window.__waterfall.reset())
await page.waitForTimeout(80)
const y1 = box.t + 240
await pointers(page, [
  { type: 'pointerdown', id: 1, x: cx - 40, y: y1 },
  { type: 'pointerdown', id: 2, x: cx + 40, y: y1 },
  { type: 'pointermove', id: 1, x: cx - 40, y: y1 + 90 },
  { type: 'pointermove', id: 2, x: cx + 40, y: y1 + 90 },
  { type: 'pointerup', id: 1, x: cx - 40, y: y1 + 90 },
  { type: 'pointerup', id: 2, x: cx + 40, y: y1 + 90 },
])
await page.waitForTimeout(80)
report.pinchScroll = await page.evaluate(() => window.__waterfall.stats())

const beforeArrow = await page.evaluate(() => window.__waterfall.stats().camY)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(40)
report.arrow = await page.evaluate((before) => {
  const s = window.__waterfall.stats()
  window.__waterfall.scrollTo(s.maxCam + 80)
  const clamped = window.__waterfall.stats()
  window.__waterfall.scrollTo(0)
  return { before, after: s.camY, max: s.maxCam, clamped: clamped.camY }
}, beforeArrow)

await page.click('[data-rate="slow"]')
await page.waitForTimeout(40)
report.slow = await page.evaluate(() => window.__waterfall.stats().pressure)
await page.click('[data-rate="fast"]')
await page.waitForTimeout(40)
report.fast = await page.evaluate(() => window.__waterfall.stats().pressure)
await page.click('[data-rate="medium"]')

await page.evaluate(() => {
  window.__waterfall.scrollTo(window.__waterfall.stats().maxCam)
  const before = window.__waterfall.stats().boats.map((b) => ({ ...b }))
  window.__waterfall.pourOnBoats(60)
  return before
})
await page.waitForTimeout(700)
report.boats = await page.evaluate(() => window.__waterfall.stats().boats)

await page.evaluate(() => {
  window.__waterfall.scrollTo(0)
  const s = window.__waterfall.stats()
  window.__waterfall.drawPolyline([
    { x: 40, y: 220 },
    { x: s.viewW - 40, y: 220 },
  ])
})
await page.waitForTimeout(200)
const beforeReset = await page.evaluate(() => window.__waterfall.stats())
await page.click('.wf-reset')
await page.waitForTimeout(120)
report.reset = await page.evaluate((before) => {
  const s = window.__waterfall.stats()
  return { beforeStrokes: before.strokes, beforeCam: before.camY, strokes: s.strokes, camY: s.camY, particles: s.particles }
}, beforeReset)
await page.waitForTimeout(500)
report.resetFlow = await page.evaluate(() => window.__waterfall.stats().particles)

await page.click('.prompt-open')
await page.waitForSelector('.prompt-window:not([hidden])')
report.prompt = await page.evaluate(() => {
  const scroll = [...document.querySelector('.prompt-scroll').children].map((el) => {
    if (el.matches('h2.prompt-title')) return 'title'
    if (el.matches('p.prompt-blurb')) return 'subtitle'
    if (el.matches('hr.prompt-rule')) return 'divider'
    if (el.matches('.prompt-toggles')) return 'toggle'
    if (el.matches('pre.prompt-text')) return 'prompt'
    if (el.matches('[data-prompt-meta]')) return 'meta'
    if (el.matches('[data-prompt-credit]')) return 'credit'
    return el.className
  })
  return {
    scroll,
    footer: [...document.querySelectorAll('.prompt-footer [data-play-switch], .prompt-footer [data-sound-switch]')].map((el) =>
      el.getAttribute('aria-label'),
    ),
    hasToggle: !!document.querySelector('[data-play-switch]'),
    credit: document.querySelector('[data-prompt-credit]')?.textContent.trim() || '',
    href: document.querySelector('.prompt-credit-link')?.getAttribute('href') || '',
    meta: [...document.querySelectorAll('.prompt-meta p')].map((p) => p.textContent.trim()),
    prompt: document.querySelector('[data-prompt]')?.textContent || '',
  }
})
await page.__browser.close()

{
  const home = await launchPage()
  await home.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await home.waitForFunction(() => document.documentElement.classList.contains('is-intro-done'))
  report.home = await home.evaluate(() => {
    const first = document.querySelector('.tile-label h2')
    const tiles = [...document.querySelectorAll('.tile-label h2')].map((h) => h.textContent.trim())
    const score = [...document.querySelectorAll('.tile')].some((t) => /(?:^|\s)(score|hits|best)\b/i.test(t.innerText))
    return {
      first: first?.textContent.trim() || '',
      tiles,
      score,
      idea: document.querySelector('.tile .num')?.textContent.trim() || '',
    }
  })
  await home.__browser.close()
}

{
  const still = await launchPage()
  await still.goto(`${BASE}/specimens/waterfall.html?still=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await still.waitForSelector('canvas')
  await still.waitForTimeout(500)
  report.still = await still.evaluate(() => ({
    hud: !!document.querySelector('.wf-hud'),
    score: /(?:^|\s)(score|hits|best)\b/i.test(document.body.innerText),
    particles: window.__waterfall?.stats()?.particles || 0,
    strokes: window.__waterfall?.stats()?.strokes || 0,
  }))
  await still.__browser.close()
}

const fails = []
function check(cond, msg, extra) {
  if (!cond) fails.push(extra !== undefined ? `${msg} ${JSON.stringify(extra)}` : msg)
}

check(!errors.filter((e) => !/^start-retry|^CRASH$/.test(e)).length, 'console', errors)
check(report.home.first === 'waterfall', 'newest first', report.home)
check(report.home.idea === 'Idea 11', 'idea number', report.home.idea)
check(!report.home.score, 'score on tile')
check(report.hud.back.includes('Back'), 'back')
check(report.hud.prompt === 'Prompt', 'prompt')
Object.entries(report.hud.borders).forEach(([k, b]) => {
  check(b && b.w === '1px' && hair(b.c), `hud border ${k}`, b)
})
check(report.afterStart.gauge.join() === 'Slow,Medium,Fast', 'gauge labels', report.afterStart.gauge)
check(report.afterStart.reset === 'Reset', 'reset sentence case', report.afterStart.reset)
check(hair(report.afterStart.resetBorder) && hair(report.afterStart.gaugeBorder), 'hud hairline', report.afterStart)
check(report.drawn.strokes >= 1, 'touch draw', report.drawn)
check(report.split.splitLeft >= 4 && report.split.splitRight >= 4, 'flat split', { l: report.split.splitLeft, r: report.split.splitRight, n: report.split.particles })
check(report.bowlFill.bowl >= 6, 'bowl fills', report.bowlFill.bowl)
check(report.bowlOver.particles > report.bowlFill.bowl, 'bowl overflow', { fill: report.bowlFill.bowl, later: report.bowlOver.particles, split: report.bowlOver.splitRight + report.bowlOver.splitLeft })
check(report.slope.particles > 8 && report.slope.splitRight >= 3, 'slope slide', report.slope)
check(report.pinchScroll.camY > 20, 'two-finger scroll', report.pinchScroll.camY)
check(report.arrow.after > report.arrow.before, 'arrow keys', report.arrow)
check(report.arrow.clamped === report.arrow.max, 'scroll clamp', report.arrow)
check(report.slow === 'slow' && report.fast === 'fast', 'pressure gauge', { slow: report.slow, fast: report.fast })
check(report.boats.some((b) => Math.abs(b.vx) > 0.2 || Math.abs(b.bob) > 0.2 || Math.abs(b.a) > 0.01), 'boats react', report.boats)
check(report.reset.strokes === 0 && report.reset.camY === 0, 'reset clears', report.reset)
check(report.resetFlow > 0, 'reset restarts flow', report.resetFlow)
check(report.prompt.scroll.join() === 'title,subtitle,divider,prompt,meta,credit', 'prompt order', report.prompt.scroll)
check(!report.prompt.hasToggle, 'no edit toggle', report.prompt)
check(report.prompt.footer.join() === 'Sound', 'footer only sound', report.prompt.footer)
check(report.prompt.credit.includes('plinkfx') && report.prompt.href.includes('maximilianfeix/plinkfx'), 'plinkfx credit', report.prompt)
check(report.prompt.prompt.includes('water flowing vertically') && report.prompt.prompt.includes('plinkfx'), 'verbatim prompt')
check(report.prompt.meta[0] === 'Idea 11' && report.prompt.meta.some((m) => m.startsWith('Author')), 'meta', report.prompt.meta)
check(!report.still.hud && !report.still.score && report.still.strokes >= 1, 'still pose', report.still)
check(report.split.fps >= 20, 'fps', report.split.fps)

console.log(JSON.stringify({ ok: fails.length === 0, fails, report: { home: report.home, afterStart: { gauge: report.afterStart.gauge, reset: report.afterStart.reset, particles: report.afterStart.stats.particles }, drawn: { strokes: report.drawn.strokes }, split: { l: report.split.splitLeft, r: report.split.splitRight, n: report.split.particles, fps: report.split.fps }, bowlFill: report.bowlFill.bowl, bowlOver: { n: report.bowlOver.particles, bowl: report.bowlOver.bowl }, slope: report.slope, pinchScroll: report.pinchScroll.camY, arrow: report.arrow, slow: report.slow, fast: report.fast, boats: report.boats, reset: report.reset, resetFlow: report.resetFlow, prompt: { scroll: report.prompt.scroll, footer: report.prompt.footer, credit: report.prompt.credit, href: report.prompt.href, meta: report.prompt.meta }, still: report.still, errors } }, null, 2))
if (fails.length) process.exit(1)
