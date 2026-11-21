// Size a 2d canvas from the frame's border box. iOS Chrome / WebKit often
// reports 0 height for a fullscreen grid whose children are all absolute, and
// Math.max(1, 0) then stretches a 1px bitmap into vertical neon smears.

export function viewSize(el) {
  const box = el?.getBoundingClientRect?.() || { width: 0, height: 0 }
  const vv = typeof visualViewport !== 'undefined' ? visualViewport : null
  const doc = document.documentElement
  const fallbackW = Math.max(window.innerWidth || 0, doc?.clientWidth || 0, vv?.width || 0)
  const fallbackH = Math.max(window.innerHeight || 0, doc?.clientHeight || 0, vv?.height || 0)
  const w = box.width >= 2 ? box.width : fallbackW
  const h = box.height >= 2 ? box.height : fallbackH
  return { w, h }
}

export function fitCanvas(canvas, ctx, el) {
  const { w, h } = viewSize(el)
  if (w < 2 || h < 2) return { w, h, dpr: 1, ok: false }
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const bw = Math.max(1, Math.round(w * dpr))
  const bh = Math.max(1, Math.round(h * dpr))
  if (canvas.width !== bw) canvas.width = bw
  if (canvas.height !== bh) canvas.height = bh
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { w, h, dpr, ok: true }
}

export function clearBacking(canvas, ctx, dpr) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.shadowColor = 'rgba(0,0,0,0)'
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#02050c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

export function observeFrame(el, fn) {
  const ro = new ResizeObserver(fn)
  try {
    ro.observe(el, { box: 'border-box' })
  } catch {
    ro.observe(el)
  }
  return ro
}

export function watchFrame(el, fn) {
  const ro = observeFrame(el, fn)
  const vv = typeof visualViewport !== 'undefined' ? visualViewport : null
  const onWin = () => fn()
  window.addEventListener('resize', onWin)
  window.addEventListener('orientationchange', onWin)
  vv?.addEventListener('resize', onWin)
  vv?.addEventListener('scroll', onWin)
  const timers = [0, 50, 250].map((ms) => setTimeout(fn, ms))
  let tries = 0
  let raf = 0
  const kick = () => {
    fn()
    tries += 1
    if (tries < 12) raf = requestAnimationFrame(kick)
  }
  raf = requestAnimationFrame(kick)
  return () => {
    cancelAnimationFrame(raf)
    for (const t of timers) clearTimeout(t)
    ro.disconnect()
    window.removeEventListener('resize', onWin)
    window.removeEventListener('orientationchange', onWin)
    vv?.removeEventListener('resize', onWin)
    vv?.removeEventListener('scroll', onWin)
  }
}
