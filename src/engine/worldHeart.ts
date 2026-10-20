import * as THREE from 'three'
import type { World } from './world'

export const HEART_POINT_COUNT = 500

// ─── Textures ────────────────────────────────────────────────────────────────

/** High-detail myocardium texture: layered muscle fibres + glistening wet surface */
function myocardiumTexture () {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const g = c.getContext('2d')!

  // Base — deep wet flesh
  const baseGrad = g.createLinearGradient(0, 0, 512, 512)
  baseGrad.addColorStop(0,   '#3d0008')
  baseGrad.addColorStop(0.5, '#5a000f')
  baseGrad.addColorStop(1,   '#3a000c')
  g.fillStyle = baseGrad
  g.fillRect(0, 0, 512, 512)

  // Primary muscle fibre bundles — thick diagonal sweeps
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const len = 80 + Math.random() * 180
    const angle = (Math.random() - 0.5) * 0.6
    const w = 3 + Math.random() * 8
    const alpha = 0.15 + Math.random() * 0.25
    g.strokeStyle = `rgba(${160 + (Math.random() * 60 | 0)},${Math.random() * 20 | 0},${10 + (Math.random() * 20 | 0)},${alpha})`
    g.lineWidth = w
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    g.stroke()
  }

  // Secondary fine fibres — cross-hatching
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const len = 20 + Math.random() * 60
    const angle = Math.PI * 0.25 + (Math.random() - 0.5) * 0.4
    g.strokeStyle = `rgba(200,30,40,${0.08 + Math.random() * 0.12})`
    g.lineWidth = 0.8 + Math.random() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    g.stroke()
  }

  // Wet glistening highlights — bright specular blobs
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const r = 2 + Math.random() * 18
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    if (Math.random() < 0.3) {
      gr.addColorStop(0, `rgba(255,100,120,${0.25 + Math.random() * 0.2})`)
    } else {
      gr.addColorStop(0, `rgba(60,0,10,${0.2 + Math.random() * 0.25})`)
    }
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // Coronary vessel surface lines — darker branching streaks
  for (let i = 0; i < 8; i++) {
    const x0 = Math.random() * 512
    const y0 = Math.random() * 512
    let cx = x0, cy = y0
    g.strokeStyle = `rgba(20,0,5,0.45)`
    g.lineWidth = 2 + Math.random() * 3
    g.beginPath()
    g.moveTo(cx, cy)
    for (let j = 0; j < 6; j++) {
      cx += (Math.random() - 0.5) * 80
      cy += 30 + Math.random() * 40
      g.lineTo(cx, cy)
    }
    g.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 32)
  tex.anisotropy = 8
  return tex
}

/** Glowing coronary vessel texture — for the surface vessels running along the tunnel */
function coronaryTexture () {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(0,0,0,0)'
  g.fillRect(0, 0, 64, 256)
  const gr = g.createLinearGradient(0, 0, 64, 0)
  gr.addColorStop(0,    'rgba(0,0,0,0)')
  gr.addColorStop(0.2,  'rgba(200,20,40,0.6)')
  gr.addColorStop(0.5,  'rgba(255,60,80,0.9)')
  gr.addColorStop(0.8,  'rgba(200,20,40,0.6)')
  gr.addColorStop(1,    'rgba(0,0,0,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** Blood pool floor — deep red with caustic ripple lines */
function bloodFloorTexture () {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#1a0005'
  g.fillRect(0, 0, 256, 256)
  // Caustic ripple rings
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 8 + Math.random() * 40
    g.strokeStyle = `rgba(180,10,30,${0.15 + Math.random() * 0.2})`
    g.lineWidth = 0.5 + Math.random() * 1.5
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.stroke()
  }
  // Sheen highlights
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 3 + Math.random() * 12
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(255,30,60,${0.12 + Math.random() * 0.15})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 16)
  return tex
}

