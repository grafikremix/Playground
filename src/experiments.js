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

export const experiments = [
  {
    slug: 'bubbles',
    title: 'bubbles',
    blurb: 'Tap to pop, drag to move. They bark.',
    prompt:
      'Idea. Create a bubble pop game where random bubbles float randomly around the screen. Ensure that bubble physics are applied so that bubbles always bounce off one another but never pop. Floating bubbles should have a calmness to them, almost zen like. The bubble sizes, color and movement speed are at random as well. Bubbles travel into view, on screen and out of view, off screen. When a bubble is popped a random animal sound is played instead of your normal pop sound. Examples: dog bark, cat meow, cow moo, horse neigh, lion roar etc. The only way to pop a bubble is by tapping on it. Additionally I can move a bubble by dragging it around which would not make it pop. Make only 2% of the bubbles do the following when popped: pops all bubbles on screen causing all animal sounds to go off at once. Make another 2% of the bubbles make all the on screen bubbles change to the same color. Finally make only 1% off bubbles make a small animal fall out when popped.',
    date: '2026-11-18',
    hint: '',
    full: true,
    stillWait: 480,
    crop: { x: 0.5, y: 0.48, z: 1.05 },
  },
  {
    slug: 'cube',
    title: 'cube',
    blurb: 'Flick to spin. Tap the one coloured square.',
    prompt:
      'Idea. An interactive cube game that sits in the middle of the screen. The cube looks like a rubix cube with a 3x3 grid on each side but there are no colors except on only 1 square on the entire cube. You can rotate the cube 360 by dragging in the direction you want to rotate the cube. Post drag, the cube will spin based on the direction the drag was released. You can even drag faster to increase the velocity at which the cube spins. The cube will always slow down and halts in about 5 seconds. You can also stop the spin by grabbing the cube. When the user finds the one square with color and taps on it all other mini cubes that make up the rubix cube disintegrate as if they vanished into thin air leaving just a dust of cube evaporation. The one cube remains then is zoomed in on as to restart the game, but with a new cube and a new location for the colored square for the user to seek. Add a visual aesthetic of a subdued floor grid. Something that looks like straight out of a Tron movie. Oh also make the cube glow. As it spins faster the glow gets brighter.',
    date: '2026-11-18',
    hint: '',
    full: true,
    stillWait: 720,
    crop: { x: 0.52, y: 0.44, z: 1.02 },
  },
]

export const specimens = experiments.map((e, i) => ({
  ...e,
  idea: i + 1,
  n: String(i + 1).padStart(2, '0'),
}))
