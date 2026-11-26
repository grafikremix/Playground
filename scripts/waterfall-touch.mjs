import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium, webkit: wk } = require('../node_modules/playwright-core')

const BASE = process.env.WF_BASE || 'http://127.0.0.1:5173'
const IPHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}

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
      for (let i = 0; i < a.length; i++) a[i] = 128
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
    createDynamicsCompressor() {
      const n = new FakeNode()
      n.threshold = new FakeParam(-24)
      n.knee = new FakeParam(10)
      n.ratio = new FakeParam(12)
      n.attack = new FakeParam(0.003)
      n.release = new FakeParam(0.25)
      return n
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

async function cdpOf(page) {
  try {
    return await page.context().newCDPSession(page)
  } catch {
    return null
  }
}

async function dispatchTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({
      id: p.id ?? 0,
      x: p.x,
      y: p.y,
      radiusX: 8,
      radiusY: 8,
      force: 1,
    })),
  })
}

async function cdpStroke(page, points) {
  const cdp = await cdpOf(page)
  if (!cdp) return 'none'
  await dispatchTouch(cdp, 'touchStart', [{ id: 0, ...points[0] }])
  for (let i = 1; i < points.length; i++) {
    await dispatchTouch(cdp, 'touchMove', [{ id: 0, ...points[i] }])
  }
  await dispatchTouch(cdp, 'touchEnd', [])
  return 'cdp'
}

async function cdpTwoFingerScroll(page, x1, y1, x2, y2, dy) {
  const cdp = await cdpOf(page)
  if (!cdp) return 'none'
  await dispatchTouch(cdp, 'touchStart', [
    { id: 0, x: x1, y: y1 },
    { id: 1, x: x2, y: y1 },
  ])
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const y = y1 + (dy * i) / steps
    await dispatchTouch(cdp, 'touchMove', [
      { id: 0, x: x1, y },
      { id: 1, x: x2, y },
    ])
  }
  await dispatchTouch(cdp, 'touchEnd', [])
  return 'cdp'
}

async function cdpKey(page, key, code, windowsVirtualKeyCode) {
  const cdp = await cdpOf(page)
  if (!cdp) {
    await page.keyboard.press(key)
    return 'keyboard'
  }
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
  return 'cdp'
}

async function startLive(page) {
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)))
  page.on('crash', () => console.log('CRASH'))
  await page.goto(`${BASE}/specimens/waterfall.html`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('.start')
  await page.waitForFunction(() => window.__waterfall, null, { timeout: 20000 })
  await page.click('.start')
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__waterfall, null, {
    timeout: 20000,
  })
  await page.waitForTimeout(500)
}

function layersAt(page, x, y) {
  return page.evaluate(([px, py]) => window.__waterfall.layers(px, py), [x, y])
}

const fails = []
function check(cond, msg, extra) {
  if (!cond) fails.push(extra !== undefined ? `${msg} ${JSON.stringify(extra)}` : msg)
}

async function runChromium() {
  const browser = await chromium.launch({
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
    ],
  })
  const ctx = await browser.newContext(IPHONE)
  await ctx.addInitScript(fakeAudio)
  const page = await ctx.newPage()
  const report = { engine: 'chromium' }
  try {
    await startLive(page)
    report.stats0 = await page.evaluate(() => window.__waterfall.stats())
    const box = await page.locator('.wf-hit, .wf-wrap').first().boundingBox()
    const x = box.x + 80
    const y = box.y + 220
    report.layersDraw = await layersAt(page, x, y)
    report.strokeVia = await cdpStroke(page, [
      { x, y },
      { x: x + 40, y: y + 6 },
      { x: x + 90, y: y + 10 },
    ])
    await page.waitForTimeout(200)
    report.afterDraw = await page.evaluate(() => window.__waterfall.stats())

    const beforeCam = report.afterDraw.camY
    report.scrollVia = await cdpTwoFingerScroll(page, box.x + 90, box.y + 360, box.x + 180, box.y + 360, 220)
    await page.waitForTimeout(80)
    report.afterScroll = await page.evaluate(() => window.__waterfall.stats())
    for (let i = 0; i < 40; i++) {
      await cdpTwoFingerScroll(page, box.x + 90, box.y + 300, box.x + 180, box.y + 300, 160)
    }
    await page.waitForTimeout(80)
    report.maxScroll = await page.evaluate(() => {
      const s = window.__waterfall.stats()
      const hud = document.querySelector('.wf-hud').getBoundingClientRect()
      return {
        camY: s.camY,
        maxCam: s.maxCam,
        basinScreenY: s.basinScreenY,
        hudTop: hud.top,
        hudH: s.hudH,
        boats: s.boats.length,
        particles: s.particles,
        solver: s.solver,
        backend: s.backend,
      }
    })
    report.layersScroll = await layersAt(page, box.x + 120, box.y + 300)
    report.keyVia = await cdpKey(page, 'ArrowDown', 'ArrowDown', 40)
    await cdpKey(page, 'ArrowDown', 'ArrowDown', 40)
    report.afterKey = await page.evaluate(() => window.__waterfall.stats())

    check(report.stats0.particles >= 0, 'boot')
    check(report.afterDraw.particles > 0, 'water appears', report.afterDraw)
    check(report.afterDraw.strokes >= 1, 'cdp draw stroke', report.afterDraw)
    check(report.afterScroll.camY > beforeCam + 8, 'two-finger scroll', { before: beforeCam, after: report.afterScroll.camY })
    check(report.maxScroll.maxCam > 100, 'maxCam > 0', report.maxScroll)
    check(report.maxScroll.camY > report.maxScroll.maxCam * 0.4, 'scrolled a long way', report.maxScroll)
    check(report.maxScroll.basinScreenY <= report.maxScroll.hudTop + 2 || report.maxScroll.camY >= report.maxScroll.maxCam - 1, 'can reach basin', report.maxScroll)
    check(report.layersDraw.some((l) => /wf-hit|wf-wrap/.test(l.className)), 'draw target', report.layersDraw)
    check(report.layersScroll.some((l) => /wf-hit|wf-wrap/.test(l.className)), 'scroll target', report.layersScroll)
    check(!/crt/.test(JSON.stringify(report.layersDraw[0])), 'crt not on top', report.layersDraw[0])
  } catch (err) {
    report.error = String(err)
    fails.push(`chromium ${err.message}`)
  }
  await browser.close()
  return report
}

