import { taptic } from '../lib/haptics.js'

const KEY = 'playground.thermal.v1'
const OPTIONS = [
  { id: 'newsprint', label: 'Newsprint' },
  { id: 'bristol', label: 'Bristol 2-ply' },
  { id: 'mylar', label: 'Mylar' },
  { id: 'tracing', label: 'Tracing' },
  { id: 'kraft', label: 'Kraft' },
  { id: 'vellum', label: 'Vellum' },
  { id: 'film', label: 'Film' },
]

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

function save(map) {
  localStorage.setItem(KEY, JSON.stringify(map))
}

export function mount(el, { preview = false, still = false } = {}) {
  let heat = still
    ? { bristol: 9, tracing: 6, newsprint: 3, mylar: 0, kraft: 0, vellum: 1, film: 0 }
    : load()
  let open = !!still
  let selected = still ? 'bristol' : OPTIONS[0].id

  el.innerHTML = `
    <div class="thermal">
      <button class="thermal-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="current"></span>
        <span aria-hidden="true">▾</span>
      </button>
      <ul class="thermal-list" role="listbox" hidden></ul>
    </div>
  `
  const root = el.querySelector('.thermal')
  const btn = root.querySelector('.thermal-btn')
  const list = root.querySelector('.thermal-list')
  const current = root.querySelector('.current')

  function ranked() {
    return [...OPTIONS].sort((a, b) => (heat[b.id] || 0) - (heat[a.id] || 0))
  }

  function climate(id) {
    const h = heat[id] || 0
    const max = Math.max(1, ...OPTIONS.map((o) => heat[o.id] || 0))
    const t = h / max
    if (h === 0) return 'cold'
    if (t > 0.55) return 'hot'
    return ''
  }

  function render() {
    const sel = OPTIONS.find((o) => o.id === selected)
    current.textContent = sel.label
    const items = preview ? ranked().slice(0, 5) : ranked()
    list.innerHTML = items
      .map((o) => {
        const h = heat[o.id] || 0
        const cls = climate(o.id)
        return `<li><button type="button" class="thermal-opt ${cls}" role="option" data-id="${o.id}" aria-selected="${o.id === selected}">
          <span>${o.label}</span>
          <span>${h ? `${h}×` : 'frost'}</span>
        </button></li>`
      })
      .join('')

    list.querySelectorAll('.thermal-opt').forEach((opt) => {
      let hold
      let warmed = false
      opt.addEventListener('click', (e) => {
        if (warmed) {
          e.preventDefault()
          return
        }
        pick(opt.dataset.id, true)
      })
      opt.addEventListener('pointerdown', () => {
        warmed = false
        hold = setTimeout(() => {
          warmed = true
          heat[opt.dataset.id] = (heat[opt.dataset.id] || 0) + 1
          save(heat)
          render()
          taptic(10)
          hold = null
        }, 420)
      })
      const clear = () => {
        if (hold) clearTimeout(hold)
      }
      opt.addEventListener('pointerup', clear)
      opt.addEventListener('pointerleave', clear)
      opt.addEventListener('pointercancel', clear)
    })
  }

  function pick(id, commit) {
    selected = id
    if (commit) {
      heat[id] = (heat[id] || 0) + 1
      save(heat)
      taptic(14)
    }
    open = false
    list.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    render()
  }

  btn.addEventListener('click', () => {
    open = !open
    list.hidden = !open
    btn.setAttribute('aria-expanded', String(open))
    taptic(8)
  })

  render()
  if (still) {
    list.hidden = false
    btn.setAttribute('aria-expanded', 'true')
  }
  return () => {}
}
