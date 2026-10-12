import * as THREE from 'three'

export interface World {
  tunnel: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  tex: THREE.CanvasTexture
  dashes: THREE.Mesh[]
  rbcs: THREE.Mesh[]
  points: THREE.BufferGeometry
  pa: Float32Array
  plat: THREE.Group
}
export const POINT_COUNT = 350

export function placeRbc (m: THREE.Mesh, z: number) {
  const a = Math.random() * Math.PI * 2,
    r = 4.8 + Math.random() * 3.5
  m.position.set(Math.cos(a) * r, 2 + Math.sin(a) * r * 0.9, z)
  m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
}

function veinTexture () {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g2 = c.getContext('2d')!
  g2.fillStyle = '#8a1428'
  g2.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 280; i++) {
    const x = Math.random() * 256,
      y = Math.random() * 256,
      q = 6 + Math.random() * 28,
      g = g2.createRadialGradient(x, y, 0, x, y, q)
    g.addColorStop(
      0,
      Math.random() < 0.5 ? 'rgba(40,0,10,.5)' : 'rgba(255,90,110,.3)'
    )
    g.addColorStop(1, 'rgba(0,0,0,0)')
    g2.fillStyle = g
    g2.fillRect(x - q, y - q, q * 2, q * 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 26)
  tex.anisotropy = 4
  return tex
}

export function createWorld (S: THREE.Scene): World {
  const tg = new THREE.CylinderGeometry(9, 9, 220, 28, 24, true)
  tg.rotateX(Math.PI / 2)
  const tp = tg.attributes.position
  for (let i = 0; i < tp.count; i++) {
    const n = Math.sin(i * 0.7) * 0.35
    tp.setX(i, tp.getX(i) * (1 + n * 0.04))
    tp.setY(i, tp.getY(i) * (1 + n * 0.04))
  }
  const tex = veinTexture()
  const tunnel = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0x3a0610,
      side: THREE.BackSide,
      roughness: 0.55
    })
  )
  tunnel.position.set(0, 2, -90)
  S.add(tunnel)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 220),
    new THREE.MeshStandardMaterial({
      color: 0x1a0a22,
      emissive: 0x240a33,
      transparent: true,
      opacity: 0.85
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -90)
  S.add(floor)
  const edgeM = new THREE.MeshBasicMaterial({ color: 0x22e4ff })
  ;[-3.5, 3.5].forEach(x => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 220), edgeM)
    e.position.set(x, 0.05, -90)
    S.add(e)
  })

  const dg = new THREE.BoxGeometry(0.06, 0.02, 1.6),
    dm = new THREE.MeshBasicMaterial({ color: 0x5ad8ff }),
    dashes: THREE.Mesh[] = []
  ;[-1, 1].forEach(x => {
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(dg, dm)
      d.position.set(x, 0.03, -i * 7)
      S.add(d)
      dashes.push(d)
    }
  })

  const rg = new THREE.TorusGeometry(0.7, 0.35, 10, 20),
    rm = new THREE.MeshStandardMaterial({
      color: 0xe0203c,
      emissive: 0x550012,
      roughness: 0.4
    }),
    rbcs: THREE.Mesh[] = []
  for (let i = 0; i < 55; i++) {
    const m = new THREE.Mesh(rg, rm)
    m.scale.z = 0.5
    placeRbc(m, -Math.random() * 130)
    S.add(m)
    rbcs.push(m)
  }

  const points = new THREE.BufferGeometry(),
    pa = new Float32Array(POINT_COUNT * 3)
  for (let i = 0; i < POINT_COUNT; i++) {
    pa[i * 3] = (Math.random() - 0.5) * 16
    pa[i * 3 + 1] = Math.random() * 9
    pa[i * 3 + 2] = -Math.random() * 130
  }
  points.setAttribute('position', new THREE.BufferAttribute(pa, 3))
  S.add(
    new THREE.Points(
      points,
      new THREE.PointsMaterial({
        color: 0xff9ab5,
        size: 0.12,
        transparent: true,
        opacity: 0.8
      })
    )
  )

  const plat = new THREE.Group()
  plat.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.05, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x22e4ff })
    ),
    new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 40),
      new THREE.MeshBasicMaterial({
        color: 0x22e4ff,
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
