// Catalog. To add an idea:
// 1. one object here
// 2. src/specimens/<slug>.js  +  src/pages/<slug>.js  +  specimens/<slug>.html
//    (an edit also needs src/specimens/<slug>.original.js)
// 3. npm run stills
// 4. synthesized Web Audio for each action (unlock on touchstart/touchmove/touchend/pointerup/click until ctx is running; iPhone haptic fallback; honor the prompt-window Sound On/Off toggle)
// 5. every idea is always dark Tron / Ice (techno, electric 80s: neon glow lines, near-black bg, grid/vector feel, synthy sound) plus a shared CRT tube texture (scanlines/phosphor, ice-blue palette unchanged) regardless of the style the prompt asks for
// 6. wait for the shared template Start (isLive() in src/lib/play.js). Peek and stills skip it. Runner may show Start again after death. Homepage tiles (peek iframes and captured stills) must never draw in-game score / hits / best / counters — use showScoreHud() from src/lib/play.js; tile title and tagline stay readable on top of the preview.
// 7. `author` (defaults to Radley). Optional `edit: { text, date, author }` — at most one. An edited idea keeps both playable versions behind Original / Edit in the prompt window. Default is Edit. `src/specimens/<slug>.original.js` holds the original mount; the current specimen is the edit. Prompt text stays verbatim.
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
    edit: {
      text: 'Change the progression to get harder from 20 seconds to 45 seconds. Move the jet slightly higher up from the bottom of the screen and the only way to die is if an asteroid hits the jet, not when an asteroid leaves the frame. Change the control to a joystick on the left to control movement of the jet to go left, right up or down, and make a button on the right for shooting. Keep a high score tally on the top left so remember previous attempts to be able to beat previous high score. Make current tally bold. ANIMATE current tally make it bold and add a confetti when 1, you pass previous higher score. Make a different animation when the score moves up by 10 - bold it, make it slightly bigger for 2 seconds and change the color to highlight.',
      date: '2026-11-21',
      author: 'Trish',
    },
    hint: '',
    full: true,
    stillWait: 520,
    crop: { x: 0.5, y: 0.5, z: 1.04 },
  },
  {
    slug: 'chick-cross',
    title: 'chick cross',
    blurb: 'Tap to hop. Don’t get left behind.',
    prompt:
      'The main character is a chick and you have to cross roads but there are obstacles like trains and if you hit the train then you die. You also need to tap the chick to move and the screen is automatically scrolling up not to fast but not to slow either and if you get left behind you die as well. The scene can change when you move up and up. It can be a forest, desert, lake. And on the lake you need jump on Lilly pads to make it across the river. There are also arrow buttons to go either left or right. And make a best score and the score you currently have at the top of the screen in white',
    author: 'Vanessa',
    date: '2026-11-21',
    hint: '',
    full: true,
    stillWait: 560,
    crop: { x: 0.5, y: 0.52, z: 1.06 },
  },
  {
    slug: 'tree',
    title: 'tree',
    blurb: 'Pull a limb. Leaves don’t grow back.',
    prompt:
      'A tree that is planted firmly into the ground and is tall and leafy. Lots of branches and lots of leaves. On each load the type of tree changes. Could be a leafy green tree in summer, a golden autumn tree or a tall pine tree. Every tree should be vertically tall to allow for the interaction I will describe. The user can bend the tree by pulling a branch or the middle of the tree. Depending where the pull happens physics of a tree, it’s body and branches need to be taken to account. For example if you try to pull on the bottom by the trunk, the user will have a difficult time. If you pull on a limb then the user will have more success pulling the tree left right or up. If you pull on a branch or twig you might end up braking the branch or twig because of it delicate nature. When pulling and releasing ensure there’s an elastic nature to the branches and twigs but not so unrealistic that it feels like a rubber band. There should be some resistance. As the user pulls on parts of the tree the leaves or needles will start to fall. Depending on how far the pull and the velocity of the swing will determine how many leaves shake off the tree and fall to the ground. The harder the swing the more leaves or needles fall. Keep in consideration the season as well. A tree in spring or summer will have leaves that make it harder to fall where the opposite is true of a tree in autumn or winter. Pine trees could be a bit more playful where needles shoot out everywhere. Leaves, branches and twigs that leave the tree should never grow back thus the player having the potential to make the tree completely bare. Have a reset button which would load up a new tree. Wait add snow if it’s winter, wind if autumn, rain for spring, and summer add the sun shining. Add this to the prompt',
    author: 'Radley',
    date: '2026-11-21',
    edit: {
      text: 'Edit to the tree idea. The tree interaction is still really messed up. A few things we need to fix:\n\n1. Looks like the tree is completely frozen. Let’s change the physics completely and make it extremely elastic and you can bend the tree all the way to the the ground. Doesn’t matter the season. \n\n2. The season animations are missing. For summer add a slight breeze and you can visibly see wind brush through the canopy though no leaves fall. For autumn and a bit more stronger winds. Some of the leaves start falling off because of the wind. Snow is frozen on screen. This is a bug. Have the snow falling and accumulating on the ground. The snow will also fly off the tree when interacting with the tree. For spring, similar to winter but with rain instead of snow. The spring tree is also frozen, this is a bug. \n\n3. The screen itself seems like it’s frozen. I cannot interact with the tree or the new tree CTA. Looks to be a bug. \n\n4. The new tree CTA just rotate the trees from spring, then summer, then autumn then winter. For some reason the tree is no longer random and gets stuck on the autumn tree. \n\n5. For branches and twigs you can slice them off doing a fast drag/slice motion. Has to be fast not slow. Show a slice trail similar to Fruit Ninja',
      date: '2026-11-22',
      author: 'Radley',
    },
    hint: '',
    full: true,
    stillWait: 640,
    crop: { x: 0.5, y: 0.54, z: 1.02 },
  },
  {
    slug: 'sound-browser',
    title: 'sound browser',
    blurb: 'Browse loops. Pan the tree.',
    prompt:
      'You mentioned 8 GitHub repos which is sparking an idea. Let’s use zzfmx, tone.js, open lo-fi, plinkfx and see what we can pull from them. I’d likeu to list each repo and when a user selects a repo, you list either a hierarchy of folders until you get to the audio that can be played. When the audio is played have a line wave animation to signal that the audio is playing. Also have a play/pause toggle on the bottom of the screen for the audio. Audio should loop as well. I’m picturing an info hierarchy navigation type of interaction. Start off with a parent list and as a selection is made its children appear on the right side. If more hierarchy is needed, more levels appear to the right. If the amount of hierarchy levels succeed the browser width or height, the browser will pan over to the deepest level in the hierarchy. Here’s the interaction surprise. The user can move the navigation around to view the different parts of the hierarchy to view it. The user can even pinch or expand to zoom in and out with a min and max so the user can’t zoom into the smallest pixel or zoom out infinitely. For folders show a folder icon and for audio show an audio file icon. If the user goes back in the navigation stack and selects something else colapse the stack to where the selection is made. Always credit the author of the music/sounds and link to the appropriate GitHub page. If we can’t use the GitHub repositories to how I’m describing or if I’m misunderstanding how they should be used, let’s disambiguate to better craft this prompt to what we can do with the repos and how they should be used.',
    author: 'Radley',
    date: '2026-11-24',
    hint: '',
    full: true,
    stillWait: 720,
    crop: { x: 0.5, y: 0.46, z: 1 },
  },
  {
    slug: 'waterfall',
    title: 'waterfall',
    blurb: 'Draw a path. Water follows.',
    prompt:
      'I have this idea of water flowing vertically. Almost like a waterfall. The user can manipulate the water falling by drawing lines on the canvas. Could be straight lines, curved lines, any type of drawings pretty much which would make the flowing water react with real water physics. Physics examples: If the user were to make a hard straight line perpendicular to where the water falls then the water would splash off the line creating two more areas for the water to flow on either end. Oppositely, the user might draw gentle slides for the water to travel down creating minimal splash. If the user were to draw a bowl like line, then the water would collect until it couldn’t hold the water any more. Interaction details: the water would flow from the top middle of the screen. Create a UI gauge that would determine the pressure of the water. Three settings, Slow, medium, fast. The canvas can scroll vertically. Because the user can draw lines the vertical scroll must be controlled by two finger touch or arrow keys on a keyboard. Vertical scroll has a limit and at the bottom of the scroll is a pool of water with small sail boats that react to the water being poured on them. Use the plinkfx sound library for water sound fx. Credit them in the prompt window.',
    author: 'Radley',
    date: '2026-11-24',
    hint: '',
    full: true,
    stillWait: 900,
    crop: { x: 0.52, y: 0.22, z: 1.38 },
    credits: [
      {
        label: 'Sound',
        name: 'plinkfx',
        author: 'Maximilian Feix',
        href: 'https://github.com/maximilianfeix/plinkfx',
      },
      {
        label: 'Fluid',
        name: 'SPHjs',
        author: 'asadm',
        href: 'https://github.com/asadm/SPHjs',
      },
    ],
  },
]

export const specimens = experiments.map((e, i) => ({
  ...e,
  author: e.author || 'Radley',
  idea: i + 1,
  n: String(i + 1).padStart(2, '0'),
}))
