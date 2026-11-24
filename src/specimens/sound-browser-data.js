import { withBase } from '../chrome.js'
import {
  clickSoft,
  hover,
  plink,
  notify,
  selectSoft,
  ice,
  forceField,
  scan,
  waterDrop,
  whoosh,
  wind,
  swipe,
  dash,
  glassBreak,
  bubble,
  click,
  tap,
  toggleOn,
  confirm,
  cancel,
  type,
  tick,
  success,
  pageTurn,
  menuOpen,
  gem,
  sparkle,
  swing,
  rainLoop,
  windLoop,
  rainDrop,
  oceanWave,
  leafRustle,
  beep,
  radarPing,
  computerBeep,
  accessGranted,
  teleport,
  harp,
  enchant,
  portal,
  shutdown,
  glitch,
  lockOpen,
  doorSlide,
  message,
  drop,
} from 'plinkfx/sounds'

const OL = 'https://github.com/btahir/open-lofi'
const PX = 'https://github.com/maximilianfeix/plinkfx'
const ZZ = 'https://github.com/keithclark/ZzFXM'
const TN = 'https://github.com/Tonejs/Tone.js'

const OL_CREDIT = 'Btahir'
const PX_CREDIT = 'Maximilian Feix'
const ZZ_CREDIT = 'Radley’s AI Playground'
const TN_CREDIT = 'Yotam Mann'

// Original ZzFXM songs. Instruments use 0 randomness so loops stay stable.
// Notes: 13=C2 17=E2 20=G2 24=B2 25=C3. Songs by Radley’s AI Playground.
const ICE_SHEET = [
  [[0.45, 0, 196, 0.18, 0.45, 0.9, 0, 1, , , , , , , , , 0.12]],
  [[[0, 0, 13, 0, 0, 0, 20, 0, 0, 0, 17, 0, 0, 0, 13, 0]]],
  [0, 0],
  72,
]

const GLASS_HALO = [
  [
    [0.28, 0, 523, 0.02, 0.12, 0.55, 0, 2, , , , , , , , , 0.18],
    [0.22, 0, 262, 0.2, 0.5, 1.1, 0, 1, , , , , , , , , 0.2],
  ],
  [
    [
      [0, -0.4, 25, 0, 20, 0, 25, 0, 28, 0, 25, 0, 20, 0, 17, 0],
      [1, 0.4, 13, 0, 0, 0, 13, 0, 17, 0, 0, 0, 13, 0, 0, 0],
    ],
  ],
  [0, 0],
  80,
]

const CRT_PULSE = [
  [[0.35, 0, 110, 0.01, 0.04, 0.12, 1, 2, , , , , , , , 0, 0.05, 0.4]],
  [[[0, 0, 13, 0, 0, 0, 13, 0, 13, 0, 0, 0, 20, 0, 0, 0]]],
  [0, 0, 0],
  88,
]

const SOFT_CLOCK = [
  [
    [0.3, 0, 330, 0.005, 0.02, 0.08, 0, 1],
    [0.18, 0, 110, 0.01, 0.05, 0.2, 3, 1],
  ],
  [
    [
      [0, 0, 25, 0, 0, 0, 25, 0, 25, 0, 0, 0, 25, 0, 20, 0],
      [1, 0, 13, 0, 0, 0, 0, 0, 13, 0, 0, 0, 13, 0, 0, 0],
    ],
  ],
  [0, 0],
  76,
]

const FROST_VEIN = [
  [[0.38, 0, 174, 0.22, 0.5, 1.1, 0, 1, , , , , , , , , 0.16]],
  [[[0, 0, 17, 0, 0, 0, 24, 0, 0, 0, 20, 0, 0, 0, 17, 0]]],
  [0, 0],
  64,
]

const PALE_ORBIT = [
  [
    [0.32, 0, 220, 0.3, 0.55, 1.2, 0, 1, , , , , , , , , 0.14],
    [0.18, 0, 110, 0.4, 0.6, 1.4, 0, 1, , , , , , , , , 0.2],
  ],
  [
    [
      [0, -0.2, 20, 0, 17, 0, 20, 0, 24, 0, 20, 0, 17, 0, 13, 0],
      [1, 0.2, 13, 0, 0, 0, 13, 0, 13, 0, 0, 0, 17, 0, 0, 0],
    ],
  ],
  [0, 0],
  70,
]