// ─── Safe placement zones ─────────────────────────────────────────────────────
//
// Player corridor: x [-3.5, +3.5], y [0, 2.5]
// ALL anatomy objects must be placed OUTSIDE this box:
//   • Left/right walls:  |x| > 4.5
//   • Ceiling:            y  > 5.0
//   • Upper-diagonal:     angle in [π*0.35 .. π*0.65] (top arc) or [−π*0.65 .. −π*0.35]
//
// Helper: returns a (x, y) point safely on the tunnel wall, never in the player lane.
function safeWallPoint (): { x: number; y: number } {
  // Pick from: left wall, right wall, ceiling arc
  // Angles measured from +X axis, going counter-clockwise.
  // Forbidden arc (roughly): angle in (-0.5, 0.5) at low y → that's the floor region.
  // Safe zones:
  //   Left wall:     angle in [π*0.55 .. π*0.95]   → x < -4.5
  //   Right wall:    angle in [-π*0.95 .. -π*0.55]  → x > +4.5
  //   Ceiling:       angle in [π*0.1 .. π*0.9] at top → y > 5
  const zone = Math.random()
  let angle: number
  if (zone < 0.35) {
    // Left wall sector
    angle = Math.PI * (0.55 + Math.random() * 0.40)
  } else if (zone < 0.70) {
    // Right wall sector
    angle = -Math.PI * (0.55 + Math.random() * 0.40)
  } else {
    // Ceiling arc (top 40%)
    angle = Math.PI * (0.15 + Math.random() * 0.70)
    if (Math.random() < 0.5) angle = -angle
    // bias toward top by remapping — ensure y > 5
    // use angles close to ±π/2 (straight up)
    angle = (Math.random() < 0.5 ? 1 : -1) * Math.PI * (0.38 + Math.random() * 0.24)
  }
  const r = 7.2 + Math.random() * 1.2
  return { x: Math.cos(angle) * r, y: 2 + Math.sin(angle) * r * 0.9 }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Trabecula carnea — a muscular ridge arc on the chamber wall.
 * Placed strictly on left wall, right wall, or ceiling.
 */
function makeTrabecula (group: THREE.Group, z: number) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8b0015,
    emissive: 0x3a0008,
    emissiveIntensity: 0.6,
    roughness: 0.7,
    metalness: 0.0
  })
  const r1 = 1.0 + Math.random() * 0.9
  const r2 = 0.07 + Math.random() * 0.10
  const geo = new THREE.TorusGeometry(r1, r2, 8, 24, Math.PI * 0.7)
  const m = new THREE.Mesh(geo, mat)
  const { x, y } = safeWallPoint()
  m.position.set(x, y, z)
  m.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI
  )
  m.scale.setScalar(0.6 + Math.random() * 0.5)
  group.add(m)
  return m
}

/**
 * Chordae tendineae — thin tendon strings that hang from the CEILING/upper walls
 * downward. They never extend into the player lane (x stays > 4 or < -4 near the
 * bottom, and the bottom anchor is on the side wall, not the floor centre).
 */
function makeChorda (group: THREE.Group, z: number) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd0d0,
    emissive: 0x330000,
    roughness: 0.9,
    metalness: 0.0
  })
  // Pick a side: left (-1) or right (+1)
  const side = Math.random() < 0.5 ? -1 : 1
  // Top anchor: on the upper-diagonal wall at x ±(5..7), y 5..8
  const topX = side * (5.0 + Math.random() * 2.0)
  const topY = 5.5 + Math.random() * 2.5
  // Bottom anchor: stays near the wall, not in the lane centre
  const botX = side * (4.0 + Math.random() * 2.5)
  const botY = 2.5 + Math.random() * 1.5   // never below y=2.5 (above player head)

  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const sway = Math.sin(t * Math.PI) * 0.2
    points.push(new THREE.Vector3(
      topX + (botX - topX) * t + sway * side * 0.3,
      topY + (botY - topY) * t,
      (Math.random() - 0.5) * 0.3
    ))
  }
  const curve = new THREE.CatmullRomCurve3(points)
  const geo = new THREE.TubeGeometry(curve, 14, 0.022 + Math.random() * 0.018, 5, false)
  const m = new THREE.Mesh(geo, mat)
  m.position.z = z
  group.add(m)
  return m
}

/**
 * Valve leaflet — placed high up (y > 4.5), spanning across the ceiling arc.
 * Leaflets are in the ceiling/top region, well above the player.
 */
function makeValveLeaflet (group: THREE.Group, z: number, angle: number) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf5c8c8,
    emissive: 0x220000,
    emissiveIntensity: 0.3,
    roughness: 0.5,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.82
  })
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.quadraticCurveTo(0.7, 0.35, 0, 1.6)
  shape.quadraticCurveTo(-0.7, 0.35, 0, 0)
  const geo = new THREE.ShapeGeometry(shape, 12)
  const m = new THREE.Mesh(geo, mat)
  // Place on ceiling ring at y=5.5, radius ~2 from centre
  const r = 1.8 + Math.random() * 0.6
  m.position.set(Math.cos(angle) * r, 5.5, z)
  m.rotation.y = angle + Math.PI * 0.5
  m.rotation.x = -0.2   // tilt slightly toward viewer (pointing downward)
  group.add(m)
  return m
}

/**
 * Papillary muscle — cone on the SIDE walls, not the floor centre.
 * Placed on left or right wall, growing inward (not upward from floor lane).
 */