async function runWebKit(label, query) {
  const browser = await wk.launch()
  const ctx = await browser.newContext(IPHONE)
  await ctx.addInitScript(fakeAudio)
  const page = await ctx.newPage()
  const report = { engine: `webkit-${label}` }
  page.on('crash', () => {
    report.crashed = true
  })
  try {
    await page.goto(`${BASE}/specimens/waterfall.html${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForSelector('.start')
    await page.waitForFunction(() => window.__waterfall, null, { timeout: 15000 })
    await page.click('.start')
    await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__waterfall, null, {
      timeout: 15000,
    })
    await page.waitForTimeout(400)
    report.stats0 = await page.evaluate(() => window.__waterfall.stats())
    const box = await page.locator('.wf-hit, .wf-wrap').first().boundingBox()
    const x = box.x + 90
    const y = box.y + 210
    report.layersDraw = await layersAt(page, x, y)
    const cdp = await cdpOf(page)
    report.hasCdp = !!cdp
    if (cdp) {
      report.strokeVia = await cdpStroke(page, [
        { x, y },
        { x: x + 70, y: y + 8 },
      ])
    } else {
      await page.touchscreen.tap(x, y)
      await page.touchscreen.tap(x + 40, y + 6)
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 80, y + 12, { steps: 8 })
      await page.mouse.up()
      report.strokeVia = 'touchscreen+mouse'
    }
    await page.waitForTimeout(250)
    report.afterDraw = await page.evaluate(() => window.__waterfall.stats())
    check(report.stats0.particles > 0 || report.afterDraw.particles > 0, `${label} water`, report.afterDraw)
    check(report.afterDraw.strokes >= 1, `${label} draw`, report.afterDraw)
  } catch (err) {
    report.error = String(err)
    if (report.crashed) fails.push(`${label} crashed: ${err.message}`)
    else if (label === 'webgl2') report.webgl2Crash = String(err)
    else fails.push(`${label} ${err.message}`)
  }
  try {
    await browser.close()
  } catch {
    /* crashed */
  }
  return report
}

const chromiumReport = await runChromium()
const webkitCanvas = await runWebKit('canvas', '?wfgl=0')
const webkitGl = await runWebKit('webgl2', '')

const ok = fails.length === 0
console.log(
  JSON.stringify(
    {
      ok,
      fails,
      chromium: {
        solver: chromiumReport.afterDraw?.solver || chromiumReport.stats0?.solver,
        backend: chromiumReport.afterDraw?.backend || chromiumReport.stats0?.backend,
        particles: chromiumReport.afterDraw?.particles,
        strokes: chromiumReport.afterDraw?.strokes,
        camY: chromiumReport.afterScroll?.camY,
        max: chromiumReport.maxScroll,
        layers0: chromiumReport.layersDraw?.[0],
        via: { stroke: chromiumReport.strokeVia, scroll: chromiumReport.scrollVia, key: chromiumReport.keyVia },
        error: chromiumReport.error,
      },
      webkitCanvas: {
        solver: webkitCanvas.afterDraw?.solver || webkitCanvas.stats0?.solver,
        particles: webkitCanvas.afterDraw?.particles,
        strokes: webkitCanvas.afterDraw?.strokes,
        layers0: webkitCanvas.layersDraw?.[0],
        crashed: webkitCanvas.crashed || false,
        error: webkitCanvas.error,
      },
      webkitGl: {
        solver: webkitGl.afterDraw?.solver || webkitGl.stats0?.solver,
        particles: webkitGl.afterDraw?.particles,
        strokes: webkitGl.afterDraw?.strokes,
        crashed: webkitGl.crashed || false,
        error: webkitGl.error,
      },
    },
    null,
    2,
  ),
)
if (!ok) process.exit(1)
