import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { taptic } from '../lib/haptics.js'
import { unlock, canPlay, tone, noise, loopNoise } from '../lib/audio.js'
import { isLive } from '../lib/play.js'

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const BG = 0x02050c
const TAP = 12
const HALT = 5
const GAP = 1.06
const CUBE = 0.92
const DARK = 0x0b1622
const EDGE = 0x3d6f88
const TILE = 0x5ce1ff
const TILE_EM = 0x7af0ff
const FACES = [
  { dir: [1, 0, 0], rot: [0, Math.PI / 2, 0] },
  { dir: [-1, 0, 0], rot: [0, -Math.PI / 2, 0] },
  { dir: [0, 1, 0], rot: [-Math.PI / 2, 0, 0] },
  { dir: [0, -1, 0], rot: [Math.PI / 2, 0, 0] },
  { dir: [0, 0, 1], rot: [0, 0, 0] },
  { dir: [0, 0, -1], rot: [0, Math.PI, 0] },
]
const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)

function pickFace(ix, iy, iz) {
  const faces = []
  if (ix === 1) faces.push(0)
  if (ix === -1) faces.push(1)
  if (iy === 1) faces.push(2)
  if (iy === -1) faces.push(3)
  if (iz === 1) faces.push(4)
  if (iz === -1) faces.push(5)
  return faces[(Math.random() * faces.length) | 0]
}

function darkMat() {
  return new THREE.MeshStandardMaterial({
    color: DARK,
    metalness: 0.42,
    roughness: 0.38,
    emissive: 0x081018,
    emissiveIntensity: 0.35,
  })
}

function tileMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xb7f6ff,
    metalness: 0.08,
    roughness: 0.2,
    emissive: TILE_EM,
    emissiveIntensity: 2.8,
  })
}

