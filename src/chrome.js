import { studio } from './studio.js'
import { specimens } from './experiments.js'

export function withBase(path) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${path.replace(/^\//, '')}`
}

export function fillStudio(root = document) {
  root.querySelectorAll('[data-handle]').forEach((el) => {
    el.textContent = studio.handle
  })
  root.querySelectorAll('[data-monogram]').forEach((el) => {
    el.textContent = studio.monogram
    el.setAttribute('data-print', studio.monogram)
  })
  root.querySelectorAll('[data-name]').forEach((el) => {
    el.textContent = studio.name
  })
  root.querySelectorAll('[data-about]').forEach((el) => {
    el.textContent = studio.about
  })
  root.querySelectorAll('[data-contact]').forEach((el) => {
    el.textContent = studio.contact
    const v = studio.contact.trim()
    if (v.startsWith('[') || !v) return
    if (v.includes('@') && !v.startsWith('http')) el.setAttribute('href', `mailto:${v}`)
    else el.setAttribute('href', v)
  })
  root.querySelectorAll('[data-location]').forEach((el) => {
    el.textContent = studio.location
  })
}

export function specimenMeta(slug) {
  return specimens.find((s) => s.slug === slug)
}

export { studio, specimens }
