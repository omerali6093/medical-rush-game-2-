import * as THREE from 'three'
import type { World } from './world'

export const HEART_POINT_COUNT = 350

/** Crimson muscle-fibre texture for the heart chamber walls */
function heartTexture () {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  // Deep crimson base
  g.fillStyle = '#4a0010'
  g.fillRect(0, 0, 256, 256)
  // Muscle fibre streaks — diagonal lines
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const len = 20 + Math.random() * 60
    const angle = -0.4 + Math.random() * 0.8
    g.strokeStyle = `rgba(${180 + Math.random() * 60 | 0},0,${20 + Math.random() * 30 | 0},${0.25 + Math.random() * 0.35})`
    g.lineWidth = 1 + Math.random() * 2.5
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    g.stroke()
  }
  // Highlight blobs (glistening myocardium)
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 3 + Math.random() * 14
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, Math.random() < 0.5 ? 'rgba(255,40,80,.22)' : 'rgba(80,0,20,.3)')
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

/** Floating platelet-like discs inside the chamber */
function placePlatelet (m: THREE.Mesh, z: number) {
  const a = Math.random() * Math.PI * 2
  const r = 4.5 + Math.random() * 3.8
  m.position.set(Math.cos(a) * r, 1.5 + Math.sin(a) * r * 0.85, z)
  m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
}

export function createHeartWorld (S: THREE.Scene): World {
  // Tunnel — tighter, more pulsing shape
  const tg = new THREE.CylinderGeometry(8.5, 8.5, 220, 32, 28, true)
  tg.rotateX(Math.PI / 2)
  const tp = tg.attributes.position
  for (let i = 0; i < tp.count; i++) {
    // Heart-shaped cross-section distortion
    const nx = tp.getX(i)
    const ny = tp.getY(i)
    const nz = tp.getZ(i)
    const wave = Math.sin(nz * 0.18 + i * 0.5) * 0.45
    tp.setX(i, nx * (1 + wave * 0.06))
    tp.setY(i, ny * (1 + wave * 0.06))
  }
  tp.needsUpdate = true

  const tex = heartTexture()
  const tunnel = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0x4a0010,
      emissiveIntensity: 1.4,
      side: THREE.BackSide,
      roughness: 0.6
    })
  )
  tunnel.position.set(0, 2, -90)
  S.add(tunnel)

  // Floor — dark red
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 220),
    new THREE.MeshStandardMaterial({
      color: 0x1a0008,
      emissive: 0x2a0010,
      transparent: true,
      opacity: 0.88
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -90)
  S.add(floor)

  // Lane edges — warm red-pink neon
  const edgeM = new THREE.MeshBasicMaterial({ color: 0xff2255 })
  ;[-3.5, 3.5].forEach(x => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 220), edgeM)
    e.position.set(x, 0.05, -90)
    S.add(e)
  })

  // Lane dashes — warm pink
  const dg = new THREE.BoxGeometry(0.06, 0.02, 1.6)
  const dm = new THREE.MeshBasicMaterial({ color: 0xff6688 })
  const dashes: THREE.Mesh[] = []
  ;[-1, 1].forEach(x => {
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(dg, dm)
      d.position.set(x, 0.03, -i * 7)
      S.add(d)
      dashes.push(d)
    }
  })

  // Platelets — small golden discs floating in the chamber
  const plateletGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16)
  const plateletMat = new THREE.MeshStandardMaterial({
    color: 0xffcc44,
    emissive: 0x553300,
    roughness: 0.5
  })
  const rbcs: THREE.Mesh[] = []
  for (let i = 0; i < 55; i++) {
    const m = new THREE.Mesh(plateletGeo, plateletMat)
    placePlatelet(m, -Math.random() * 130)
    S.add(m)
    rbcs.push(m)
  }

  // Particles — deep red blood cells streaming through
  const points = new THREE.BufferGeometry()
  const pa = new Float32Array(HEART_POINT_COUNT * 3)
  for (let i = 0; i < HEART_POINT_COUNT; i++) {
    pa[i * 3] = (Math.random() - 0.5) * 15
    pa[i * 3 + 1] = Math.random() * 9
    pa[i * 3 + 2] = -Math.random() * 130
  }
  points.setAttribute('position', new THREE.BufferAttribute(pa, 3))
  S.add(
    new THREE.Points(
      points,
      new THREE.PointsMaterial({
        color: 0xff4466,
        size: 0.14,
        transparent: true,
        opacity: 0.75
      })
    )
  )

  // Idle platform
  const plat = new THREE.Group()
  plat.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.05, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xff2255 })
    ),
    new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff2255,
        transparent: true,
        opacity: 0.15
      })
    )
  )
  plat.rotation.x = -Math.PI / 2
  plat.position.y = 0.06
  S.add(plat)

  return { tunnel, tex, dashes, rbcs, points, pa, plat }
}

export { placePlatelet as placeHeartParticle }
