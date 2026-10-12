import * as THREE from 'three'
import type { BrandAssets } from './brand'
export type EntType = 'virus' | 'bact' | 'pill' | 'shield' | 'x2'

const G = {
  vi: new THREE.IcosahedronGeometry(0.55, 0),
  sp: new THREE.IcosahedronGeometry(0.85, 0),
  cy: new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10),
  sph: new THREE.SphereGeometry(0.28, 10, 8),
  pill: new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10),
  oct: new THREE.OctahedronGeometry(0.45),
  sh: new THREE.SphereGeometry(0.5, 12, 10),
  coin: new THREE.CylinderGeometry(0.34, 0.34, 0.1, 28)
}
const std = (color: number, emissive: number, flat = false) =>
  new THREE.MeshStandardMaterial({ color, emissive, flatShading: flat })

export function createEntity (
  t: EntType,
  brand: BrandAssets | null = null
): THREE.Group {
  const g = new THREE.Group()
  if (t === 'virus') {
    g.add(
      new THREE.Mesh(G.vi, std(0x9bff3d, 0x2a6600, true)),
      new THREE.Mesh(
        G.sp,
        new THREE.MeshBasicMaterial({ color: 0xb04dff, wireframe: true })
      )
    )
    g.position.y = 0.7
  } else if (t === 'bact') {
    const m = std(0xb04dff, 0x35106a),
      c = new THREE.Mesh(G.cy, m)
    c.rotation.z = Math.PI / 2
    const a = new THREE.Mesh(G.sph, m),
      b = a.clone()
    a.position.x = 0.45
    b.position.x = -0.45
    g.add(c, a, b)
    g.position.y = 1.7
  } else if (t === 'pill' && brand) {
    const coin = new THREE.Mesh(G.coin, [
      brand.sideMat,
      brand.capMat,
      brand.capMat
    ])
    coin.rotation.x = Math.PI / 2
    g.add(coin)
    g.position.y = 0.95
  } else if (t === 'pill') {
    const a = new THREE.Mesh(G.pill, std(0x22e4ff, 0x0a6a88)),
      b = new THREE.Mesh(G.pill, std(0xffffff, 0x333344))
    a.position.y = 0.15
    b.position.y = -0.15
    g.add(a, b)
    g.rotation.z = 0.6
    g.position.y = 0.9
  } else if (t === 'shield') {
    g.add(
      new THREE.Mesh(
        G.sh,
        new THREE.MeshBasicMaterial({ color: 0x3b82ff, wireframe: true })
      ),
      new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0x22e4ff }))
    )
    g.position.y = 1
  } else {
    g.add(new THREE.Mesh(G.oct, std(0xffd24d, 0x886600)))
    g.position.y = 1
  }
  return g
}
