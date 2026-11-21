// Synthesized Web Audio for idea actions. No samples.
// Unlock on first gesture (iOS). Peek and stills stay silent.
// Low master + compressor so stacked notes shimmer instead of clip.

let ctx
let master
let comp
let live = 0

const MAX = 14

export function silent() {
  return document.body.classList.contains('is-peek') || document.body.classList.contains('is-still')
}

export function unlock() {
  if (silent()) return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) {
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
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function arm() {
  unlock()
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', arm, { capture: true })
  window.addEventListener('keydown', arm, { capture: true })
  window.addEventListener('touchstart', arm, { capture: true })
}

export function canPlay() {
  return Boolean(ctx && ctx.state === 'running' && !silent())
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
