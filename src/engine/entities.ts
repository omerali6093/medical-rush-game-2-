import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { BrandAssets } from './brand'

export type EntType = 'virus' | 'bact' | 'pill' | 'shield' | 'x2'

// ─── Geometry / material cache (shared across all entity instances) ──────────
const G = {
  vi:   new THREE.IcosahedronGeometry(0.55, 0),
  sp:   new THREE.IcosahedronGeometry(0.85, 0),
  cy:   new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10),
  sph:  new THREE.SphereGeometry(0.28, 10, 8),
  pill: new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10),
  oct:  new THREE.OctahedronGeometry(0.45),
  sh:   new THREE.SphereGeometry(0.5, 12, 10),
  coin: new THREE.CylinderGeometry(0.34, 0.34, 0.1, 28)
}
const std = (color: number, emissive: number, flat = false) =>
  new THREE.MeshStandardMaterial({ color, emissive, flatShading: flat })

// ─── GLB model cache ─────────────────────────────────────────────────────────
// Each model is loaded once and re-cloned for every entity instance.
// While loading, the fallback procedural mesh is shown; it is swapped out
// silently once the GLB arrives.

interface GlbEntry {
  scene: THREE.Group | null
  promise: Promise<THREE.Group> | null
}

const glbCache: Record<'virus' | 'bact', GlbEntry> = {
  virus: { scene: null, promise: null },
  bact:  { scene: null, promise: null }
}

/** Target bounding-box sizes in game units — visible, not tiny. */
const TARGET: Record<'virus' | 'bact', number> = {
  virus: 1.8,   // big enough to clearly see in the tunnel (old wireframe was ~1.7 diam)
  bact:  1.6    // bacteria capsule — visible at speed
}

function prepareGlb (src: THREE.Group, target: number): THREE.Group {
  const box  = new THREE.Box3().setFromObject(src)
  const size = box.getSize(new THREE.Vector3())
  const max  = Math.max(size.x, size.y, size.z, 0.001)
  src.scale.multiplyScalar(target / max)

  // Preserve all original GLB colours (albedo map, color, existing emissive).
  // Only intervene to ensure visibility in dark tunnel scenes — never overwrite
  // anything that would change the perceived hue.
  src.traverse(n => {
    const mesh = n as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.frustumCulled = false
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mats.forEach(mat => {
      const sm = mat as THREE.MeshStandardMaterial
      if (!sm.isMeshStandardMaterial) return

      // Clamp metalness — pure-metal materials go black in low-light tunnels
      sm.metalness = Math.min(sm.metalness ?? 1, 0.3)
      sm.roughness = Math.min(Math.max(sm.roughness ?? 0.5, 0.3), 0.85)

      // Add a subtle self-glow ONLY if the GLB has no emissive of its own.
      // Use the albedo map if present, otherwise the base color.
      // Keep intensity low (0.25) so it just lifts shadows — not overwrites colour.
      const hasEmissive = sm.emissive && sm.emissive.getHex() !== 0x000000
      if (!hasEmissive) {
        if (sm.map) {
          // Texture-based albedo: set emissiveMap = albedo map at low intensity
          sm.emissiveMap = sm.map
          sm.emissive.set(0xffffff)
          sm.emissiveIntensity = 0.25
        } else {
          // Solid-color albedo: use the color directly
          sm.emissive.copy(sm.color)
          sm.emissiveIntensity = 0.25
        }
      }

      sm.needsUpdate = true
    })
  })
  return src
}

function cloneGlb (src: THREE.Group): THREE.Group {
  const c = src.clone(true)
  c.traverse(n => {
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    const list = Array.isArray(m.material) ? m.material : [m.material]
    m.material  = Array.isArray(m.material)
      ? list.map(mat => mat.clone())
      : list[0].clone()
  })
  return c
}

function loadGlb (key: 'virus' | 'bact'): Promise<THREE.Group> {
  const entry = glbCache[key]
  if (entry.promise) return entry.promise
  const url = `${import.meta.env.BASE_URL}models/${key === 'virus' ? 'virus' : 'bacteria'}.glb`
  entry.promise = new Promise<THREE.Group>((resolve, reject) => {
    new GLTFLoader().load(
      url,
      gltf => {
        const src = prepareGlb(gltf.scene, TARGET[key])
        entry.scene = src
        resolve(src)
      },
      undefined,
      reject
    )
  })
  return entry.promise
}

// Kick off both loads immediately so they're ready as soon as possible
loadGlb('virus').catch(() => { /* fallback stays */ })
loadGlb('bact').catch(() => { /* fallback stays */ })

// ─── Entity factory ──────────────────────────────────────────────────────────

export function createEntity (
  t: EntType,
  brand: BrandAssets | null = null
): THREE.Group {
  const g = new THREE.Group()

  if (t === 'virus') {
    if (glbCache.virus.scene) {
      // GLB already loaded — use it immediately
      const model = cloneGlb(glbCache.virus.scene)
      g.add(model)
    } else {
      // Fallback procedural virus while GLB loads
      g.add(
        new THREE.Mesh(G.vi, std(0x9bff3d, 0x2a6600, true)),
        new THREE.Mesh(G.sp, new THREE.MeshBasicMaterial({ color: 0xb04dff, wireframe: true }))
      )
      // Swap to GLB once loaded
      glbCache.virus.promise?.then(src => {
        // Remove fallback children
        while (g.children.length) g.remove(g.children[0])
        g.add(cloneGlb(src))
      }).catch(() => { /* keep fallback */ })
    }
    g.position.y = 0.7

  } else if (t === 'bact') {
    if (glbCache.bact.scene) {
      const model = cloneGlb(glbCache.bact.scene)
      g.add(model)
    } else {
      // Fallback procedural bacteria
      const m = std(0xb04dff, 0x35106a)
      const c = new THREE.Mesh(G.cy, m)
      c.rotation.z = Math.PI / 2
      const a = new THREE.Mesh(G.sph, m), b = a.clone()
      a.position.x =  0.45
      b.position.x = -0.45
      g.add(c, a, b)
      // Swap to GLB once loaded
      glbCache.bact.promise?.then(src => {
        while (g.children.length) g.remove(g.children[0])
        g.add(cloneGlb(src))
      }).catch(() => { /* keep fallback */ })
    }
    g.position.y = 1.7

  } else if (t === 'pill' && brand) {
    const coin = new THREE.Mesh(G.coin, [brand.sideMat, brand.capMat, brand.capMat])
    coin.rotation.x = Math.PI / 2
    g.add(coin)
    g.position.y = 0.95

  } else if (t === 'pill') {
    const a = new THREE.Mesh(G.pill, std(0x22e4ff, 0x0a6a88))
    const b = new THREE.Mesh(G.pill, std(0xffffff, 0x333344))
    a.position.y =  0.15
    b.position.y = -0.15
    g.add(a, b)
    g.rotation.z = 0.6
    g.position.y = 0.9

  } else if (t === 'shield') {
    g.add(
      new THREE.Mesh(G.sh,  new THREE.MeshBasicMaterial({ color: 0x3b82ff, wireframe: true })),
      new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0x22e4ff }))
    )
    g.position.y = 1

  } else {
    g.add(new THREE.Mesh(G.oct, std(0xffd24d, 0x886600)))
    g.position.y = 1
  }

  return g
}
