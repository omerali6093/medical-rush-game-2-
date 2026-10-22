import * as THREE from 'three'
interface P {
  m: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  v: THREE.Vector3
  life: number
}

export class Bursts {
  private pool: P[] = []
  private i = 0
  constructor (S: THREE.Scene, n = 70) {
    const g = new THREE.SphereGeometry(0.07, 6, 5)
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
      )
      m.visible = false
      S.add(m)
      this.pool.push({ m, v: new THREE.Vector3(), life: 0 })
    }
  }
  emit (pos: THREE.Vector3, color: number, n = 10) {
    for (let k = 0; k < n; k++) {
      const b = this.pool[this.i++ % this.pool.length]
      b.m.position.copy(pos)
      b.m.material.color.set(color)
      b.m.visible = true
      b.life = 0.6
      b.v.set(
        (Math.random() - 0.5) * 6,
        Math.random() * 5,
        (Math.random() - 0.2) * 6
      )
    }
  }
  update (dt: number, dz: number) {
    for (const b of this.pool)
      if (b.life > 0) {
        b.life -= dt
        b.m.position.addScaledVector(b.v, dt)
        b.m.position.z += dz
        b.v.y -= 9 * dt
        b.m.material.opacity = Math.max(0, b.life / 0.6)
        if (b.life <= 0) b.m.visible = false
      }
  }
}
