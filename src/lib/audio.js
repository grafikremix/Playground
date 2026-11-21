// Synthesized Web Audio for idea actions. No samples.
// iOS Safari only unlocks inside a user-activation event (touchend / click /
// pointerup / keydown). pointerdown and drags do not count. Keep priming until
// ctx.state === 'running', play a 1-sample buffer, and hold a silent <audio>
// loop so output rides the media channel (ringer switch). Peek/stills stay quiet.

let ctx
let master
let comp
let live = 0
let unlocked = false
let gestured = false
let priming = false
let media
let mediaUrl

const MAX = 14
const GESTURES = ['touchstart', 'touchend', 'pointerup', 'click', 'keydown']
const GESTURE_OPTS = { capture: true, passive: true }

export function silent() {
  return document.body.classList.contains('is-peek') || document.body.classList.contains('is-still')
}

export function getContext() {
  return ctx || null
}

export function getMaster() {
  return master || null
}

function setPlaybackSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
  } catch {
    /* Safari 16.4+ */
  }
}

function silentWavUri() {
  if (mediaUrl) return mediaUrl
  const rate = 8000
  const n = 160
  const bytes = 44 + n
  const buf = new ArrayBuffer(bytes)
  const v = new DataView(buf)
  const ascii = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  ascii(36, 'data')
  v.setUint32(40, n, true)
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128)
  let bin = ''
  const u8 = new Uint8Array(buf)
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  mediaUrl = `data:audio/wav;base64,${btoa(bin)}`
  return mediaUrl
}

function startSilentMedia() {
  if (typeof document === 'undefined') return
  if (!media) {
    media = document.createElement('audio')
    media.setAttribute('playsinline', '')
    media.setAttribute('webkit-playsinline', 'true')
    media.loop = true
    media.preload = 'auto'
    media.controls = false
    media.volume = 0.01
    media.src = silentWavUri()
    media.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none;left:0;top:0'
    document.body.appendChild(media)
  }
  const play = media.play()
  if (play && play.catch) play.catch(() => {})
}

function tickSilence(a) {
  if (!a) return
  try {
    const buf = a.createBuffer(1, 1, a.sampleRate)
    const src = a.createBufferSource()
    src.buffer = buf
    const g = a.createGain()
    g.gain.value = 0
    src.connect(g)
    g.connect(a.destination)
    src.start(0)
  } catch {
    /* ignore */
  }
}

function onState() {
  const s = ctx?.state
  if (s === 'running') {
    unlocked = true
    gestured = true
    stopPriming()
  } else if (s === 'suspended' || s === 'interrupted') {
    unlocked = false
    startPriming()
  }
}

function createCtx() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  setPlaybackSession()
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.16
  comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -20
  comp.knee.value = 10
  comp.ratio.value = 8
  comp.attack.value = 0.003
  comp.release.value = 0.14
  master.connect(comp)
  comp.connect(ctx.destination)
  ctx.addEventListener('statechange', onState)
  return ctx
}

function resumeCtx() {
  if (!ctx) return
  setPlaybackSession()
  startSilentMedia()
  tickSilence(ctx)
  const p = ctx.resume?.()
  if (p && p.then) {
    p.then(() => {
      if (ctx?.state === 'running') {
        unlocked = true
        stopPriming()
      }
    }).catch(() => {})
  }
  if (ctx.state === 'running') {
    unlocked = true
    stopPriming()
  }
}

export function unlock() {
  if (silent()) return null
  gestured = true
  const a = createCtx()
  if (!a) return null
  resumeCtx()
  return ctx
}

function prime() {
  if (silent()) return
  unlock()
}

function startPriming() {
  if (priming || typeof window === 'undefined') return
  priming = true
  for (const ev of GESTURES) {
    window.addEventListener(ev, prime, GESTURE_OPTS)
    document.addEventListener(ev, prime, GESTURE_OPTS)
  }
}

function stopPriming() {
  if (!priming || typeof window === 'undefined') return
  priming = false
  for (const ev of GESTURES) {
    window.removeEventListener(ev, prime, GESTURE_OPTS)
    document.removeEventListener(ev, prime, GESTURE_OPTS)
  }
}

function onShow() {
  if (silent() || !ctx) return
  setPlaybackSession()
  startSilentMedia()
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
    startPriming()
    resumeCtx()
  }
}

if (typeof window !== 'undefined') {
  startPriming()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onShow()
  })
  window.addEventListener('pageshow', onShow)
}

export function canPlay() {
  if (!ctx || silent() || ctx.state === 'closed') return false
  if (ctx.state === 'running') return true
  if (ctx.state === 'interrupted') return false
  return gestured
}

export function audioNow() {
  return ctx ? ctx.currentTime : 0
}

function take(limit = MAX) {
  if (!canPlay()) return null
  if (live >= limit) return null
  live++
  return ctx
}

function release(ms) {
  window.setTimeout(() => {
    live = Math.max(0, live - 1)
  }, ms)
}

export function envGain(duration, peak) {
  const a = take()
  if (!a) return null
  const g = a.createGain()
  const t = a.currentTime
  const p = Math.max(0.0002, peak)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(p, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  g.connect(master)
  release(duration * 1000 + 40)
  return { g, t, ctx: a }
}

export function tone({ type = 'sine', freq = 440, duration = 0.16, peak = 0.12, slide } = {}) {
  const e = envGain(duration, peak)
  if (!e) return null
  const o = e.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(Math.max(20, freq), e.t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), e.t + duration * 0.92)
  o.connect(e.g)
  o.start(e.t)
  o.stop(e.t + duration)
  return o
}

export function noise({ duration = 0.18, peak = 0.1, freq = 800, q = 1, type = 'bandpass', slide } = {}) {
  const e = envGain(duration, peak)
  if (!e) return null
  const a = e.ctx
  const len = Math.max(1, Math.floor(a.sampleRate * duration))
  const buf = a.createBuffer(1, len, a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, e.t)
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, slide), e.t + duration * 0.9)
  f.Q.value = q
  src.connect(f)
  f.connect(e.g)
  src.start(e.t)
  src.stop(e.t + duration)
  return src
}

export function loopNoise({ freq = 420, q = 0.8 } = {}) {
  const a = unlock()
  if (!a || silent()) return null
  const len = Math.max(1, Math.floor(a.sampleRate * 0.35))
  const buf = a.createBuffer(1, len, a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = a.createGain()
  g.gain.value = 0
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start()
  return {
    set(gain, hz) {
      if (!ctx) return
      const t = ctx.currentTime
      g.gain.setTargetAtTime(Math.max(0, gain), t, 0.05)
      if (hz) f.frequency.setTargetAtTime(hz, t, 0.08)
    },
    stop() {
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
      src.disconnect()
      f.disconnect()
      g.disconnect()
    },
  }
}

export function voices() {
  return live
}

export function plinkAllowed(limit = 6) {
  return canPlay() && live < limit
}