export function mount(stage, { still, peek } = {}) {
  stage.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
  const frame = stage.closest('.stage-frame') || stage

  const renderer = new THREE.WebGLRenderer({ antialias: !peek, alpha: false, powerPreference: 'high-performance' })
  renderer.setClearColor(BG, 1)
  renderer.setPixelRatio(Math.min(peek ? 1 : 2, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.domElement.style.cssText = peek
    ? 'width:100%;height:100%;display:block;pointer-events:none;touch-action:none;'
    : 'width:100%;height:100%;display:block;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none;'
  stage.replaceChildren(renderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(BG, 0.048)
  scene.background = new THREE.Color(BG)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 80)
  const camHome = new THREE.Vector3(0, 1.85, 10.4)
  camera.position.copy(camHome)
  camera.lookAt(0, 0.05, 0)

  const ambient = new THREE.AmbientLight(0x4a7a92, 0.22)
  const key = new THREE.DirectionalLight(0xd8f6ff, 0.85)
  key.position.set(3.2, 6.4, 5.2)
  const fill = new THREE.DirectionalLight(0x3d6f88, 0.28)
  fill.position.set(-4, 1.2, -2)
  const glowLight = new THREE.PointLight(0x7af0ff, 0.55, 18, 2)
  scene.add(ambient, key, fill, glowLight)

  const floor = new THREE.Group()
  const gridA = new THREE.GridHelper(56, 28, 0x3d6f88, 0x1a3344)
  const gridB = new THREE.GridHelper(56, 112, 0x163044, 0x0c1824)
  gridA.material.transparent = true
  gridA.material.opacity = 0.38
  gridB.material.transparent = true
  gridB.material.opacity = 0.16
  floor.add(gridA, gridB)
  floor.position.y = -2.42
  scene.add(floor)

  const haloGeo = new THREE.SphereGeometry(2.85, 24, 16)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x7af0ff,
    transparent: true,
    opacity: 0.03,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  scene.add(halo)

  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.72, 0.18)
  composer.addPass(renderPass)
  composer.addPass(bloom)

  const boxGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE)
  const edgeGeo = new THREE.EdgesGeometry(boxGeo)
  const edgeMat = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.55 })
  const tileGeo = new THREE.PlaneGeometry(0.72, 0.72)
  const dustGeo = new THREE.BufferGeometry()
  const DUST_N = 26 * 28
  const dustPos = new Float32Array(DUST_N * 3)
  const dustVel = new Float32Array(DUST_N * 3)
  const dustCol = new Float32Array(DUST_N * 3)
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3))
  const dustMat = new THREE.PointsMaterial({
    size: 0.07,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const dust = new THREE.Points(dustGeo, dustMat)
  scene.add(dust)

  let puzzle = new THREE.Group()
  scene.add(puzzle)
  let cubies = []
  let colored = null
  let tileMesh = null
  let colorMat = tileMat()
  let mode = 'play'
  let burstT = 0
  let zoomT = 0
  let angX = 0
  let angY = 0
  let dragging = false
  let moved = false
  let sx = 0
  let sy = 0
  let lx = 0
  let ly = 0
  let lt = 0
  let pid = null
  let raf = 0
  let last = performance.now()
  let whoosh = null
  let prevSpeed = 0

  function ensureWhoosh(fresh = false) {
    if (peek || still) return
    unlock()
    if (fresh && whoosh) {
      whoosh.stop()
      whoosh = null
    }
    if (whoosh || !canPlay()) return
    whoosh = loopNoise({ freq: 380, q: 0.75 })
  }

  function flickWhoosh(sp) {
    const k = Math.min(1, sp / 8.5)
    if (k < 0.08) return
    noise({ duration: 0.22, peak: 0.03 + k * 0.07, freq: 280 + k * 420, q: 0.7, slide: 160 + k * 80, type: 'bandpass' })
  }

  function settleClick() {
    tone({ type: 'triangle', freq: 1320, duration: 0.045, peak: 0.07, slide: 980 })
    noise({ duration: 0.03, peak: 0.04, freq: 2400, q: 1.4, type: 'highpass' })
  }

  function chime() {
    tone({ type: 'sine', freq: 784, duration: 0.38, peak: 0.11, slide: 784 })
    tone({ type: 'sine', freq: 1175, duration: 0.46, peak: 0.08, slide: 1175 })
    tone({ type: 'triangle', freq: 1568, duration: 0.22, peak: 0.04 })
  }

  function wrongTap() {
    tone({ type: 'square', freq: 168, duration: 0.11, peak: 0.06, slide: 92 })
    noise({ duration: 0.08, peak: 0.05, freq: 220, q: 0.9, type: 'lowpass' })
  }
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const look = new THREE.Vector3(0, 0.05, 0)
  const zoomFrom = new THREE.Vector3()
  const zoomTo = new THREE.Vector3()
  const winnerWorld = new THREE.Vector3()

  function poseStill() {
    puzzle.rotation.set(0.38, 0.52, 0.04)
    angX = 0
    angY = 0
  }

  function build(seedFace) {
    for (const c of cubies) {
      c.material?.dispose?.()
      puzzle.remove(c)
    }
    cubies = []
    colored = null
    tileMesh = null
    colorMat.dispose()
    colorMat = tileMat()
    puzzle.clear()

    const outer = []
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        for (let iz = -1; iz <= 1; iz++) {
          const body = new THREE.Mesh(boxGeo, darkMat())
          body.position.set(ix * GAP, iy * GAP, iz * GAP)
          const lines = new THREE.LineSegments(edgeGeo, edgeMat)
          body.add(lines)
          body.userData = { ix, iy, iz, winner: false }
          puzzle.add(body)
          cubies.push(body)
          if (ix || iy || iz) outer.push(body)
        }
      }
    }

    let winner
    let face
    if (still) {
      winner = cubies.find((c) => c.userData.ix === 1 && c.userData.iy === 1 && c.userData.iz === 1)
      face = 4
    } else if (seedFace) {
      winner = seedFace.winner
      face = seedFace.face
    } else {
      winner = outer[(Math.random() * outer.length) | 0]
      face = pickFace(winner.userData.ix, winner.userData.iy, winner.userData.iz)
    }

    const f = FACES[face]
    const tile = new THREE.Mesh(tileGeo, colorMat)
    tile.position.set(f.dir[0] * (CUBE / 2 + 0.012), f.dir[1] * (CUBE / 2 + 0.012), f.dir[2] * (CUBE / 2 + 0.012))
    tile.rotation.set(...f.rot)
    tile.userData.colored = true
    winner.add(tile)
    winner.userData.winner = true
    colored = winner
    tileMesh = tile
    if (still) poseStill()
  }

  function local(e) {
    const box = renderer.domElement.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, h: box.height }
  }

  function hitsAt(e) {
    const p = local(e)
    ndc.set((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return ray.intersectObjects(cubies, true)
  }

  function spinSpeed() {
    return Math.hypot(angX, angY)
  }

  function burst() {
    mode = 'burst'
    burstT = 0
    angX = 0
    angY = 0
    taptic(18)
    chime()
    colored.getWorldPosition(winnerWorld)
    const wp = new THREE.Vector3()
    let i = 0
    for (const c of cubies) {
      if (c === colored) continue
      c.getWorldPosition(wp)
      for (let k = 0; k < 28; k++) {
        const o = i * 3
        dustPos[o] = wp.x + (Math.random() - 0.5) * 0.7
        dustPos[o + 1] = wp.y + (Math.random() - 0.5) * 0.7
        dustPos[o + 2] = wp.z + (Math.random() - 0.5) * 0.7
        const dir = new THREE.Vector3(
          wp.x + (Math.random() - 0.5) * 0.4,
          wp.y + (Math.random() - 0.5) * 0.4 + 0.35,
          wp.z + (Math.random() - 0.5) * 0.4,
        ).normalize()
        const sp = 1.6 + Math.random() * 3.4
        dustVel[o] = dir.x * sp
        dustVel[o + 1] = dir.y * sp + 0.8
        dustVel[o + 2] = dir.z * sp
        dustCol[o] = 0.45 + Math.random() * 0.55
        dustCol[o + 1] = 0.75 + Math.random() * 0.25
        dustCol[o + 2] = 1
        i++
      }
      c.visible = false
    }
    dustGeo.attributes.position.needsUpdate = true
    dustGeo.attributes.color.needsUpdate = true
    dustMat.opacity = reduced ? 0.15 : 0.95
  }

  function beginZoom() {
    mode = 'zoom'
    zoomT = 0
    zoomFrom.copy(camera.position)
    colored.getWorldPosition(winnerWorld)
    const dir = camera.position.clone().sub(look).normalize()
    zoomTo.copy(winnerWorld).addScaledVector(dir, 1.15)
  }

  function restart() {
    dustMat.opacity = 0
    for (const c of cubies) c.visible = true
    puzzle.rotation.set(0, 0, 0)
    camera.position.copy(camHome)
    camera.lookAt(look)
    build()
    mode = 'play'
    angX = 0
    angY = 0
  }

  function onDown(e) {
    if (peek || still || !isLive() || mode !== 'play') return
    if (e.button) return
    unlock()
    ensureWhoosh()
    renderer.domElement.setPointerCapture?.(e.pointerId)
    pid = e.pointerId
    dragging = true
    moved = false
    const p = local(e)
    sx = p.x
    sy = p.y
    lx = p.x
    ly = p.y
    lt = performance.now()
    angX = 0
    angY = 0
    renderer.domElement.style.cursor = 'grabbing'
  }

  function onMove(e) {
    if (!dragging || e.pointerId !== pid || mode !== 'play') return
    const p = local(e)
    const now = performance.now()
    const dt = Math.max(0.008, (now - lt) / 1000)
    const dx = p.x - lx
    const dy = p.y - ly
    if (Math.hypot(p.x - sx, p.y - sy) > TAP) moved = true
    const k = 0.0054
    puzzle.rotateOnWorldAxis(AXIS_Y, dx * k)
    puzzle.rotateOnWorldAxis(AXIS_X, dy * k)
    angY = (dx / dt) * k
    angX = (dy / dt) * k
    lx = p.x
    ly = p.y
    lt = now
  }

  function onUp(e) {
    if (e.pointerId !== pid) return
    unlock()
    ensureWhoosh(true)
    const wasDrag = dragging
    dragging = false
    pid = null
    renderer.domElement.style.cursor = 'grab'
    if (!wasDrag || peek || still || mode !== 'play') return
    const p = local(e)
    if (!moved && Math.hypot(p.x - sx, p.y - sy) <= TAP) {
      angX = 0
      angY = 0
      const hits = hitsAt(e)
      const win = hits.find((h) => h.object.userData?.colored)
      if (win) burst()
      else if (hits.length) wrongTap()
      return
    }
    const cap = reduced ? 4.2 : 9.5
    const sp = Math.hypot(angX, angY)
    if (sp > cap) {
      angX = (angX / sp) * cap
      angY = (angY / sp) * cap
    }
    flickWhoosh(Math.hypot(angX, angY))
  }

  if (!peek) {
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointercancel', onUp)
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  function resize() {
    const r = frame.getBoundingClientRect()
    const w = Math.max(1, r.width)
    const h = Math.max(1, r.height)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const dist = camera.aspect < 0.72 ? 11.6 : camera.aspect < 1.1 ? 9.6 : 8.2
    camHome.set(0, 1.85, dist)
    if (mode === 'play') {
      camera.position.copy(camHome)
      camera.lookAt(look)
    }
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    bloom.setSize(w, h)
  }

  function step(now) {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    const speed = spinSpeed()

    if (mode === 'play' && isLive()) {
      if (!dragging && !still) {
        if (peek || (reduced && speed < 0.04)) {
          if (!reduced) {
            puzzle.rotateOnWorldAxis(AXIS_Y, dt * 0.22)
            puzzle.rotateOnWorldAxis(AXIS_X, dt * 0.08)
          }
        } else {
          puzzle.rotateOnWorldAxis(AXIS_Y, angY * dt)
          puzzle.rotateOnWorldAxis(AXIS_X, angX * dt)
          const decay = Math.pow(0.012, dt / HALT)
          angX *= decay
          angY *= decay
          if (Math.hypot(angX, angY) < 0.018) {
            angX = 0
            angY = 0
          }
        }
      }
    } else if (mode === 'burst') {
      burstT += dt
      const attr = dustGeo.attributes.position
      for (let i = 0; i < DUST_N; i++) {
        const o = i * 3
        dustVel[o + 1] -= 2.8 * dt
        dustPos[o] += dustVel[o] * dt
        dustPos[o + 1] += dustVel[o + 1] * dt
        dustPos[o + 2] += dustVel[o + 2] * dt
      }
      attr.needsUpdate = true
      dustMat.opacity = reduced ? Math.max(0, 0.2 - burstT * 0.5) : Math.max(0, 0.95 - burstT * 0.55)
      const hold = reduced ? 0.28 : 0.85
      if (burstT > hold) beginZoom()
    } else if (mode === 'zoom') {
      zoomT += dt
      const dur = reduced ? 0.28 : 1.05
      const t = Math.min(1, zoomT / dur)
      const e = 1 - (1 - t) * (1 - t)
      camera.position.lerpVectors(zoomFrom, zoomTo, e)
      camera.lookAt(winnerWorld)
      if (t >= 1) restart()
    }

    if (!whoosh && !peek && !still && isLive()) ensureWhoosh()
    if (whoosh && mode === 'play') {
      const k = Math.min(1, speed / 8.5)
      whoosh.set(k * 0.055, 300 + k * 520)
    } else if (whoosh) {
      whoosh.set(0)
    }
    if (!dragging && !still && !peek && mode === 'play' && prevSpeed > 0.12 && speed < 0.018) {
      settleClick()
    }
    prevSpeed = speed

    const g = still ? 0.42 : Math.min(1, speed / 6.2)
    glowLight.intensity = 0.35 + g * 3.4
    bloom.strength = (peek ? 0.22 : 0.26) + g * 1.05
    colorMat.emissiveIntensity = 1.05 + g * 2.1
    haloMat.opacity = 0.03 + g * 0.16
    halo.scale.setScalar(1 + g * 0.12)

    composer.render()
    raf = requestAnimationFrame(step)
  }

  const ro = new ResizeObserver(() => resize())
  ro.observe(frame)
  build()
  resize()
  last = performance.now()
  raf = requestAnimationFrame(step)

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    renderer.domElement.removeEventListener('pointerdown', onDown)
    renderer.domElement.removeEventListener('pointermove', onMove)
    renderer.domElement.removeEventListener('pointerup', onUp)
    renderer.domElement.removeEventListener('pointercancel', onUp)
    composer.dispose()
    renderer.dispose()
    boxGeo.dispose()
    edgeGeo.dispose()
    tileGeo.dispose()
    dustGeo.dispose()
    haloGeo.dispose()
    colorMat.dispose()
    edgeMat.dispose()
    haloMat.dispose()
    dustMat.dispose()
    whoosh?.stop()
    whoosh = null
  }
}
