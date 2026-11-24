import './styles.css'
import { fillStudio, withBase, specimenMeta, specimens } from './chrome.js'
import { unlock, soundOn, setSoundOn, tone } from './lib/audio.js'
import { watchBuild } from './lib/fresh.js'
import { resolveVersion, writeStoredVersion, setVersionInUrl } from './lib/version.js'
import { mountCrt } from './lib/crt.js'

watchBuild()

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function playSwitchMarkup(extraClass = '', label = 'Original / Edit') {
  const cls = ['play-switch', extraClass].filter(Boolean).join(' ')
  return `<button
    class="${cls}"
    type="button"
    role="switch"
    aria-checked="true"
    aria-label="${escapeHtml(label)}"
    data-play-switch
  >
    <span data-side="original">Original</span>
    <span class="prompt-switch-rule" aria-hidden="true">/</span>
    <span data-side="edit">Edit</span>
  </button>`
}

function soundSwitchMarkup() {
  const on = soundOn()
  return `<button
    class="play-switch prompt-switch${on ? ' is-on' : ''}"
    type="button"
    role="switch"
    aria-checked="${on ? 'true' : 'false'}"
    aria-label="Sound"
    data-sound-switch
  >
    <span class="prompt-switch-k">Sound</span>
    <span data-side="on">On</span>
    <span class="prompt-switch-rule" aria-hidden="true">/</span>
    <span data-side="off">Off</span>
  </button>`
}

function ideaChrome(spec) {
  const id = `prompt-window-${spec.slug}`
  const edit = spec.edit && spec.edit.text
  const author = spec.author || 'Radley'
  return `
    <nav class="chrome">
      <a class="back" href="${withBase('')}">← Back</a>
      <span class="idea-hud"><span data-hud-title></span></span>
      <div class="chrome-end">
        <button class="prompt-open" type="button" aria-expanded="false" aria-controls="${id}">
          Prompt
        </button>
      </div>
    </nav>
    <div class="prompt-window" id="${id}" role="dialog" aria-modal="false" aria-labelledby="${id}-title" hidden>
      <button class="prompt-close" type="button" aria-label="Close">×</button>
      <div class="prompt-scroll">
        <h2 class="prompt-title" id="${id}-title">${escapeHtml(spec.title)}</h2>
        <p class="prompt-blurb">${escapeHtml(spec.blurb)}</p>
        <div class="prompt-toggles">
          ${edit ? playSwitchMarkup('prompt-switch') : ''}
          ${soundSwitchMarkup()}
        </div>
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

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function typeHudTitle(hud, text) {
  if (!hud) return
  const host = hud.querySelector('[data-hud-title]') || hud
  let caret = hud.querySelector('.type-caret')
  if (!caret) {
    caret = document.createElement('span')
    caret.className = 'type-caret'
    caret.setAttribute('aria-hidden', 'true')
    hud.appendChild(caret)
  }
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    host.textContent = text
    return
  }
  host.textContent = ''
  const chars = [...text]
  const budget = Math.min(720, 90 + chars.length * 42)
  ;(async () => {
    for (let i = 0; i < chars.length; i++) {
      host.textContent += chars[i]
      await wait(Math.max(18, budget / Math.max(1, chars.length)))
    }
  })()
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

function bindStart(root) {
  const btn = root.querySelector('.start')
  if (!btn) return
  btn.addEventListener('click', () => {
    try {
      unlock()
    } catch {
      /* WebKit audio unlock can fail; the gate still has to open */
    }
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

  const paintSound = (root) => {
    const on = soundOn()
    root.querySelectorAll('[data-sound-switch]').forEach((sw) => {
      sw.setAttribute('aria-checked', String(on))
      sw.classList.toggle('is-on', on)
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

  const applySound = (root, next) => {
    const on = next === 'on' ? true : next === 'off' ? false : !soundOn()
    if (on === soundOn()) return
    unlock()
    if (on) {
      setSoundOn(true)
      sfxSwitch()
    } else {
      sfxSwitch()
      setSoundOn(false)
    }
    paintSound(root)
  }

  if (peek) {
    app.innerHTML = `<div class="stage-frame"><div data-stage></div></div>`
    play('edit')
    return
  }
  if (!still) mountCrt()

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
  if (!still) bindStart(app)
  paintSwitches(app)
  paintPrompt(app)
  paintSound(app)
  if (!still) typeHudTitle(app.querySelector('.idea-hud'), spec.title)

  const promptOpen = app.querySelector('.prompt-open')
  const promptWin = app.querySelector('.prompt-window')
  const promptClose = app.querySelector('.prompt-close')

  const overlayOpen = () => Boolean(promptWin && !promptWin.hidden)

  const syncPause = () => {
    document.body.classList.toggle('is-prompt', overlayOpen())
  }

  const trap = (win, closeBtn) => {
    const nodes = focusables(win)
    if (!nodes.length) {
      closeBtn?.focus()
      return
    }
    return nodes
  }

  const setPrompt = (on) => {
    if (!promptWin || !promptOpen) return
    promptWin.hidden = !on
    promptOpen.setAttribute('aria-expanded', String(on))
    promptWin.setAttribute('aria-modal', on ? 'true' : 'false')
    syncPause()
    if (on) promptClose?.focus()
    else promptOpen.focus()
  }

  promptOpen?.addEventListener('click', () => setPrompt(promptWin.hidden))
  promptClose?.addEventListener('click', () => setPrompt(false))

  document.addEventListener('keydown', (e) => {
    const win = promptWin && !promptWin.hidden ? promptWin : null
    if (!win) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setPrompt(false)
      return
    }
    if (e.key !== 'Tab') return
    const nodes = trap(win, promptClose)
    if (!nodes) {
      e.preventDefault()
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
    const win = promptWin && !promptWin.hidden ? promptWin : null
    if (!win) return
    if (win.contains(e.target)) return
    promptClose?.focus()
  })

  if (!still) {
    app.querySelectorAll('[data-sound-switch]').forEach((sw) => {
      sw.addEventListener('click', (e) => {
        const side = e.target.closest('[data-side]')?.getAttribute('data-side')
        applySound(app, side === 'on' || side === 'off' ? side : undefined)
      })
    })
  }
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
