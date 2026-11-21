import './styles.css'
import { fillStudio, withBase, specimenMeta, specimens } from './chrome.js'
import { unlock, soundOn, setSoundOn, tone } from './lib/audio.js'
import { watchBuild } from './lib/fresh.js'
import { resolveVersion, writeStoredVersion, setVersionInUrl } from './lib/version.js'

watchBuild()

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function soundLabel(on) {
  return on ? 'Sound On' : 'Sound Off'
}

function playSwitchMarkup(extraClass = '') {
  const cls = ['play-switch', extraClass].filter(Boolean).join(' ')
  return `<button
    class="${cls}"
    type="button"
    role="switch"
    aria-checked="true"
    aria-label="Original / Edit"
    data-play-switch
  >
    <span data-side="original">Original</span>
    <span class="prompt-switch-rule" aria-hidden="true">/</span>
    <span data-side="edit">Edit</span>
  </button>`
}

function ideaChrome(spec) {
  const id = `prompt-window-${spec.slug}`
  const on = soundOn()
  const edit = spec.edit && spec.edit.text
  const author = spec.author || 'Radley'
  return `
    <nav class="chrome">
      <a class="back" href="${withBase('')}">← Back</a>
      <span class="idea-hud">${escapeHtml(spec.title)}</span>
      <button class="prompt-open" type="button" aria-expanded="false" aria-controls="${id}">
        View Prompt
      </button>
    </nav>
    <button
      class="sound-toggle"
      type="button"
      aria-label="${soundLabel(on)}"
      aria-pressed="${on ? 'true' : 'false'}"
    >${soundLabel(on)}</button>
    ${edit ? playSwitchMarkup('version-toggle') : ''}
    <div class="prompt-window" id="${id}" role="dialog" aria-modal="false" aria-labelledby="${id}-title" hidden>
      <button class="prompt-close" type="button" aria-label="Close">×</button>
      <div class="prompt-scroll">
        <h2 class="prompt-title" id="${id}-title">${escapeHtml(spec.title)}</h2>
        <p class="prompt-blurb">${escapeHtml(spec.blurb)}</p>
        ${edit ? playSwitchMarkup('prompt-switch') : ''}
        <pre class="prompt-text" data-prompt></pre>
        <div class="prompt-meta">
          <p>Idea ${escapeHtml(spec.idea)}</p>
          <p>Author ${escapeHtml(author)}</p>
          <p>Date <time datetime="${escapeHtml(spec.date)}">${escapeHtml(spec.date)}</time></p>
          ${
            edit
              ? `<p>Edited <time datetime="${escapeHtml(spec.edit.date)}">${escapeHtml(spec.edit.date)}</time> by ${escapeHtml(spec.edit.author || 'Radley')}</p>`
              : ''
          }
        </div>
      </div>
    </div>
  `
}

function stageMarkup(hint) {
  return `
      <div class="stage-frame">
        <div data-stage></div>
        <button class="start" type="button">Start</button>
        ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}
      </div>`
}

function focusables(win) {
  return [...win.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'),
  )
}

function sfxSwitch() {
  unlock()
  tone({ type: 'sine', freq: 980, duration: 0.045, peak: 0.045 })
}

function normalizeMounts(mounts) {
  if (typeof mounts === 'function') return { edit: mounts, original: mounts }
  return {
    edit: mounts?.edit || mounts?.original,
    original: mounts?.original || mounts?.edit,
  }
}

function resetStartGate(root) {
  if (document.body.classList.contains('is-still') || document.body.classList.contains('is-peek')) return
  document.body.classList.remove('is-live')
  if (document.body.classList.contains('is-full')) document.body.classList.add('is-waiting')
  const btn = root.querySelector('.start')
  if (btn) {
    btn.hidden = false
    btn.textContent = 'Start'
  }
}

function bindPrompt(root) {
  const open = root.querySelector('.prompt-open')
  const win = root.querySelector('.prompt-window')
  const close = root.querySelector('.prompt-close')
  if (!open || !win || !close) return

  const setOpen = (on) => {
    win.hidden = !on
    open.setAttribute('aria-expanded', String(on))
    win.setAttribute('aria-modal', on ? 'true' : 'false')
    document.body.classList.toggle('is-prompt', on)
    if (on) close.focus()
    else open.focus()
  }

  open.addEventListener('click', () => setOpen(win.hidden))
  close.addEventListener('click', () => setOpen(false))
  document.addEventListener('keydown', (e) => {
    if (win.hidden) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key !== 'Tab') return
    const nodes = focusables(win)
    if (!nodes.length) {
      e.preventDefault()
      close.focus()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    } else if (!win.contains(document.activeElement)) {
      e.preventDefault()
      first.focus()
    }
  })
  document.addEventListener('focusin', (e) => {
    if (win.hidden) return
    if (win.contains(e.target)) return
    close.focus()
  })
}

