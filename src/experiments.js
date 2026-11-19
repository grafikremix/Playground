// Catalog. To add an idea:
// 1. one object here
// 2. src/specimens/<slug>.js  +  src/pages/<slug>.js  +  specimens/<slug>.html
// 3. npm run stills
//
// {
//   slug: 'example',
//   title: 'Example',
//   rule: '',
//   blurb: '',
//   line: '',
//   hint: '',
//   date: '',
//   crop: { x: 0.5, y: 0.5, z: 1 },
//   note: '',
// }

export const experiments = []

export const specimens = experiments.map((e, i) => ({
  ...e,
  n: String(i + 1).padStart(2, '0'),
}))
