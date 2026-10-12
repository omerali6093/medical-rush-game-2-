import * as THREE from 'three'
import type { Skin } from '../types'

const mat = (c: number, e = 0) =>
  new THREE.MeshStandardMaterial({ color: c, emissive: e, roughness: 0.5 })
export interface Doctor {
  group: THREE.Group
  body: THREE.Mesh
  band: THREE.Mesh
  cap: THREE.Mesh
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  aura: THREE.Mesh
  shadow: THREE.Mesh
}

export function createDoctor (S: THREE.Scene): Doctor {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.4, 0.95, 14),
    mat(0xf2fbff, 0x112233)
  )
  body.position.y = 1.15
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.41, 0.41, 0.1, 14),
    mat(0x22e4ff, 0x0a6a88)
  )
  band.position.y = 0.8
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 18, 14),
    mat(0xf0c8a0)
  )
  head.position.y = 1.95
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0x22e4ff, 0x0a6a88)
  )
  cap.position.y = 2
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.1, 0.1),
    mat(0x22e4ff, 0x22e4ff)
  )
  visor.position.set(0, 1.97, -0.26)
  const cross = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.08, 0.02),
    mat(0xff3d6e, 0x880022)
  )
  cross.position.set(0, 1.35, -0.37)
  const cross2 = cross.clone()
  cross2.rotation.z = Math.PI / 2
  const limb = (x: number, y: number, l: number, c: number) => {
    const g = new THREE.Group()
    g.position.set(x, y, 0)
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, l, 0.16), mat(c))
    m.position.y = -l / 2
    g.add(m)
    group.add(g)
    return g
  }
  const legL = limb(-0.18, 0.75, 0.75, 0x1a3a6a),
    legR = limb(0.18, 0.75, 0.75, 0x1a3a6a)
  const armL = limb(-0.45, 1.5, 0.7, 0xf2fbff),
    armR = limb(0.45, 1.5, 0.7, 0xf2fbff)
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0x3b82ff,
      transparent: true,
      opacity: 0.25,
      wireframe: true
    })
  )
  aura.position.y = 1.1
  aura.visible = false
  group.add(body, band, head, cap, visor, cross, cross2, aura)
  S.add(group)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.5 })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.04
  S.add(shadow)
  return { group, body, band, cap, legL, legR, armL, armR, aura, shadow }
}

export function applySkin (d: Doctor, s: Skin) {
  ;(d.body.material as THREE.MeshStandardMaterial).color.set(s.coat)
  ;[d.armL, d.armR].forEach(a =>
    (
      (a.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
    ).color.set(s.coat)
  )
  ;(d.band.material as THREE.MeshStandardMaterial).color.set(s.accent)
  ;(d.cap.material as THREE.MeshStandardMaterial).color.set(s.accent)
}
