import * as THREE from 'three'
import type { World } from './world'

export const LUNGS_POINT_COUNT = 350

/** Blue-teal bronchial airway texture */
function lungsTexture () {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!

  // Deep navy bronchial base
  const bg = g.createLinearGradient(0, 0, 512, 512)
  bg.addColorStop(0, '#061426')
  bg.addColorStop(0.5, '#0a1f38')
  bg.addColorStop(1, '#051020')
  g.fillStyle = bg
  g.fillRect(0, 0, 512, 512)

  // Cartilage ring bands — horizontal ribbing along the airway
  for (let i = 0; i < 24; i++) {
    const y = (i / 24) * 512
    const gr = g.createLinearGradient(0, y - 6, 0, y + 6)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(0.5, `rgba(40,160,240,${0.18 + Math.random() * 0.12})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, y - 6, 512, 12)
  }

  // Ciliated mucosal membrane sheen — fine horizontal striations
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * 512
    const len = 40 + Math.random() * 120
    const x = Math.random() * 512
    g.strokeStyle = `rgba(100,210,255,${0.06 + Math.random() * 0.1})`
    g.lineWidth = 1 + Math.random() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + len, y)
    g.stroke()
  }

  // Moisture / mucus shimmer droplets
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const r = 2 + Math.random() * 14
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, Math.random() < 0.4 ? 'rgba(80,220,255,.22)' : 'rgba(0,80,140,.25)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 28)
  tex.anisotropy = 4
  return tex
}

/**
 * Safe placement on airway walls: left wall, right wall, or ceiling.
 * Never inside the running lane: x in [-3.5, 3.5], y in [0, 2.5].
 */
function safeLungsWallPoint (): { x: number; y: number } {
  const zone = Math.random()
  let angle: number
  if (zone < 0.4) {
    // Left wall: angle around π
    angle = Math.PI * (0.60 + Math.random() * 0.35)
  } else if (zone < 0.8) {
    // Right wall: angle around 0 / 2π
    angle = -Math.PI * (0.60 + Math.random() * 0.35)
  } else {
    // Ceiling arc: top of airway (y > 4.5)
    angle = (Math.random() < 0.5 ? 1 : -1) * Math.PI * (0.35 + Math.random() * 0.30)
  }
  const r = 7.0 + Math.random() * 1.5
  return { x: Math.cos(angle) * r, y: 2 + Math.sin(angle) * r * 0.9 }
}

/** Place air bubbles / alveolar sacs safely outside the player corridor */
export function placeLungsParticle (m: THREE.Mesh, z: number) {
  const p = safeLungsWallPoint()
  m.position.set(p.x, p.y, z)
  m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
}

/** C-shaped tracheal/bronchial cartilage ring arching over ceiling and side walls */
function makeCartilageRing (group: THREE.Group, z: number) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x80d0ff,
    emissive: 0x003366,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.65
  })
  // C-shaped arch over top and sides
  const geo = new THREE.TorusGeometry(8.2, 0.12, 8, 36, Math.PI * 1.25)
  const m = new THREE.Mesh(geo, mat)
  m.rotation.x = Math.PI * 0.5
  m.rotation.z = -Math.PI * 0.125 // center over top
  m.position.set(0, 2.0, z)
  group.add(m)
  return m
}

/** Branching bronchiole junction port along the airway walls */
function makeBranchingPort (group: THREE.Group, z: number, side: number) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x006699,
    emissive: 0x002244,
    emissiveIntensity: 0.4,
    roughness: 0.6
  })
  const geo = new THREE.TorusGeometry(1.5, 0.11, 8, 24)
  const m = new THREE.Mesh(geo, mat)
  const x = side * 8.4
  m.position.set(x, 2.8 + (Math.random() - 0.5) * 1.2, z)
  m.rotation.y = side * Math.PI * 0.5
  group.add(m)
  return m
}

export interface LungsWorld extends World {
  cartilageRings: THREE.Mesh[]
  branchingPorts: THREE.Mesh[]
  phase: number
}

export function createLungsWorld (S: THREE.Scene): LungsWorld {
  const group = new THREE.Group()
  S.add(group)

  // ── Airway tunnel ────────────────────────────────────────────────────────
  const tg = new THREE.CylinderGeometry(9.5, 9.5, 220, 32, 28, true)
  tg.rotateX(Math.PI / 2)
  const tp = tg.attributes.position
  for (let i = 0; i < tp.count; i++) {
    const nz = tp.getZ(i)
    const wave = Math.sin(nz * 0.22 + i * 0.4) * 0.35
    tp.setX(i, tp.getX(i) * (1 + wave * 0.04))
    tp.setY(i, tp.getY(i) * (1 + wave * 0.04))
  }
  tp.needsUpdate = true

  const tex = lungsTexture()
  const tunnel = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(0x002848),
      emissiveIntensity: 1.2,
      side: THREE.BackSide,
      roughness: 0.55
    })
  )
  tunnel.position.set(0, 2, -90)
  group.add(tunnel)

  // ── Floor — deep navy blue ───────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 220),
    new THREE.MeshStandardMaterial({
      color: 0x050d1a,
      emissive: 0x081428,
      transparent: true,
      opacity: 0.88
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -90)
  group.add(floor)

  // ── Lane edges — bright cyan-blue neon ────────────────────────────────────
  const edgeM = new THREE.MeshBasicMaterial({ color: 0x00aaff })
  ;[-3.5, 3.5].forEach(x => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 220), edgeM)
    e.position.set(x, 0.05, -90)
    group.add(e)
  })

  // ── Lane dashes — sky blue ───────────────────────────────────────────────
  const dg = new THREE.BoxGeometry(0.06, 0.02, 1.6)
  const dm = new THREE.MeshBasicMaterial({ color: 0x44ccff })
  const dashes: THREE.Mesh[] = []
  ;[-1, 1].forEach(x => {
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(dg, dm)
      d.position.set(x, 0.03, -i * 7)
      group.add(d)
      dashes.push(d)
    }
  })

  // ── C-shaped Cartilage Rings (trachea/bronchi arches) ─────────────────────
  const cartilageRings: THREE.Mesh[] = []
  for (let z = -8; z > -210; z -= 14) {
    cartilageRings.push(makeCartilageRing(group, z))
  }

  // ── Bronchial branch ports along walls ───────────────────────────────────
  const branchingPorts: THREE.Mesh[] = []
  for (let z = -20; z > -200; z -= 28) {
    branchingPorts.push(makeBranchingPort(group, z, -1))
    branchingPorts.push(makeBranchingPort(group, z - 8, 1))
  }

  // ── Alveolar sacs — translucent clusters along the periphery ─────────────
  const alveolarGeo = new THREE.SphereGeometry(0.35, 10, 8)
  const alveolarMat = new THREE.MeshStandardMaterial({
    color: 0x88ddff,
    emissive: 0x004466,
    transparent: true,
    opacity: 0.55,
    roughness: 0.3
  })
  const rbcs: THREE.Mesh[] = []
  for (let i = 0; i < 55; i++) {
    const m = new THREE.Mesh(alveolarGeo, alveolarMat)
    placeLungsParticle(m, -Math.random() * 130)
    group.add(m)
    rbcs.push(m)
  }

  // ── Particles — pale cyan oxygen micro-bubbles ───────────────────────────
  const points = new THREE.BufferGeometry()
  const pa = new Float32Array(LUNGS_POINT_COUNT * 3)
  for (let i = 0; i < LUNGS_POINT_COUNT; i++) {
    pa[i * 3]     = (Math.random() - 0.5) * 17
    pa[i * 3 + 1] = Math.random() * 9
    pa[i * 3 + 2] = -Math.random() * 130
  }
  points.setAttribute('position', new THREE.BufferAttribute(pa, 3))
  const pointsMesh = new THREE.Points(
    points,
    new THREE.PointsMaterial({
      color: 0xaaeeff,
      size: 0.1,
      transparent: true,
      opacity: 0.7
    })
  )
  group.add(pointsMesh)

  // ── Idle platform — teal ring ────────────────────────────────────────────
  const plat = new THREE.Group()
  plat.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.05, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x00aaff })
    ),
    new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 40),
      new THREE.MeshBasicMaterial({
        color: 0x00aaff,
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
  }

  return {
    group,
    tunnel,
    tex,
    dashes,
    rbcs,
    points,
    pa,
    plat,
    cartilageRings,
    branchingPorts,
    phase: 0,
    dispose
  }
}
