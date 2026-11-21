// Catalog. To add an idea:
// 1. one object here
// 2. src/specimens/<slug>.js  +  src/pages/<slug>.js  +  specimens/<slug>.html
// 3. npm run stills
// 4. synthesized Web Audio for each action (unlock on touchstart/touchmove/touchend/pointerup/click until ctx is running; iPhone haptic fallback; honor the HUD sound toggle)
// 5. every idea is always dark Tron / Ice (techno, electric 80s: neon glow lines, near-black bg, grid/vector feel, synthy sound) regardless of the style the prompt asks for
// 6. wait for the shared template Start (isLive() in src/lib/play.js). Peek and stills skip it. Runner may show Start again after death.
// 7. `author` (defaults to Radley). Optional `edit: { text, date, author }` — at most one. Prompt window toggles Original / Edit. Prompt text stays verbatim.
//
// {
//   slug: 'example',
//   title: 'Example',
//   blurb: '',
//   prompt: '', // exact wording — casing, line breaks, typos kept
//   author: 'Radley',
//   date: '2026-11-19', // ISO, YYYY-MM-DD
//   edit: { text: '', date: '2026-11-21', author: 'Radley' }, // at most one
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
    author: 'Radley',
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
    author: 'Radley',
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
    author: 'Radley',
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
    author: 'Radley',
    date: '2026-11-20',
    hint: '',
    full: true,
    stillWait: 420,
    crop: { x: 0.36, y: 0.58, z: 1.08 },
  },
  {
    slug: 'aurora',
    title: 'aurora',
    blurb: 'Pull the curtains. Hold far enough and they burst.',
    prompt:
      'Aurora borealis but with a twist. Starry night with the borealis lights shining. The borealis lights shine different colors like a rainbow that randomly change and sway gracefully like a curtain catching a gentle wind. The interaction: The user can pull any part of the borealis which can stretch and bend. Elasticity and bouncy is how I would describe the interaction. Elastic on the pull and bouncy on the release. The twist is that if the user pulls far and long enough the borealis will explode like fireworks only to disappear like a thin fog into the night. Once that happens new borealis lights will slowly creep into view. In order for the fire works to happen the user must pull the furthest the finger/mouse can travel on screen and at minimum for 5 seconds. As the pulls the borealis will visibly vibrate. Start off as small vibrations but as the pull is longer in distance and time the vibrations get more intense until the borealis can’t take the tension anymore and finally explodes into a beautiful display of fireworks.',
    author: 'Radley',
    date: '2026-11-20',
    hint: '',
    full: true,
    stillWait: 520,
    crop: { x: 0.5, y: 0.36, z: 1.06 },
  },
  {
    slug: 'space-board',
    title: 'space board',
    blurb: 'Tap to climb. Swipe to steer.',
    prompt:
      'My daughter’s idea. The game is an alien on a space board that is floating and you need to keep pursuing the screen for the alien to keep going up. While it’s going up there are obstacles like a block you need to go around. Like wooden blocks. You can also swipe side to side to make the alien go in any direction. Also if you don’t tap the alien it falls and you die and start over. When you tap the alien you it makes a sound almost like a paint ball noise. There is also a score board to see how far you make it up. Record it’s the highest score as well on the side of the highest score. It should be white letters with a boarder for each one. Okay now the alien is a light green and the ship is grey but make it have dimension. The background is white but not clear white kind of faded. Don’t let me down',
    author: 'Vanessa',
    date: '2026-11-20',
    edit: {
      text: 'Update theme to match the theme of the website. Also change the gesture interactions for how the ship moves. Tap anywhere on the screen top make the ship move vertically. Swipe left and right to move the ship horizontaly. For the blocks, right now there are no blocks in the middle of the canvas meaning I can start the game, not move the alien and endlessly move straight up forever. Ensure the blocks are scattered that forces the player to move the alien. Lastly start by having only one block on screen. As the player progresses in the game, incrementally add move blocks in view making the game more difficult as the player moves on. Add an additional block for every 300 points scored. As the difficulty raises, ensure there is anyways a path for the player to move vertically thus never creating a ceiling of blocks for the player to not progress. Randomly add star power ups. When the alien obtains the star the alien can temporarily go through the blocks. This power up only lasts 3 seconds. Change the look of the alien to show they have the power!',
      date: '2026-11-21',
      author: 'Radley',
    },
    hint: '',
    full: true,
    stillWait: 520,
    crop: { x: 0.5, y: 0.46, z: 1.04 },
  },
  {
    slug: 'asteroids',
    title: 'asteroids',
    blurb: 'Slide to steer. Blast the rocks.',
    prompt:
      'Setting: outer space, futuristic. A jet is shooting at targets coming down from the sky. The jet has turbo sounds and is mainly at the bottom of the screen and can move left to right. The targets are asteroids that fall from the sky. Make it interesting different sizes. Each time the jet successfully shoots a target it makes an explosion sound. When the jet is activated to shoot make a laser come out of the jet in line with the direction it is shooting.  Targets (asteroids) fall slowly, and less at first and as the user successfully hits a target and/or after 20 seconds target moves a little faster. Essentially make the game faster as you progress. Keep a score tally of how many targets are successfully hit at the top right corner. Soundtrack is futuristic and engaging like a battle but make it dramatic.',
    author: 'Trish',
    date: '2026-11-21',
    hint: '',
    full: true,
    stillWait: 520,
    crop: { x: 0.5, y: 0.5, z: 1.04 },
  },
]

export const specimens = experiments.map((e, i) => ({
  ...e,
  author: e.author || 'Radley',
  idea: i + 1,
  n: String(i + 1).padStart(2, '0'),
}))
