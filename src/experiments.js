// Catalog. To add an idea:
// 1. one object here
// 2. src/specimens/<slug>.js  +  src/pages/<slug>.js  +  specimens/<slug>.html
// 3. npm run stills
// 4. synthesized Web Audio for each action (unlock on first gesture; iPhone haptic fallback)
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
  {
    slug: 'lite-brite',
    title: 'lite brite',
    blurb: 'Drag a streak of colour. It fades.',
    prompt:
      'Create an interactive canvas similar to an old school Lite Brite. The canvas will be filled with a grid of circles perfectly aligned horizontally and vertically. On every page load the circles will randomly change size and randomly change color, but always be uniform and equally spaced. The canvas will be dim by default, but as the user drags their finger or hovers over with their mouse the canvas circles will light up momentarily flashing their intended color then fade out. Additionally when the flash happens there will be a small haptic vibration to couple with the temporary flash. The intended interaction is that the user drags their finger or hovers over their mouse across the canvas and streaks of light follow the finger/mouse as it travels around the canvas coupled with tiny haptic vibrations for each time a circle is interacted with. Each light when lit should fade to dim within 1 second. Have a refresh button on the bottom right of the page that will refresh the page and load new sized and colored circles on the canvas.',
    date: '2026-11-19',
    hint: '',
    full: true,
    stillWait: 360,
    crop: { x: 0.5, y: 0.5, z: 1.02 },
  },
  {
    slug: 'runner',
    title: 'runner',
    blurb: 'Walk right. Tap to jump.',
    prompt:
      'Thinking of a simple side scroller game similar to Mario bros. The level design has two horizontal planes: a floor where our hero walks (this is the default on how our hero starts) and a second level where our here needs to jump to reach. There is no extra horizontal planes, just the two levels described. Our hero will walk by default to progress the horizontal scroll walking towards the right side of the screen. Our hero will always be positioned about 30% left of the screen in order to visibly see and react that comes on screen.  The only action the hero can do is walk, which they do by default without a way for the player to stop the walking, and two, the ability to jump which can be done by tapping anywhere on the screen. The intention for the hero to jump is to either avoid an enemy or two jump to the next vertical plane. The environment would consist of a floor, the first vertical plane and random blocks that look like clouds for the second vertical plane for our her to jump onto. Cloud blocks need to be spaced out and can only have two clouds beside each other max. The background and in the distance show moving stars at different horizons and depths to show that the hero is moving in physical space. The enemies: One enemy would walk towards our hero on the floor and one enemy would fly on the second vertical plane (cloud boxes). The only way for our hero to survive is to jump across the enemy or if our hero is on the second plane and an enemy is walking on the floor. Enemies will come one at a time on screen. 5% of the time you might see two enemies. Put a count down timer on the bottom right of the screen for 1 minute. When 1 minute is up a swarm of enemies come which gives only an 80% for our hero to survive. Obviously if the enemy touches our hero they die and the game restarts. When the game loads and restarts after each death, have a start button to activate the game.',
    date: '2026-11-20',
    hint: '',
    full: true,
    stillWait: 420,
    crop: { x: 0.36, y: 0.58, z: 1.08 },
  },
]

export const specimens = experiments.map((e, i) => ({
  ...e,
  idea: i + 1,
  n: String(i + 1).padStart(2, '0'),
}))