function paintSound(btn) {
  const on = soundOn()
  const label = soundLabel(on)
  btn.textContent = label
  btn.setAttribute('aria-label', label)
  btn.setAttribute('aria-pressed', on ? 'true' : 'false')
}

function bindSound(root) {
  const btn = root.querySelector('.sound-toggle')
  if (!btn) return
  paintSound(btn)
  btn.addEventListener('click', () => {
    unlock()
    setSoundOn(!soundOn())
    paintSound(btn)
  })
}

function bindStart(root) {
  const btn = root.querySelector('.start')
  if (!btn) return
  btn.addEventListener('click', () => {
    unlock()
    document.body.classList.remove('is-waiting')
    document.body.classList.add('is-live')
    btn.hidden = true
    window.dispatchEvent(new Event('playground-start'))
  })
}

export function boot(slug, mounts) {
  const spec = specimenMeta(slug)
  const i = specimens.findIndex((s) => s.slug === slug)
  const params = new URLSearchParams(location.search)
  const still = params.has('still')
  const peek = params.has('peek')
  const app = document.getElementById('app')
  if (!spec || i < 0) {
    document.title = 'Radley’s AI Playground'
    app.innerHTML = `<div class="site"><a class="back" href="${withBase('')}">← Back</a></div>`
    return
  }
  document.title = `${spec.title} — Radley’s AI Playground`
  if (still) document.body.classList.add('is-still')
  if (peek) document.body.classList.add('is-peek')
  const full = spec.full && !still && !peek
  if (full) {
    document.body.classList.add('is-full')
    document.body.classList.add('is-waiting')
  }

  const pair = normalizeMounts(mounts)
  const hasEdit = !!(spec.edit && spec.edit.text)
  let version = hasEdit ? resolveVersion(slug, { peek, still }) : 'edit'
  let stop = null

  const play = (v) => {
    const fn = v === 'original' ? pair.original : pair.edit
    return fn(app.querySelector('[data-stage]'), { preview: peek, still, peek, version: v })
  }

  const paintPrompt = (root) => {
    const pre = root.querySelector('[data-prompt]')
    if (!pre) return
    const useEdit = version === 'edit' && spec.edit?.text
    pre.textContent = useEdit ? spec.edit.text : (spec.prompt ?? '')
  }

  const paintSwitches = (root) => {
    const editOn = version === 'edit'
    root.querySelectorAll('[data-play-switch]').forEach((sw) => {
      sw.setAttribute('aria-checked', String(editOn))
      sw.classList.toggle('is-edit', editOn)
    })
  }

  const applyVersion = (root, next, { silent = false } = {}) => {
    if (!hasEdit) return
    if (next !== 'original' && next !== 'edit') return
    const changed = next !== version
    version = next
    writeStoredVersion(slug, version)
    if (!peek && !still) setVersionInUrl(version)
    paintSwitches(root)
    paintPrompt(root)
    if (!changed) return
    if (!silent) sfxSwitch()
    if (stop) {
      stop()
      stop = null
    }
    resetStartGate(root)
    stop = play(version) || null
  }

  if (peek) {
    app.innerHTML = `<div class="stage-frame"><div data-stage></div></div>`
    play('edit')
    return
  }

  app.innerHTML = full
    ? `
    <div class="site">
      ${ideaChrome(spec)}
      ${stageMarkup()}
    </div>
  `
    : `
    <div class="site">
      ${ideaChrome(spec)}
      <header class="specimen-head">
        <h1>${escapeHtml(spec.title)}</h1>
      </header>
      ${stageMarkup(spec.hint)}
    </div>
  `
  fillStudio(app)
  bindPrompt(app)
  bindSound(app)
  if (!still) bindStart(app)
  paintSwitches(app)
  paintPrompt(app)
  if (hasEdit && !still) {
    app.querySelectorAll('[data-play-switch]').forEach((sw) => {
      sw.addEventListener('click', (e) => {
        const side = e.target.closest('[data-side]')?.getAttribute('data-side')
        const next = side === 'original' || side === 'edit' ? side : version === 'edit' ? 'original' : 'edit'
        applyVersion(app, next)
      })
    })
  }
  if (hasEdit && !peek && !still) setVersionInUrl(version)
  stop = play(version) || null
}

export { fillStudio, withBase, specimens }
