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
} from 'plinkfx/sounds'

const OL = 'https://github.com/btahir/open-lofi'
const PX = 'https://github.com/maximilianfeix/plinkfx'
const ZZ = 'https://github.com/keithclark/ZzFXM'
const TN = 'https://github.com/Tonejs/Tone.js'

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

function file(cat, fileName, title) {
  return {
    id: `ol-${fileName.replace(/\.mp3$/, '')}`,
    kind: 'audio',
    engine: 'file',
    title,
    src: withBase(`experiments/sound-browser/open-lofi/${cat}/${fileName}`),
    credit: 'btahir',
    href: OL,
  }
}

export const TREE = [
  {
    id: 'open-lofi',
    kind: 'folder',
    title: 'Open Lo-Fi',
    credit: 'btahir',
    href: OL,
    children: [
      {
        id: 'ambient-lofi',
        kind: 'folder',
        title: 'Ambient Drift',
        credit: 'btahir',
        href: OL,
        children: [
          file('ambient-lofi', 'aurora-on-mute.mp3', 'Aurora on Mute'),
          file('ambient-lofi', 'deep-space-loop.mp3', 'Deep Space Loop'),
          file('ambient-lofi', 'orbiting-in-silence.mp3', 'Orbiting in Silence'),
          file('ambient-lofi', 'satellite-lullaby.mp3', 'Satellite Lullaby'),
        ],
      },
      {
        id: 'late-night',
        kind: 'folder',
        title: 'Late Night / Neon',
        credit: 'btahir',
        href: OL,
        children: [
          file('late-night', '3-am-echoes.mp3', '3 AM Echoes'),
          file('late-night', 'electric-puddles.mp3', 'Electric Puddles'),
          file('late-night', 'rain-off-the-neon-signs.mp3', 'Rain Off the Neon Signs'),
        ],
      },
      {
        id: 'jazzhop',
        kind: 'folder',
        title: 'Jazz Lounge',
        credit: 'btahir',
        href: OL,
        children: [
          file('jazzhop', 'candlelit-at-70-bpm.mp3', 'Candlelit at 70 BPM'),
          file('jazzhop', 'rain-on-the-boulevard.mp3', 'Rain on the Boulevard'),
          file('jazzhop', 'stacks-of-quiet-books.mp3', 'Stacks of Quiet Books'),
        ],
      },
    ],
  },
  {
    id: 'plinkfx',
    kind: 'folder',
    title: 'plinkfx',
    credit: 'maximilianfeix',
    href: PX,
    children: [
      {
        id: 'px-ui',
        kind: 'folder',
        title: 'UI',
        credit: 'maximilianfeix',
        href: PX,
        children: [
          px('click-soft', 'Click Soft', clickSoft),
          px('hover', 'Hover', hover),
          px('plink', 'Plink', plink),
          px('notify', 'Notify', notify),
          px('select-soft', 'Select Soft', selectSoft),
        ],
      },
      {
        id: 'px-ice',
        kind: 'folder',
        title: 'Ice',
        credit: 'maximilianfeix',
        href: PX,
        children: [
          px('ice', 'Ice', ice),
          px('force-field', 'Force Field', forceField),
          px('scan', 'Scan', scan),
          px('water-drop', 'Water Drop', waterDrop),
        ],
      },
      {
        id: 'px-whoosh',
        kind: 'folder',
        title: 'Whoosh',
        credit: 'maximilianfeix',
        href: PX,
        children: [
          px('whoosh', 'Whoosh', whoosh),
          px('wind', 'Wind', wind),
          px('swipe', 'Swipe', swipe),
          px('dash', 'Dash', dash),
        ],
      },
      {
        id: 'px-glass',
        kind: 'folder',
        title: 'Glass',
        credit: 'maximilianfeix',
        href: PX,
        children: [
          px('glass-break', 'Glass Break', glassBreak),
          px('bubble', 'Bubble', bubble),
        ],
      },
    ],
  },
  {
    id: 'zzfxm',
    kind: 'folder',
    title: 'ZzFXM',
    credit: 'Keith Clark',
    href: ZZ,
    children: [
      {
        id: 'zz-pads',
        kind: 'folder',
        title: 'Pads',
        credit: 'Radley’s AI Playground',
        href: ZZ,
        children: [
          zz('ice-sheet', 'Ice Sheet', ICE_SHEET),
          zz('glass-halo', 'Glass Halo', GLASS_HALO),
        ],
      },
      {
        id: 'zz-pulses',
        kind: 'folder',
        title: 'Pulses',
        credit: 'Radley’s AI Playground',
        href: ZZ,
        children: [
          zz('crt-pulse', 'CRT Pulse', CRT_PULSE),
          zz('soft-clock', 'Soft Clock', SOFT_CLOCK),
        ],
      },
    ],
  },
  {
    id: 'tone',
    kind: 'folder',
    title: 'Tone.js',
    credit: 'Yotam Mann',
    href: TN,
    children: [
      {
        id: 'tn-pads',
        kind: 'folder',
        title: 'Pads',
        credit: 'Yotam Mann',
        href: TN,
        children: [
          tn('icy-pad', 'Icy Pad'),
          tn('glass-room', 'Glass Room'),
        ],
      },
      {
        id: 'tn-pulses',
        kind: 'folder',
        title: 'Pulses',
        credit: 'Yotam Mann',
        href: TN,
        children: [
          tn('slow-arp', 'Slow Arpeggio'),
          tn('crt-hum', 'CRT Hum Pulse'),
        ],
      },
    ],
  },
]

function px(id, title, sound) {
  return {
    id: `px-snd-${id}`,
    kind: 'audio',
    engine: 'plink',
    title,
    sound,
    credit: 'maximilianfeix',
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
    credit: 'Radley’s AI Playground',
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
    credit: 'Tone.js by Yotam Mann and contributors',
    href: TN,
  }
}

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