function makePapillaryMuscle (group: THREE.Group, z: number) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x7a0012,
    emissive: 0x2a0008,
    emissiveIntensity: 0.5,
    roughness: 0.75
  })
  const height = 0.9 + Math.random() * 0.7
  const geo = new THREE.ConeGeometry(0.22 + Math.random() * 0.12, height, 10)
  const m = new THREE.Mesh(geo, mat)
  // Place on left or right wall, pointing inward
  const side = Math.random() < 0.5 ? -1 : 1
  const wx = side * (5.5 + Math.random() * 2.0)   // on the wall, |x| > 5.5
  const wy = 1.0 + Math.random() * 3.5             // height along the wall
  m.position.set(wx, wy, z)
  // Rotate so cone points inward toward the lane (not upward)
  m.rotation.z = side * (-Math.PI * 0.5) + (Math.random() - 0.5) * 0.3
  group.add(m)
  return m
}

/** Coronary vessel — glowing tube running along the outer wall */
function makeCoronaryVessel (group: THREE.Group, side: number) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff1a3a,
    transparent: true,
    opacity: 0.7
  })
  const pts: THREE.Vector3[] = []
  const wallR = 8.2
  const baseAngle = side * Math.PI * 0.5
  for (let i = 0; i <= 20; i++) {
    const t  = i / 20
    const z  = -t * 220
    const a  = baseAngle + Math.sin(t * Math.PI * 4) * 0.25
    pts.push(new THREE.Vector3(
      Math.cos(a) * wallR,
      2 + Math.sin(a) * wallR * 0.5,
      z
    ))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const geo = new THREE.TubeGeometry(curve, 80, 0.06 + Math.random() * 0.04, 6, false)
  const m = new THREE.Mesh(geo, mat)
  group.add(m)
  return m
}

/** Glowing inner ring light band — mimics the Purkinje network flash */
function makePurkinjeRing (group: THREE.Group, z: number) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff4466,
    transparent: true,
    opacity: 0.22
  })
  const geo = new THREE.TorusGeometry(7.2, 0.08, 6, 48)
  const m = new THREE.Mesh(geo, mat)
  m.rotation.x = Math.PI * 0.5
  m.position.set(0, 2, z)
  group.add(m)
  return m
}

// ─── Particle placement ───────────────────────────────────────────────────────

/** Place a red blood cell (biconcave disc shape) in the streaming flow */
export function placeHeartParticle (m: THREE.Object3D, z: number) {
  const a = Math.random() * Math.PI * 2
  const r = 4.5 + Math.random() * 3.5
  m.position.set(Math.cos(a) * r, 1.5 + Math.sin(a) * r * 0.7, z)
  m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0)
}

// ─── Main factory ─────────────────────────────────────────────────────────────

export interface HeartWorld extends World {
  trabeculae: THREE.Mesh[]
  chordae: THREE.Mesh[]
  valveLeaflets: THREE.Mesh[]
  papillaryMuscles: THREE.Mesh[]
  coronaryVessels: THREE.Mesh[]
  purkinjeRings: THREE.Mesh[]
  phase: number   // heartbeat phase accumulator, driven by GameEngine
}

