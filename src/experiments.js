// Catalog. To add an idea:
// 1. one object here
// 2. src/specimens/<slug>.js  +  src/pages/<slug>.js  +  specimens/<slug>.html
// 3. npm run stills
//
// {
//   slug: 'example',
//   title: 'Example',
//   blurb: '',
//   prompt: '', // exact wording — casing, line breaks, typos kept
//   date: '2026-11-19', // ISO, YYYY-MM-DD
//   hint: '',
//   crop: { x: 0.5, y: 0.5, z: 1 },
// }

export const experiments = []

export const specimens = experiments.map((e, i) => ({
  ...e,
  n: String(i + 1).padStart(2, '0'),
}))
