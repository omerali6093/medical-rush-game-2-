import * as THREE from 'three'
import type { World } from './world'

export const LUNGS_POINT_COUNT = 350

/** Blue-teal bronchial airway texture */
function lungsTexture () {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  // Deep blue base
  g.fillStyle = '#091828'
  g.fillRect(0, 0, 256, 256)
  // Cartilage ring highlights — horizontal bands
  for (let i = 0; i < 18; i++) {
    const y = (i / 18) * 256
    const gr = g.createLinearGradient(0, y - 4, 0, y + 4)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(0.5, `rgba(30,120,200,${0.1 + Math.random() * 0.15})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, y - 4, 256, 8)
  }
  // Mucus membrane shimmer blobs
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 3 + Math.random() * 16
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, Math.random() < 0.5 ? 'rgba(0,160,255,.18)' : 'rgba(0,40,80,.25)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 26)
  tex.anisotropy = 4
  return tex
}

/** Place air bubbles / alveolar sacs around the tunnel */
function placeAlveolus (m: THREE.Mesh, z: number) {
  const a = Math.random() * Math.PI * 2
  const r = 5.0 + Math.random() * 3.2
  m.position.set(Math.cos(a) * r, 1.8 + Math.sin(a) * r * 0.8, z)
  m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
}

export function createLungsWorld (S: THREE.Scene): World {
  // Slightly wider, rounder tunnel — bronchial airway feel
  const tg = new THREE.CylinderGeometry(9.5, 9.5, 220, 30, 24, true)
  tg.rotateX(Math.PI / 2)
  const tp = tg.attributes.position
  for (let i = 0; i < tp.count; i++) {
    // Gentle cartilage-ring ripple
    const nz = tp.getZ(i)
    const wave = Math.sin(nz * 0.22 + i * 0.4) * 0.3
    tp.setX(i, tp.getX(i) * (1 + wave * 0.04))
    tp.setY(i, tp.getY(i) * (1 + wave * 0.04))
  }
  tp.needsUpdate = true

  const tex = lungsTexture()
  const tunnel = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0x003050,
      emissiveIntensity: 1.2,
      side: THREE.BackSide,
      roughness: 0.5
    })
  )
  tunnel.position.set(0, 2, -90)
  S.add(tunnel)

  // Floor — deep navy
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 220),
    new THREE.MeshStandardMaterial({
      color: 0x050d1a,
      emissive: 0x081428,
      transparent: true,
      opacity: 0.88
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -90)
  S.add(floor)

  // Lane edges — bright cyan-blue neon
  const edgeM = new THREE.MeshBasicMaterial({ color: 0x00aaff })
  ;[-3.5, 3.5].forEach(x => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 220), edgeM)
    e.position.set(x, 0.05, -90)
    S.add(e)
  })

  // Lane dashes — sky blue
  const dg = new THREE.BoxGeometry(0.06, 0.02, 1.6)
  const dm = new THREE.MeshBasicMaterial({ color: 0x44ccff })
  const dashes: THREE.Mesh[] = []
  ;[-1, 1].forEach(x => {
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(dg, dm)
      d.position.set(x, 0.03, -i * 7)
      S.add(d)
      dashes.push(d)
    }
  })

  // Alveolar sacs — small translucent spheres floating in the airway
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
    placeAlveolus(m, -Math.random() * 130)
    S.add(m)
    rbcs.push(m)
  }

  // Particles — pale white/blue oxygen molecules
  const points = new THREE.BufferGeometry()
  const pa = new Float32Array(LUNGS_POINT_COUNT * 3)
  for (let i = 0; i < LUNGS_POINT_COUNT; i++) {
    pa[i * 3] = (Math.random() - 0.5) * 17
    pa[i * 3 + 1] = Math.random() * 9
    pa[i * 3 + 2] = -Math.random() * 130
  }
  points.setAttribute('position', new THREE.BufferAttribute(pa, 3))
  S.add(
    new THREE.Points(
      points,
      new THREE.PointsMaterial({
        color: 0xaaeeff,
        size: 0.1,
        transparent: true,
        opacity: 0.7
      })
    )
  )

  // Idle platform — teal ring
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
  S.add(plat)

  return { tunnel, tex, dashes, rbcs, points, pa, plat }
}

export { placeAlveolus as placeLungsParticle }