export function createHeartWorld (S: THREE.Scene): HeartWorld {
  const group = new THREE.Group()
  S.add(group)

  // ── Tunnel — irregular cardiac chamber interior ──────────────────────────
  const tg = new THREE.CylinderGeometry(8.8, 8.8, 220, 36, 32, true)
  tg.rotateX(Math.PI / 2)
  const tp = tg.attributes.position
  for (let i = 0; i < tp.count; i++) {
    const x  = tp.getX(i)
    const y  = tp.getY(i)
    const z  = tp.getZ(i)
    // Trabecular bulge wave — irregular ridges along the z-axis
    const ridgeWave = Math.sin(z * 0.35 + i * 0.7) * 0.6
                    + Math.sin(z * 0.12 + i * 1.3) * 0.35
    // Slight oval cross-section (wider than tall, like a real ventricle)
    const ovalX = 1 + ridgeWave * 0.08
    const ovalY = 0.85 + ridgeWave * 0.06
    tp.setX(i, x * ovalX)
    tp.setY(i, y * ovalY)
  }
  tp.needsUpdate = true
  tg.computeVertexNormals()

  const tex = myocardiumTexture()
  const tunnel = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(0x500010),
      emissiveIntensity: 1.2,
      side: THREE.BackSide,
      roughness: 0.72,
      metalness: 0.05
    })
  )
  tunnel.position.set(0, 2, -90)
  group.add(tunnel)

  // ── Blood pool floor — wet, reflective, dark red ─────────────────────────
  const floorTex = bloodFloorTexture()
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 220, 1, 1),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0x1a0005,
      emissive: 0x280008,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.4,
      transparent: true,
      opacity: 0.92
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -90)
  group.add(floor)

  // ── Lane edges — pulsing red neon ────────────────────────────────────────
  const edgeM = new THREE.MeshBasicMaterial({ color: 0xff1a3a })
  ;[-3.5, 3.5].forEach(x => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 220), edgeM)
    e.position.set(x, 0.04, -90)
    group.add(e)
  })

  // ── Lane dashes — deep red ───────────────────────────────────────────────
  const dg = new THREE.BoxGeometry(0.05, 0.015, 1.4)
  const dm = new THREE.MeshBasicMaterial({ color: 0xff4466 })
  const dashes: THREE.Mesh[] = []
  ;[-1, 1].forEach(x => {
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(dg, dm)
      d.position.set(x, 0.02, -i * 7)
      group.add(d)
      dashes.push(d)
    }
  })

  // ── Trabeculae carnae — muscular ridges on the chamber wall ──────────────
  const trabeculae: THREE.Mesh[] = []
  for (let i = 0; i < 32; i++) {
    trabeculae.push(makeTrabecula(group, -Math.random() * 200))
  }

  // ── Chordae tendineae — tendon strings from valves ───────────────────────
  const chordae: THREE.Mesh[] = []
  // Place clusters every ~25 units along the tunnel
  for (let z = -20; z > -200; z -= 25) {
    const count = 2 + (Math.random() * 3 | 0)
    for (let c = 0; c < count; c++) {
      chordae.push(makeChorda(group, z + (Math.random() - 0.5) * 8))
    }
  }

  // ── Valve leaflets — at regular intervals (mitral / tricuspid clusters) ──
  const valveLeaflets: THREE.Mesh[] = []
  const valvePositions = [-15, -55, -100, -145, -185]
  for (const z of valvePositions) {
    for (let a = 0; a < 3; a++) {
      valveLeaflets.push(makeValveLeaflet(group, z, (a / 3) * Math.PI * 2))
    }
  }

  // ── Papillary muscles — conical stumps rising from the floor ─────────────
  const papillaryMuscles: THREE.Mesh[] = []
  for (let z = -10; z > -210; z -= 18) {
    papillaryMuscles.push(makePapillaryMuscle(group, z + Math.random() * 6))
    if (Math.random() < 0.5)
      papillaryMuscles.push(makePapillaryMuscle(group, z - 4))
  }

  // ── Coronary vessels — glowing tubes along the outer wall ────────────────
  const coronaryVessels: THREE.Mesh[] = []
  for (let s = 0; s < 4; s++) {
    coronaryVessels.push(makeCoronaryVessel(group, s))
  }

  // ── Purkinje rings — electrical conduction glows ─────────────────────────
  const purkinjeRings: THREE.Mesh[] = []
  for (let z = -10; z > -210; z -= 30) {
    purkinjeRings.push(makePurkinjeRing(group, z))
  }

  // ── Red blood cells (rbcs array) — biconcave disc shapes ─────────────────
  // Using TorusGeometry(r, tube, 10, 20) flattened like the bloodstream
  const rbcGeo = new THREE.TorusGeometry(0.55, 0.22, 8, 18)
  const rbcMat = new THREE.MeshStandardMaterial({
    color: 0xcc0020,
    emissive: 0x440008,
    roughness: 0.45
  })
  const rbcs: THREE.Mesh[] = []
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(rbcGeo, rbcMat)
    m.scale.z = 0.4   // flatten into biconcave disc
    placeHeartParticle(m, -Math.random() * 130)
    group.add(m)
    rbcs.push(m)
  }

  // ── Plasma particles — small bright red specks ───────────────────────────
  const points = new THREE.BufferGeometry()
  const pa = new Float32Array(HEART_POINT_COUNT * 3)
  for (let i = 0; i < HEART_POINT_COUNT; i++) {
    pa[i * 3]     = (Math.random() - 0.5) * 16
    pa[i * 3 + 1] = Math.random() * 9
    pa[i * 3 + 2] = -Math.random() * 130
  }
  points.setAttribute('position', new THREE.BufferAttribute(pa, 3))
  const pointsMesh = new THREE.Points(
    points,
    new THREE.PointsMaterial({
      color: 0xff3355,
      size: 0.11,
      transparent: true,
      opacity: 0.7
    })
  )
  group.add(pointsMesh)

  // ── Idle platform — glowing red ring ─────────────────────────────────────
  const plat = new THREE.Group()
  plat.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.05, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xff1a3a })
    ),
    new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff1a3a,
        transparent: true,
        opacity: 0.15
      })
    )
  )
  plat.rotation.x = -Math.PI / 2
  plat.position.y = 0.06
  group.add(plat)

  const dispose = () => {
    S.remove(group)
    group.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose())
        } else if (obj.material) {
          obj.material.dispose()
        }
      }
    })
    tex.dispose()
    floorTex.dispose()
  }

  return {
    group,
    tunnel, tex, dashes, rbcs, points, pa, plat,
    trabeculae, chordae, valveLeaflets, papillaryMuscles,
    coronaryVessels, purkinjeRings,
    phase: 0,
    dispose
  }
}
