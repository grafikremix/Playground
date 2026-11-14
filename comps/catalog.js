export const experiments = [
  {
    slug: 'viscous',
    n: '01',
    title: 'Viscous toggle',
    blurb: 'A switch that has to slosh.',
    featured: true,
  },
  {
    slug: 'gravity',
    n: '02',
    title: 'Gravity checkboxes',
    blurb: 'Done work gets heavy.',
  },
  {
    slug: 'breathing',
    n: '03',
    title: 'Breathing buttons',
    blurb: 'Clicks wait for the exhale.',
  },
  {
    slug: 'magnetic',
    n: '04',
    title: 'Magnetic text field',
    blurb: 'The caret is a magnet.',
  },
  {
    slug: 'elastic',
    n: '05',
    title: 'Elastic slider',
    blurb: 'The ends fight back.',
  },
  {
    slug: 'thermal',
    n: '06',
    title: 'Thermal dropdown',
    blurb: 'Habits rise. Neglect frosts.',
  },
  {
    slug: 'shattering',
    n: '07',
    title: 'Shattering modal',
    blurb: 'Cancel leaves glass.',
  },
  {
    slug: 'pressure',
    n: '08',
    title: 'Pressure radios',
    blurb: 'Hold to mean it.',
  },
]

export const lede =
  'I keep a folder of bad interface ideas. Most of them stay there. These eight made it out because the friction was more interesting than the rule they broke.'

export function still(slug, ext = 'jpg') {
  return `../public/experiments/${slug}/still.${ext}`
}

export function picture(slug, cls, title, blurb) {
  return `
    <picture class="still-layer ${cls}">
      <source type="image/avif" srcset="${still(slug, 'avif')}" />
      <source type="image/webp" srcset="${still(slug, 'webp')}" />
      <img src="${still(slug)}" alt="${title}. ${blurb}" draggable="false" width="1200" height="1200" />
    </picture>`
}