const QUIET_RELAY = [
  [[0.3, 0, 98, 0.01, 0.03, 0.1, 1, 2, , , , , , , , 0, 0.04, 0.35]],
  [[[0, 0, 13, 0, 13, 0, 0, 0, 20, 0, 13, 0, 0, 0, 17, 0]]],
  [0, 0],
  92,
]

const FILAMENT = [
  [[0.28, 0, 147, 0.008, 0.05, 0.14, 0, 2, , , , , , , , , 0.06]],
  [[[0, 0, 20, 0, 0, 0, 25, 0, 20, 0, 0, 0, 17, 0, 20, 0]]],
  [0, 0],
  84,
]

const ION_SNOW = [
  [[0.22, 0, 784, 0.005, 0.08, 0.4, 0, 2, , , , , , , , , 0.22]],
  [[[0, 0, 32, 0, 0, 0, 37, 0, 32, 0, 0, 0, 28, 0, 32, 0]]],
  [0, 0],
  68,
]

const GLASS_STEP = [
  [
    [0.2, 0, 659, 0.002, 0.06, 0.28, 0, 2, , , , , , , , , 0.16],
    [0.14, 0, 330, 0.01, 0.12, 0.4, 0, 1, , , , , , , , , 0.12],
  ],
  [
    [
      [0, -0.3, 32, 0, 28, 0, 37, 0, 32, 0, 28, 0, 25, 0, 32, 0],
      [1, 0.3, 20, 0, 0, 0, 20, 0, 17, 0, 0, 0, 20, 0, 0, 0],
    ],
  ],
  [0, 0],
  76,
]

const AFTERIMAGE = [
  [[0.4, 0, 82, 0.5, 0.8, 1.6, 0, 1, , , , , , , , , 0.1]],
  [[[0, 0, 13, 0, 0, 0, 13, 0, 17, 0, 0, 0, 13, 0, 0, 0]]],
  [0, 0],
  56,
]

const LOW_MERCURY = [
  [
    [0.36, 0, 65, 0.4, 0.7, 1.8, 0, 1, , , , , , , , , 0.08],
    [0.16, 0, 196, 0.2, 0.5, 1.1, 0, 1, , , , , , , , , 0.14],
  ],
  [
    [
      [0, 0, 13, 0, 0, 0, 13, 0, 13, 0, 0, 0, 17, 0, 0, 0],
      [1, 0, 20, 0, 0, 0, 17, 0, 20, 0, 0, 0, 24, 0, 0, 0],
    ],
  ],
  [0, 0],
  60,
]

function file(cat, fileName, title) {
  return {
    id: `ol-${fileName.replace(/\.mp3$/, '')}`,
    kind: 'audio',
    engine: 'file',
    title,
    src: withBase(`experiments/sound-browser/open-lofi/${cat}/${fileName}`),
    credit: OL_CREDIT,
    href: OL,
  }
}

function folder(id, title, credit, href, children) {
  return { id, kind: 'folder', title, credit, href, children }
}

function px(id, title, sound) {
  return {
    id: `px-snd-${id}`,
    kind: 'audio',
    engine: 'plink',
    title,
    sound,
    credit: PX_CREDIT,
    href: PX,
  }
}

function zz(id, title, song) {
  return {
    id: `zz-${id}`,
    kind: 'audio',
    engine: 'zzfxm',
    title,
    song,
    credit: ZZ_CREDIT,
    href: ZZ,
    playerCredit: 'Keith Clark',
  }
}

function tn(id, title) {
  return {
    id: `tn-${id}`,
    kind: 'audio',
    engine: 'tone',
    patch: id,
    title,
    credit: 'Tone.js by Yotam Mann',
    href: TN,
  }
}

