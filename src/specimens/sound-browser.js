import { unlock, getContext, getMaster, silent } from '../lib/audio.js'
import { isLive } from '../lib/play.js'
import { songToBuffer } from '../lib/zzfxm.js'
import { render } from 'plinkfx/core'
import { TREE, findNode } from './sound-browser-data.js'

const TAP = 12
const MIN_S = 0.5
const MAX_S = 2.5
const COL_W = 228
const GAP = 14
const ICE = 'rgba(183,236,255,0.92)'

const FOLDER_ICON = `<svg class="sb-ico" viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 5.5h4l1.2 1.5H15.5v7H2.5z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.5 7h13" fill="none" stroke="currentColor" stroke-width="1"/></svg>`
const FILE_ICON = `<svg class="sb-ico" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 2.5h5.5L15 7v8.5H5z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M10.5 2.5V7H15" fill="none" stroke="currentColor" stroke-width="1"/><path d="M7 11.5h6M7 13.5h4" fill="none" stroke="currentColor" stroke-width="1"/></svg>`

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

export function mount(stage, { still, peek } = {}) {
  const preview = !!(still || peek)
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  const wrap = document.createElement('div')
  wrap.className = 'sb-wrap'
  const world = document.createElement('div')
  world.className = 'sb-world'
  wrap.appendChild(world)
  const dock = document.createElement('footer')
  dock.className = 'sb-dock'
  dock.innerHTML = `
    <button class="sb-toggle" type="button" aria-label="Play">Play</button>
    <div class="sb-now">
      <p class="sb-track">Select a loop</p>
      <p class="sb-credit"><a class="sb-link" href="https://github.com/btahir/open-lofi" target="_blank" rel="noopener">GitHub</a></p>
    </div>
    <canvas class="sb-wave" width="220" height="36" aria-hidden="true"></canvas>`
  if (preview) stage.replaceChildren(wrap)
  else stage.replaceChildren(wrap, dock)

  const toggle = dock.querySelector('.sb-toggle')
  const trackEl = dock.querySelector('.sb-track')
  const creditEl = dock.querySelector('.sb-credit')
  const wave = dock.querySelector('.sb-wave')
  const wctx = wave.getContext('2d')

  const cam = preview ? { x: -8, y: 22, s: 1.08, vx: 0, vy: 0 } : { x: 18, y: 18, s: 1, vx: 0, vy: 0 }
  let stack = preview ? ['open-lofi', 'ambient-lofi'] : []
  let playing = preview ? findNode('ol-deep-space-loop') : null
  let paused = false
  let source = null
  let tonePatch = null
  let analyser = null
  let bus = null
  let raf = 0
  let mom = 0
  let panAnim = 0
  let zoomPan = 0
  const cache = new Map()
  const pts = new Map()
  let moved = 0
  let lastMoved = 0
  let lastPan = false
  let lastPinch = 0
  let pan = false

  function applyCam() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`
  }

  function live() {
    return isLive()
  }

  function columns() {
    const cols = [TREE]
    let nodes = TREE
    for (const id of stack) {
      const n = nodes.find((x) => x.id === id)
      if (!n?.children) break
      cols.push(n.children)
      nodes = n.children
    }
    return cols
  }

  function paint() {
    const cols = columns()
    world.replaceChildren()
    cols.forEach((nodes, depth) => {
      const col = document.createElement('section')
      col.className = 'sb-col'
      col.style.left = `${depth * (COL_W + GAP)}px`
      const head = document.createElement('header')
      head.className = 'sb-head'
      if (depth === 0) {
        head.innerHTML = `<span>Libraries</span>`
      } else {
        const parent = findNode(stack[depth - 1])
        const href = parent?.href || '#'
        head.innerHTML = `<a class="sb-head-link" href="${href}" target="_blank" rel="noopener">${parent?.title || ''}</a>`
      }
      col.appendChild(head)
      const selected = stack[depth]
      for (const node of nodes) {
        const row = document.createElement('button')
        row.type = 'button'
        row.className = `sb-row${node.kind === 'audio' ? ' is-audio' : ' is-folder'}${selected === node.id ? ' is-on' : ''}${playing?.id === node.id ? ' is-playing' : ''}`
        row.dataset.id = node.id
        row.dataset.depth = String(depth)
        row.innerHTML = `${node.kind === 'audio' ? FILE_ICON : FOLDER_ICON}<span class="sb-row-text"><span class="sb-row-title">${node.title}</span><span class="sb-row-sub">${node.credit || ''}</span></span>${playing?.id === node.id ? '<canvas class="sb-row-wave" width="72" height="22"></canvas>' : ''}`
        col.appendChild(row)
      }
      world.appendChild(col)
    })
    applyCam()
    if (!preview) requestAnimationFrame(() => ensureDeepest())
  }

  function stopPanAnim() {
    if (panAnim) cancelAnimationFrame(panAnim)
    panAnim = 0
  }

  function ensureDeepest() {
    const last = world.querySelector('.sb-col:last-child')
    if (!last) return
    const wr = wrap.getBoundingClientRect()
    const cr = last.getBoundingClientRect()
    const pad = 18
    const dockH = preview ? 12 : 78
    let dx = 0
    let dy = 0
    if (cr.right > wr.right - pad) dx = wr.right - pad - cr.right
    if (cr.left < wr.left + pad) dx = wr.left + pad - cr.left
    if (cr.bottom > wr.bottom - dockH) dy = wr.bottom - dockH - cr.bottom
    if (cr.top < wr.top + pad) dy = wr.top + pad - cr.top
    if (!dx && !dy) return
    stopPanAnim()
    const x0 = cam.x
    const y0 = cam.y
    const t0 = performance.now()
    const dur = 280
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = 1 - (1 - k) ** 3
      cam.x = x0 + dx * e
      cam.y = y0 + dy * e
      applyCam()
      if (k < 1) panAnim = requestAnimationFrame(tick)
      else panAnim = 0
    }
    panAnim = requestAnimationFrame(tick)
  }

  function scheduleEnsure() {
    if (preview) return
    if (zoomPan) clearTimeout(zoomPan)
    zoomPan = window.setTimeout(() => {
      zoomPan = 0
      ensureDeepest()
    }, 80)
  }

  function zoomAt(sx, sy, factor) {
    stopPanAnim()
    const wr = wrap.getBoundingClientRect()
    const px = sx - wr.left
    const py = sy - wr.top
    const s2 = clamp(cam.s * factor, MIN_S, MAX_S)
    if (s2 === cam.s) return
    const wx = (px - cam.x) / cam.s
    const wy = (py - cam.y) / cam.s
    cam.s = s2
    cam.x = px - wx * s2
    cam.y = py - wy * s2
    applyCam()
    scheduleEnsure()
  }

  function select(id, depth) {
    const node = findNode(id)
    if (!node) return
    if (node.kind === 'folder') {
      stack = [...stack.slice(0, depth), id]
      paint()
      return
    }
    stack = [...stack.slice(0, depth)]
    paint()
    playNode(node)
  }

  function creditHtml(node) {
    if (!node) return `<a class="sb-link" href="https://github.com/grafikremix/Playground" target="_blank" rel="noopener">GitHub</a>`
    const extra = node.playerCredit ? ` · player ${node.playerCredit}` : ''
    return `<a class="sb-link" href="${node.href}" target="_blank" rel="noopener">${node.credit}${extra}</a>`
  }

  function setNow(node, isPaused) {
    playing = node
    paused = !!isPaused
    trackEl.textContent = node ? node.title : 'Select a loop'
    creditEl.innerHTML = creditHtml(node)
    toggle.textContent = !node ? 'Play' : paused ? 'Play' : 'Pause'
    toggle.setAttribute('aria-label', toggle.textContent)
    paint()
  }

  function graph() {
    const ctx = getContext()
    const master = getMaster()
    if (!ctx || !master) return null
    if (!bus || bus.context !== ctx) {
      bus = ctx.createGain()
      bus.gain.value = 1
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      bus.connect(analyser)
      bus.connect(master)
    }
    return { ctx, bus, analyser }
  }

  function stopSrc() {
    try {
      source?.stop?.()
    } catch {
      /* */
    }
    try {
      source?.disconnect?.()
    } catch {
      /* */
    }
    source = null
    if (tonePatch) {
      try {
        tonePatch.stop()
      } catch {
        /* */
      }
      tonePatch = null
    }
  }

  async function bufferFor(node, ctx) {
    if (cache.has(node.id)) return cache.get(node.id)
    if (node.engine === 'file') {
      const res = await fetch(node.src)
      const raw = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(raw.slice(0))
      cache.set(node.id, buf)
      return buf
    }
    if (node.engine === 'plink') {
      const samples = render(node.sound, { seed: 1, sampleRate: ctx.sampleRate || 44100 })
      const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate || 44100)
      buf.getChannelData(0).set(samples)
      cache.set(node.id, buf)
      return buf
    }
    if (node.engine === 'zzfxm') {
      const buf = songToBuffer(ctx, node.song)
      cache.set(node.id, buf)
      return buf
    }
    return null
  }

  async function startTone(node, ctx, busNode) {
    const { Synth, NoiseSynth, Filter, LFO, Loop, Transport, Gain, setContext } = await import('tone')
    setContext(ctx, false)
    Transport.stop()
    Transport.cancel()
    const g = new Gain(0.22).connect(busNode)
    const parts = []
    const stop = () => {
      try {
        Transport.stop()
        Transport.cancel()
      } catch {
        /* */
      }
      for (const p of parts) {
        try {
          p.dispose?.()
        } catch {
          /* */
        }
      }
    }
    if (node.patch === 'icy-pad') {
      const a = new Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.4, decay: 0.2, sustain: 0.7, release: 1.4 } }).connect(g)
      const b = new Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.5, decay: 0.2, sustain: 0.7, release: 1.6 } }).connect(g)
      const f = new Filter(720, 'lowpass').connect(g)
      a.disconnect()
      b.disconnect()
      a.connect(f)
      b.connect(f)
      const lfo = new LFO(0.08, 420, 980).connect(f.frequency)
      lfo.start()
      parts.push(a, b, f, lfo)
      const loop = new Loop((time) => {
        a.triggerAttackRelease('C3', '2n', time, 0.35)
        b.triggerAttackRelease('G3', '2n', time, 0.22)
      }, '1m')
      loop.start(0)
      parts.push(loop)
    } else if (node.patch === 'glass-room') {
      const s = new Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.08, decay: 0.3, sustain: 0.2, release: 1.2 } }).connect(g)
      parts.push(s)
      const notes = ['E4', 'B4', 'G4', 'D5']
      let i = 0
      const loop = new Loop((time) => {
        s.triggerAttackRelease(notes[i % notes.length], '4n', time, 0.28)
        i += 1
      }, '2n')
      loop.start(0)
      parts.push(loop)
    } else if (node.patch === 'slow-arp') {
      const s = new Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.12, sustain: 0.05, release: 0.3 } }).connect(g)
      const f = new Filter(1800, 'lowpass').connect(g)
      s.disconnect()
      s.connect(f)
      parts.push(s, f)
      const notes = ['C3', 'G3', 'C4', 'D4', 'G3']
      let i = 0
      const loop = new Loop((time) => {
        s.triggerAttackRelease(notes[i % notes.length], '8n', time, 0.22)
        i += 1
      }, '4n')
      loop.start(0)
      parts.push(loop)
    } else {
      const n = new NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.2, decay: 0.05, sustain: 0.4, release: 0.4 } }).connect(g)
      const f = new Filter(380, 'bandpass')
      n.disconnect()
      n.connect(f)
      f.connect(g)
      const lfo = new LFO(1.4, 220, 620).connect(f.frequency)
      lfo.start()
      parts.push(n, f, lfo)
      const loop = new Loop((time) => {
        n.triggerAttackRelease('2n', time, 0.5)
      }, '2n')
      loop.start(0)
      parts.push(loop)
    }
    parts.push(g)
    Transport.bpm.value = 72
    Transport.start()
    return { stop }
  }

  async function playNode(node) {
    if (preview || silent() || !live()) {
      setNow(node, false)
      return
    }
    try {
      unlock()
    } catch {
      /* */
    }
    stopSrc()
    setNow(node, false)
    try {
      const g = graph()
      if (!g) return
      if (node.engine === 'tone') {
        tonePatch = await startTone(node, g.ctx, g.bus)
        return
      }
      const buf = await bufferFor(node, g.ctx)
      if (!buf || playing?.id !== node.id) return
      const src = g.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(g.bus)
      src.start()
      source = src
    } catch {
      /* AudioContext errors must never kill the UI */
    }
  }

  function pausePlay() {
    if (!playing) return
    if (paused) {
      playNode(playing)
      return
    }
    stopSrc()
    paused = true
    toggle.textContent = 'Play'
    paint()
  }

  function onWrapDown(e) {
    if (e.pointerType === 'mouse' && e.button) return
    if (e.target.closest?.('a')) return
    wrap.setPointerCapture?.(e.pointerId)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved = 0
    pan = false
    lastPinch = 0
    cam.vx = 0
    cam.vy = 0
    stopPanAnim()
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      lastPinch = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  function onWrapMove(e) {
    if (!pts.has(e.pointerId)) return
    const prev = pts.get(e.pointerId)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    moved += Math.hypot(dx, dy)
    if (pts.size >= 2) {
      pan = true
      const [a, b] = [...pts.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (lastPinch > 8 && dist > 8) {
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        zoomAt(midX, midY, dist / lastPinch)
      }
      lastPinch = dist
      return
    }
    if (moved > TAP) {
      pan = true
      cam.x += dx
      cam.y += dy
      cam.vx = dx
      cam.vy = dy
      applyCam()
    }
  }

  function onWrapUp(e) {
    if (!pts.has(e.pointerId)) return
    pts.delete(e.pointerId)
    lastMoved = moved
    lastPan = pan
    if (pts.size) {
      lastPinch = 0
      return
    }
    if (!pan && moved <= TAP) {
      const hit = document.elementFromPoint(e.clientX, e.clientY)
      const link = hit?.closest?.('a')
      if (link && wrap.contains(link)) return
      const row = hit?.closest?.('.sb-row')
      if (row && live()) select(row.dataset.id, Number(row.dataset.depth))
    } else if (pan) {
      const decay = () => {
        cam.vx *= 0.9
        cam.vy *= 0.9
        cam.x += cam.vx
        cam.y += cam.vy
        applyCam()
        if (Math.hypot(cam.vx, cam.vy) > 0.18) mom = requestAnimationFrame(decay)
        else {
          mom = 0
          if (lastPinch) scheduleEnsure()
        }
      }
      if (mom) cancelAnimationFrame(mom)
      mom = requestAnimationFrame(decay)
    }
  }

  wrap.addEventListener('pointerdown', onWrapDown)
  wrap.addEventListener('pointermove', onWrapMove)
  wrap.addEventListener('pointerup', onWrapUp)
  wrap.addEventListener('pointercancel', onWrapUp)
  wrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.96 : 1.04)
    },
    { passive: false },
  )
  const blockGesture = (e) => e.preventDefault()
  wrap.addEventListener('gesturestart', blockGesture)
  wrap.addEventListener('gesturechange', blockGesture)
  wrap.addEventListener('gestureend', blockGesture)

  toggle.addEventListener('click', () => {
    try {
      unlock()
    } catch {
      /* */
    }
    if (!playing) return
    pausePlay()
  })

  function drawWave(canvas, ctx2, data) {
    const w = canvas.clientWidth || canvas.width
    const h = canvas.clientHeight || canvas.height
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    ctx2.clearRect(0, 0, w, h)
    ctx2.strokeStyle = ICE
    ctx2.lineWidth = 1
    ctx2.beginPath()
    const n = data.length
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w
      const y = (data[i] / 255) * h
      if (i) ctx2.lineTo(x, y)
      else ctx2.moveTo(x, y)
    }
    ctx2.stroke()
  }

  function tick() {
    raf = requestAnimationFrame(tick)
    if (!analyser || paused || !playing) {
      if (wctx) {
        wctx.clearRect(0, 0, wave.width, wave.height)
        wctx.strokeStyle = 'rgba(183,236,255,0.22)'
        wctx.beginPath()
        wctx.moveTo(0, wave.height / 2)
        wctx.lineTo(wave.width, wave.height / 2)
        wctx.stroke()
      }
      return
    }
    const data = new Uint8Array(analyser.fftSize)
    try {
      analyser.getByteTimeDomainData(data)
    } catch {
      return
    }
    if (!preview) drawWave(wave, wctx, data)
    world.querySelectorAll('.sb-row-wave').forEach((c) => {
      const cx = c.getContext('2d')
      if (cx) drawWave(c, cx, data)
    })
  }
  raf = requestAnimationFrame(tick)

  paint()
  applyCam()
  if (preview && playing) {
    const data = new Uint8Array(64)
    for (let i = 0; i < 64; i++) data[i] = 128 + Math.sin(i / 4.2) * 34
    world.querySelectorAll('.sb-row-wave').forEach((c) => {
      const cx = c.getContext('2d')
      if (cx) drawWave(c, cx, data)
    })
  }

  const stats = () => ({
    scale: cam.s,
    x: cam.x,
    y: cam.y,
    minScale: MIN_S,
    maxScale: MAX_S,
    tap: TAP,
    stack: [...stack],
    playing: playing ? { id: playing.id, title: playing.title, engine: playing.engine, href: playing.href, credit: playing.credit } : null,
    paused,
    loop: !!(source && source.loop) || !!(playing && playing.engine === 'tone' && !paused),
    wave: !!(analyser && playing && !paused),
    lastMoved,
    lastPan,
    pe: getComputedStyle(wrap).pointerEvents,
  })
  wrap.__sb = stats
  window.__soundBrowser = {
    get scale() {
      return cam.s
    },
    get stack() {
      return [...stack]
    },
    stats,
    zoom: (f) => zoomAt(wrap.getBoundingClientRect().left + 80, wrap.getBoundingClientRect().top + 80, f),
    panBy: (dx, dy) => {
      stopPanAnim()
      cam.x += dx
      cam.y += dy
      applyCam()
    },
    clampZoom: (s) => {
      stopPanAnim()
      cam.s = clamp(s, MIN_S, MAX_S)
      applyCam()
      scheduleEnsure()
      return cam.s
    },
    select,
    find: findNode,
  }

  function onStart() {
    if (preview) return
    paint()
  }
  window.addEventListener('playground-start', onStart)

  return () => {
    window.removeEventListener('playground-start', onStart)
    cancelAnimationFrame(raf)
    if (mom) cancelAnimationFrame(mom)
    if (zoomPan) clearTimeout(zoomPan)
    stopPanAnim()
    stopSrc()
    wrap.removeEventListener('pointerdown', onWrapDown)
    wrap.removeEventListener('pointermove', onWrapMove)
    wrap.removeEventListener('pointerup', onWrapUp)
    wrap.removeEventListener('pointercancel', onWrapUp)
    wrap.removeEventListener('gesturestart', blockGesture)
    wrap.removeEventListener('gesturechange', blockGesture)
    wrap.removeEventListener('gestureend', blockGesture)
    if (window.__soundBrowser) delete window.__soundBrowser
  }
}
