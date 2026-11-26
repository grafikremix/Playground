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

function attachLogs(page, report) {
  report.pageErrors = []
  report.consoleErrors = []
  page.on('pageerror', (e) => report.pageErrors.push(String(e)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text())
  })
  page.on('crash', () => {
    report.crashed = true
  })
}

async function startLive(page, query = '') {
  await page.goto(`${BASE}/specimens/waterfall.html${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('.start')
  await page.waitForFunction(() => window.__waterfall, null, { timeout: 20000 })
  await page.click('.start')
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__waterfall, null, {
    timeout: 20000,
  })
  await page.waitForFunction(() => (window.__waterfall?.stats?.().particles || 0) > 0, null, { timeout: 8000 })
  await page.waitForTimeout(600)
}

function sampleWaterPixels() {
  const src = document.querySelector('.wf-fluid') || document.querySelector('.wf-wrap canvas')
  if (!src) return { lit: 0, w: 0, h: 0, reason: 'no-canvas' }
  const w = Math.max(1, src.width || 0)
  const h = Math.max(1, src.height || 0)
  const copy = document.createElement('canvas')
  copy.width = w
  copy.height = h
  const ctx = copy.getContext('2d', { willReadFrequently: true })
  try {
    ctx.drawImage(src, 0, 0)
  } catch (err) {
    return { lit: 0, w, h, reason: String(err) }
  }
  const data = ctx.getImageData(0, 0, w, h).data
  let lit = 0
  let ice = 0
  for (let i = 0; i < data.length; i += 16) {
    const a = data[i + 3]
    if (a > 10) {
      lit += 1
      if (data[i + 2] > data[i + 1] && data[i + 2] > 80) ice += 1
    }
  }
  return { lit, ice, w, h }
}

function layersAt(page, x, y) {
  return page.evaluate(([px, py]) => window.__waterfall.layers(px, py), [x, y])
}

const fails = []
function check(cond, msg, extra) {
  if (!cond) fails.push(extra !== undefined ? `${msg} ${JSON.stringify(extra)}` : msg)
}

async function snapSlider(page, t) {
  const box = await page.locator('.wf-slider-track').boundingBox()
  const x = box.x + box.width * t
  const y = box.y + box.height / 2
  const cdp = await cdpOf(page)
  if (cdp) {
    await dispatchTouch(cdp, 'touchStart', [{ id: 4, x, y }])
    await dispatchTouch(cdp, 'touchEnd', [])
    return 'cdp'
  }
  await page.touchscreen.tap(x, y)
  return 'touchscreen'
}

async function tapPoint(page, x, y, id = 8) {
  const cdp = await cdpOf(page)
  if (cdp) {
    await dispatchTouch(cdp, 'touchStart', [{ id, x, y }])
    await dispatchTouch(cdp, 'touchEnd', [])
    return 'cdp'
  }
  await page.touchscreen.tap(x, y)
  return 'touchscreen'
}

async function buttonPoint(page, selector) {
  const box = await page.locator(selector).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function isButtonLayer(layer, name) {
  const cls = String(layer?.className || '')
  const id = String(layer?.id || '')
  return layer?.tag === 'BUTTON' && (cls.includes(name) || id.includes(name))
}

async function exerciseHudButtons(page, report, label, drawPts) {
  report.undoLayer = await layersAt(page, ...(await buttonPoint(page, '.wf-undo').then((p) => [p.x, p.y])))
  report.resetLayer = await layersAt(page, ...(await buttonPoint(page, '.wf-reset').then((p) => [p.x, p.y])))
  check(isButtonLayer(report.undoLayer[0], 'wf-undo'), `${label} undo elementFromPoint`, report.undoLayer[0])
  check(isButtonLayer(report.resetLayer[0], 'wf-reset'), `${label} reset elementFromPoint`, report.resetLayer[0])

  const beforeDraw = await page.evaluate(() => window.__waterfall.stats().strokes)
  const second = drawPts.map((p, i) => ({ x: p.x, y: p.y + 70 + i }))
  const cdp = await cdpOf(page)
  if (cdp) await cdpStroke(page, second)
  else {
    await page.mouse.move(second[0].x, second[0].y)
    await page.mouse.down()
    await page.mouse.move(second[second.length - 1].x, second[second.length - 1].y, { steps: 6 })
    await page.mouse.up()
  }
  await page.waitForTimeout(180)
  const two = await page.evaluate(() => window.__waterfall.stats())
  check(two.strokes === beforeDraw + 1, `${label} second stroke`, two)

  const undoPt = await buttonPoint(page, '.wf-undo')
  report.undoVia = await tapPoint(page, undoPt.x, undoPt.y, 11)
  await page.waitForTimeout(150)
  report.afterUndo = await page.evaluate(() => window.__waterfall.stats())
  check(report.afterUndo.strokes === two.strokes - 1, `${label} undo drops one stroke`, report.afterUndo)

  await page.evaluate(() => window.__waterfall.scrollTo(Math.max(120, window.__waterfall.stats().maxCam * 0.2)))
  const beforeReset = await page.evaluate(() => window.__waterfall.stats())
  const resetPt = await buttonPoint(page, '.wf-reset')
  report.resetVia = await tapPoint(page, resetPt.x, resetPt.y, 12)
  await page.waitForTimeout(180)
  report.afterReset = await page.evaluate(() => window.__waterfall.stats())
  check(report.afterReset.strokes === 0, `${label} reset strokes 0`, report.afterReset)
  check(report.afterReset.camY === 0, `${label} reset camY 0`, report.afterReset)
  check(report.afterReset.poolLevel <= 56, `${label} reset pool`, report.afterReset)
  check(report.afterReset.particles <= beforeReset.particles, `${label} reset particles`, {
    before: beforeReset.particles,
    after: report.afterReset.particles,
  })
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
  attachLogs(page, report)
  try {
    await startLive(page)
    report.stats0 = await page.evaluate(() => window.__waterfall.stats())
    report.water = await page.evaluate(sampleWaterPixels)
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
    await exerciseHudButtons(page, report, 'chromium', [
      { x, y },
      { x: x + 40, y: y + 6 },
      { x: x + 90, y: y + 10 },
    ])
    report.strokeVia2 = await cdpStroke(page, [
      { x, y: y + 40 },
      { x: x + 50, y: y + 48 },
      { x: x + 100, y: y + 52 },
    ])
    await page.waitForTimeout(160)
    report.afterRedraw = await page.evaluate(() => window.__waterfall.stats())

    const beforeCam = report.afterReset?.camY ?? 0
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
        fps: s.fps,
      }
    })
    report.layersScroll = await layersAt(page, box.x + 120, box.y + 300)
    report.layersBasin = await layersAt(page, box.x + 120, report.maxScroll.hudTop - 40)
    report.keyVia = await cdpKey(page, 'ArrowDown', 'ArrowDown', 40)
    await cdpKey(page, 'ArrowDown', 'ArrowDown', 40)
    report.afterKey = await page.evaluate(() => window.__waterfall.stats())
    report.sliderVia = await snapSlider(page, 0.04)
    await page.waitForTimeout(80)
    report.sliderSlow = await page.evaluate(() => window.__waterfall.stats().pressure)
    await snapSlider(page, 0.96)
    await page.waitForTimeout(80)
    report.sliderFast = await page.evaluate(() => window.__waterfall.stats().pressure)
    await snapSlider(page, 0.5)
    await page.waitForTimeout(80)
    report.sliderMed = await page.evaluate(() => window.__waterfall.stats().pressure)

    check(report.stats0.particles > 0, 'chromium water particles', report.stats0)
    check(report.water.lit > 20, 'chromium water pixels', report.water)
    check(report.afterDraw.strokes >= 1, 'cdp draw stroke', report.afterDraw)
    check(report.afterRedraw?.strokes >= 1, 'cdp draw after reset', report.afterRedraw)
    check(report.afterScroll.camY > beforeCam + 8, 'two-finger scroll', { before: beforeCam, after: report.afterScroll.camY })
    check(report.maxScroll.maxCam > 100, 'maxCam > 0', report.maxScroll)
    check(report.maxScroll.camY >= report.maxScroll.maxCam - 1, 'scrolled to max', report.maxScroll)
    check(report.maxScroll.basinScreenY <= report.maxScroll.hudTop + 2, 'basin above bar', report.maxScroll)
    check(report.layersDraw[0]?.className === 'wf-hit', 'draw layer wf-hit', report.layersDraw[0])
    check(report.layersScroll[0]?.className === 'wf-hit', 'scroll layer wf-hit', report.layersScroll[0])
    check(!/crt/.test(JSON.stringify(report.layersDraw[0])), 'crt not on top', report.layersDraw[0])
    check(report.sliderSlow === 'slow' && report.sliderFast === 'fast' && report.sliderMed === 'medium', 'slider', {
      slow: report.sliderSlow,
      fast: report.sliderFast,
      med: report.sliderMed,
    })
    check((report.pageErrors?.length || 0) === 0, 'chromium page errors', report.pageErrors)
    check((report.consoleErrors?.length || 0) === 0, 'chromium console errors', report.consoleErrors)
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
  attachLogs(page, report)
  try {
    await startLive(page, query)
    report.stats0 = await page.evaluate(() => window.__waterfall.stats())
    report.water = await page.evaluate(sampleWaterPixels)
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
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 80, y + 12, { steps: 8 })
      await page.mouse.up()
      report.strokeVia = 'touchscreen+mouse'
    }
    await page.waitForTimeout(250)
    report.afterDraw = await page.evaluate(() => window.__waterfall.stats())
    await exerciseHudButtons(page, report, label, [
      { x, y },
      { x: x + 70, y: y + 8 },
    ])
    if (cdp) {
      await cdpStroke(page, [
        { x, y: y + 36 },
        { x: x + 70, y: y + 44 },
      ])
    } else {
      await page.mouse.move(x, y + 36)
      await page.mouse.down()
      await page.mouse.move(x + 80, y + 48, { steps: 6 })
      await page.mouse.up()
    }
    await page.waitForTimeout(160)
    report.afterRedraw = await page.evaluate(() => window.__waterfall.stats())
    const track = await page.locator('.wf-slider-track').boundingBox()
    await page.touchscreen.tap(track.x + track.width * 0.04, track.y + track.height / 2)
    await page.waitForTimeout(80)
    report.sliderSlow = await page.evaluate(() => window.__waterfall.stats().pressure)
    await page.touchscreen.tap(track.x + track.width * 0.96, track.y + track.height / 2)
    await page.waitForTimeout(80)
    report.sliderFast = await page.evaluate(() => window.__waterfall.stats().pressure)
    check(report.stats0.particles > 0 || report.afterDraw.particles > 0, `${label} water particles`, report.afterDraw)
    check(report.water.lit > 8, `${label} water pixels`, report.water)
    check(report.afterDraw.strokes >= 1, `${label} draw`, report.afterDraw)
    check(report.afterRedraw?.strokes >= 1, `${label} draw after reset`, report.afterRedraw)
    check(report.layersDraw[0]?.className === 'wf-hit', `${label} layer wf-hit`, report.layersDraw[0])
    check(report.sliderSlow === 'slow' && report.sliderFast === 'fast', `${label} slider`, {
      slow: report.sliderSlow,
      fast: report.sliderFast,
    })
    if (report.crashed) fails.push(`${label} crashed`)
    check((report.pageErrors?.length || 0) === 0, `${label} page errors`, report.pageErrors)
  } catch (err) {
    report.error = String(err)
    if (report.crashed) fails.push(`${label} crashed: ${err.message}`)
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
        fps: chromiumReport.afterDraw?.fps || chromiumReport.stats0?.fps,
        particles: chromiumReport.afterDraw?.particles,
        water: chromiumReport.water,
        strokes: chromiumReport.afterDraw?.strokes,
        undo: chromiumReport.afterUndo,
        reset: chromiumReport.afterReset,
        undoLayer: chromiumReport.undoLayer?.[0],
        resetLayer: chromiumReport.resetLayer?.[0],
        camY: chromiumReport.afterScroll?.camY,
        max: chromiumReport.maxScroll,
        slider: { slow: chromiumReport.sliderSlow, fast: chromiumReport.sliderFast, med: chromiumReport.sliderMed },
        layers0: chromiumReport.layersDraw?.[0],
        layersScroll0: chromiumReport.layersScroll?.[0],
        via: {
          stroke: chromiumReport.strokeVia,
          scroll: chromiumReport.scrollVia,
          key: chromiumReport.keyVia,
          slider: chromiumReport.sliderVia,
        },
        pageErrors: chromiumReport.pageErrors,
        consoleErrors: chromiumReport.consoleErrors,
        error: chromiumReport.error,
      },
      webkitCanvas: {
        solver: webkitCanvas.afterDraw?.solver || webkitCanvas.stats0?.solver,
        backend: webkitCanvas.afterDraw?.backend || webkitCanvas.stats0?.backend,
        fps: webkitCanvas.afterDraw?.fps || webkitCanvas.stats0?.fps,
        particles: webkitCanvas.afterDraw?.particles,
        water: webkitCanvas.water,
        strokes: webkitCanvas.afterDraw?.strokes,
        undo: webkitCanvas.afterUndo,
        reset: webkitCanvas.afterReset,
        undoLayer: webkitCanvas.undoLayer?.[0],
        resetLayer: webkitCanvas.resetLayer?.[0],
        slider: { slow: webkitCanvas.sliderSlow, fast: webkitCanvas.sliderFast },
        layers0: webkitCanvas.layersDraw?.[0],
        via: webkitCanvas.strokeVia,
        crashed: webkitCanvas.crashed || false,
        pageErrors: webkitCanvas.pageErrors,
        error: webkitCanvas.error,
      },
      webkitGl: {
        solver: webkitGl.afterDraw?.solver || webkitGl.stats0?.solver,
        backend: webkitGl.afterDraw?.backend || webkitGl.stats0?.backend,
        fps: webkitGl.afterDraw?.fps || webkitGl.stats0?.fps,
        particles: webkitGl.afterDraw?.particles,
        water: webkitGl.water,
        strokes: webkitGl.afterDraw?.strokes,
        undo: webkitGl.afterUndo,
        reset: webkitGl.afterReset,
        undoLayer: webkitGl.undoLayer?.[0],
        resetLayer: webkitGl.resetLayer?.[0],
        slider: { slow: webkitGl.sliderSlow, fast: webkitGl.sliderFast },
        layers0: webkitGl.layersDraw?.[0],
        via: webkitGl.strokeVia,
        crashed: webkitGl.crashed || false,
        pageErrors: webkitGl.pageErrors,
        error: webkitGl.error,
      },
    },
    null,
    2,
  ),
)
if (!ok) process.exit(1)