export const TREE = [
  folder('open-lofi', 'Open lo-fi', OL_CREDIT, OL, [
    folder('ol-drift', 'Drift', OL_CREDIT, OL, [
      folder('ambient-lofi', 'Ambient drift', OL_CREDIT, OL, [
        file('ambient-lofi', 'aurora-on-mute.mp3', 'Aurora on mute'),
        file('ambient-lofi', 'deep-space-loop.mp3', 'Deep space loop'),
        file('ambient-lofi', 'orbiting-in-silence.mp3', 'Orbiting in silence'),
        file('ambient-lofi', 'satellite-lullaby.mp3', 'Satellite lullaby'),
        file('ambient-lofi', 'almost-floating.mp3', 'Almost floating'),
        file('ambient-lofi', 'cathedral-hiss.mp3', 'Cathedral hiss'),
        file('ambient-lofi', 'sea-glass-evening.mp3', 'Sea glass evening'),
      ]),
    ]),
    folder('ol-night', 'After hours', OL_CREDIT, OL, [
      folder('late-night', 'Late night', OL_CREDIT, OL, [
        file('late-night', '3-am-echoes.mp3', '3 AM echoes'),
        file('late-night', 'electric-puddles.mp3', 'Electric puddles'),
        file('late-night', 'rain-off-the-neon-signs.mp3', 'Rain off the neon signs'),
        file('late-night', 'antenna-after-midnight.mp3', 'Antenna after midnight'),
        file('late-night', 'empty-street-static.mp3', 'Empty street static'),
        file('late-night', 'last-train-home.mp3', 'Last train home'),
      ]),
      folder('jazzhop', 'Jazz lounge', OL_CREDIT, OL, [
        file('jazzhop', 'candlelit-at-70-bpm.mp3', 'Candlelit at 70 BPM'),
        file('jazzhop', 'rain-on-the-boulevard.mp3', 'Rain on the boulevard'),
        file('jazzhop', 'stacks-of-quiet-books.mp3', 'Stacks of quiet books'),
        file('jazzhop', 'ashes-in-the-coffee-cup.mp3', 'Ashes in the coffee cup'),
        file('jazzhop', 'midnight-amber-room.mp3', 'Midnight amber room'),
      ]),
    ]),
    folder('ol-day', 'Daylight', OL_CREDIT, OL, [
      folder('chillhop', 'Chillhop', OL_CREDIT, OL, [
        file('chillhop', 'dusk-between-stoops.mp3', 'Dusk between stoops'),
        file('chillhop', 'glow-on-the-overpass.mp3', 'Glow on the overpass'),
        file('chillhop', 'window-seat-daydream.mp3', 'Window seat daydream'),
      ]),
      folder('asian-lofi', 'Zen rooms', OL_CREDIT, OL, [
        file('asian-lofi', 'lanterns-in-slow-motion.mp3', 'Lanterns in slow motion'),
        file('asian-lofi', 'moon-through-bamboo.mp3', 'Moon through bamboo'),
        file('asian-lofi', 'temple-at-dawn.mp3', 'Temple at dawn'),
      ]),
      folder('seasonal-weather', 'Weather', OL_CREDIT, OL, [
        file('seasonal-weather', 'snow-on-the-needle.mp3', 'Snow on the needle'),
        file('seasonal-weather', 'winter-turntable.mp3', 'Winter turntable'),
        file('seasonal-weather', 'sidewalk-puddles.mp3', 'Sidewalk puddles'),
        file('seasonal-weather', 'fallen-leaves-loop.mp3', 'Fallen leaves loop'),
      ]),
    ]),
  ]),
  folder('plinkfx', 'plinkfx', PX_CREDIT, PX, [
    folder('px-ui', 'UI', PX_CREDIT, PX, [
      folder('px-ui-clicks', 'Clicks', PX_CREDIT, PX, [
        px('click-soft', 'Click soft', clickSoft),
        px('click', 'Click', click),
        px('tap', 'Tap', tap),
        px('hover', 'Hover', hover),
        px('tick', 'Tick', tick),
      ]),
      folder('px-ui-notices', 'Notices', PX_CREDIT, PX, [
        px('notify', 'Notify', notify),
        px('plink', 'Plink', plink),
        px('confirm', 'Confirm', confirm),
        px('success', 'Success', success),
        px('cancel', 'Cancel', cancel),
      ]),
      folder('px-ui-motion', 'Motion', PX_CREDIT, PX, [
        px('select-soft', 'Select soft', selectSoft),
        px('menu-open', 'Menu open', menuOpen),
        px('page-turn', 'Page turn', pageTurn),
        px('type', 'Type', type),
        px('toggle-on', 'Toggle on', toggleOn),
      ]),
    ]),
    folder('px-ice', 'Ice', PX_CREDIT, PX, [
      folder('px-ice-crystal', 'Crystal', PX_CREDIT, PX, [
        px('ice', 'Ice', ice),
        px('gem', 'Gem', gem),
        px('sparkle', 'Sparkle', sparkle),
        px('glass-break', 'Glass break', glassBreak),
      ]),
      folder('px-ice-field', 'Field', PX_CREDIT, PX, [
        px('force-field', 'Force field', forceField),
        px('scan', 'Scan', scan),
        px('water-drop', 'Water drop', waterDrop),
        px('bubble', 'Bubble', bubble),
      ]),
    ]),
    folder('px-air', 'Air', PX_CREDIT, PX, [
      folder('px-whoosh', 'Whoosh', PX_CREDIT, PX, [
        px('whoosh', 'Whoosh', whoosh),
        px('wind', 'Wind', wind),
        px('swipe', 'Swipe', swipe),
        px('dash', 'Dash', dash),
        px('swing', 'Swing', swing),
      ]),
      folder('px-weather', 'Weather', PX_CREDIT, PX, [
        px('rain-loop', 'Rain loop', rainLoop),
        px('wind-loop', 'Wind loop', windLoop),
        px('rain-drop', 'Rain drop', rainDrop),
        px('ocean-wave', 'Ocean wave', oceanWave),
        px('leaf-rustle', 'Leaf rustle', leafRustle),
      ]),
    ]),
    folder('px-signals', 'Signals', PX_CREDIT, PX, [
      folder('px-beeps', 'Beeps', PX_CREDIT, PX, [
        px('beep', 'Beep', beep),
        px('radar-ping', 'Radar ping', radarPing),
        px('computer-beep', 'Computer beep', computerBeep),
        px('access-granted', 'Access granted', accessGranted),
        px('shutdown', 'Shutdown', shutdown),
        px('glitch', 'Glitch', glitch),
      ]),
      folder('px-soft', 'Soft', PX_CREDIT, PX, [
        px('teleport', 'Teleport', teleport),
        px('harp', 'Harp', harp),
        px('enchant', 'Enchant', enchant),
        px('portal', 'Portal', portal),
        px('lock-open', 'Lock open', lockOpen),
        px('door-slide', 'Door slide', doorSlide),
        px('message', 'Message', message),
        px('drop', 'Drop', drop),
      ]),
    ]),
  ]),
  folder('zzfxm', 'ZzFXM', ZZ_CREDIT, ZZ, [
    folder('zz-pads', 'Pads', ZZ_CREDIT, ZZ, [
      zz('ice-sheet', 'Ice sheet', ICE_SHEET),
      zz('glass-halo', 'Glass halo', GLASS_HALO),
      zz('frost-vein', 'Frost vein', FROST_VEIN),
      zz('pale-orbit', 'Pale orbit', PALE_ORBIT),
    ]),
    folder('zz-pulses', 'Pulses', ZZ_CREDIT, ZZ, [
      zz('crt-pulse', 'CRT pulse', CRT_PULSE),
      zz('soft-clock', 'Soft clock', SOFT_CLOCK),
      zz('quiet-relay', 'Quiet relay', QUIET_RELAY),
      zz('filament', 'Filament', FILAMENT),
    ]),
    folder('zz-bells', 'Bells', ZZ_CREDIT, ZZ, [
      zz('ion-snow', 'Ion snow', ION_SNOW),
      zz('glass-step', 'Glass step', GLASS_STEP),
    ]),
    folder('zz-drones', 'Drones', ZZ_CREDIT, ZZ, [
      zz('afterimage', 'Afterimage', AFTERIMAGE),
      zz('low-mercury', 'Low mercury', LOW_MERCURY),
    ]),
  ]),
  folder('tone', 'Tone.js', TN_CREDIT, TN, [
    folder('tn-pads', 'Pads', TN_CREDIT, TN, [
      tn('icy-pad', 'Icy pad'),
      tn('glass-room', 'Glass room'),
      tn('frost-choir', 'Frost choir'),
      tn('halo-drone', 'Halo drone'),
    ]),
    folder('tn-pulses', 'Pulses', TN_CREDIT, TN, [
      tn('slow-arp', 'Slow arpeggio'),
      tn('crt-hum', 'CRT hum pulse'),
      tn('phosphor-tick', 'Phosphor tick'),
      tn('vector-bass', 'Vector bass'),
    ]),
    folder('tn-bells', 'Bells', TN_CREDIT, TN, [
      tn('night-bells', 'Night bells'),
      tn('ice-pluck', 'Ice pluck'),
    ]),
    folder('tn-texture', 'Texture', TN_CREDIT, TN, [
      tn('tape-hiss', 'Tape hiss'),
      tn('snow-static', 'Snow static'),
    ]),
  ]),
]

export function findNode(id, nodes = TREE) {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const hit = findNode(id, n.children)
      if (hit) return hit
    }
  }
  return null
}

export function pathTo(id, nodes = TREE, trail = []) {
  for (const n of nodes) {
    const next = [...trail, n]
    if (n.id === id) return next
    if (n.children) {
      const hit = pathTo(id, n.children, next)
      if (hit) return hit
    }
  }
  return null
}
