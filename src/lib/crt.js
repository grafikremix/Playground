export function mountCrt() {
  if (typeof document === 'undefined') return
  const { body } = document
  if (!body) return
  if (body.classList.contains('is-peek') || body.classList.contains('is-still')) return
  if (body.querySelector(':scope > .crt')) return
  const el = document.createElement('div')
  el.className = 'crt'
  el.setAttribute('aria-hidden', 'true')
  el.style.pointerEvents = 'none'
  el.innerHTML = '<span class="crt-screen"></span><span class="crt-roll"></span>'
  body.appendChild(el)
}
