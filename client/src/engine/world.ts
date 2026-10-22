import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface World {
  group: THREE.Group
  tunnel: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  tex: THREE.CanvasTexture
  dashes: THREE.Mesh[]
  rbcs: THREE.Object3D[]
  points: THREE.BufferGeometry
  pa: Float32Array
  plat: THREE.Group
  dispose: () => void
}
export const POINT_COUNT = 350

export function placeRbc (m: THREE.Object3D, z: number) {
  const a = Math.random() * Math.PI * 2,
    r = 4.8 + Math.random() * 3.5
  m.position.set(Math.cos(a) * r, 2 + Math.sin(a) * r * 0.9, z)
  m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
}

// ─── Seeded pseudo-random (deterministic so textures are stable) ────────────
function seededRng (seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

// ─── Albedo: arterial wall — smooth base with readable tissue detail ─────────
function buildAlbedoMap (W = 512, H = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(42)

  // ── Base gradient — warm arterial red, richer at centre ──────────────────
  const base = g.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0.0, '#9e1a28')
  base.addColorStop(0.4, '#c02535')
  base.addColorStop(0.7, '#b02030')
  base.addColorStop(1.0, '#8a1520')
  g.fillStyle = base
  g.fillRect(0, 0, W, H)

  // ── Smooth-muscle longitudinal bands — 10 soft vertical streaks ──────────
  // These mimic the tunica media layer visible in real vessel cross-sections.
  for (let i = 0; i < 10; i++) {
    const x = (i / 10) * W + rng() * (W / 12)
    const bw = 18 + rng() * 28
    const bright = rng() > 0.5   // alternate light/dark bands
    const col = bright
      ? `rgba(200,55,65,${0.18 + rng()*0.14})`
      : `rgba(60,0,5,${0.14 + rng()*0.12})`
    const grad = g.createLinearGradient(x - bw, 0, x + bw, 0)
    grad.addColorStop(0,   'rgba(0,0,0,0)')
    grad.addColorStop(0.5, col)
    grad.addColorStop(1,   'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(x - bw, 0, bw * 2, H)
  }

  // ── Capillary network — 40 branching threads, visible but not harsh ───────
  for (let i = 0; i < 40; i++) {
    let cx = rng() * W, cy = rng() * H
    const alpha = 0.18 + rng() * 0.22   // 0.18–0.40: visible yet soft
    const bright = Math.floor(200 + rng() * 50)
    g.strokeStyle = `rgba(${bright},${Math.floor(30+rng()*25)},${Math.floor(25+rng()*20)},${alpha})`
    g.lineWidth = 0.8 + rng() * 1.4
    g.beginPath(); g.moveTo(cx, cy)
    for (let s = 0; s < 4; s++) {
      cx += (rng() - 0.5) * 55; cy += (rng() - 0.5) * 55
      g.lineTo(cx, cy)
    }
    g.stroke()
  }

  // ── Wet membrane patches — 30 soft elliptical highlights ─────────────────
  // Low opacity so they add sheen without forming visible blobs.
  for (let i = 0; i < 30; i++) {
    const x = rng() * W, y = rng() * H
    const rx = 12 + rng() * 40, ry = 8 + rng() * 28
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry))
    gr.addColorStop(0,   `rgba(220,55,65,${0.10 + rng()*0.12})`)
    gr.addColorStop(1,   'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.save(); g.translate(x, y)
    g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry))
    g.beginPath(); g.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2)
    g.fill(); g.restore()
  }

  // ── Gentle shadow grooves — 8 soft dark pools for depth ──────────────────
  for (let i = 0; i < 8; i++) {
    const x = rng() * W, y = rng() * H, r = 30 + rng() * 70
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(0,0,0,${0.10 + rng()*0.12})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 10)    // 10× vertical keeps detail visible without chaos
  t.anisotropy = 16
  return t
}

// ─── Normal map: ring bumps + light vertical ridges ─────────────────────────
function buildNormalMap (W = 256, H = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(77)

  // Flat baseline
  g.fillStyle = 'rgb(128,128,255)'
  g.fillRect(0, 0, W, H)

  // Horizontal ring-like bumps — 12, moderate strength
  for (let i = 0; i < 12; i++) {
    const y = rng() * H
    const h = 5 + rng() * 12
    const up   = g.createLinearGradient(0, y - h, 0, y)
    up.addColorStop(0, 'rgba(128,128,0,0)')
    up.addColorStop(1, `rgba(128,${Math.floor(75+rng()*35)},0,0.4)`)
    g.fillStyle = up; g.fillRect(0, y - h, W, h)
    const dn   = g.createLinearGradient(0, y, 0, y + h)
    dn.addColorStop(0, `rgba(128,${Math.floor(158+rng()*35)},0,0.4)`)
    dn.addColorStop(1, 'rgba(128,128,0,0)')
    g.fillStyle = dn; g.fillRect(0, y, W, h)
  }

  // Vertical vessel ridges — 6, gentle
  for (let i = 0; i < 6; i++) {
    const x = rng() * W, w = 5 + rng() * 14
    const left  = g.createLinearGradient(x - w, 0, x, 0)
    left.addColorStop(0, 'rgba(128,128,0,0)')
    left.addColorStop(1, `rgba(${Math.floor(88+rng()*30)},128,0,0.35)`)
    g.fillStyle = left; g.fillRect(x - w, 0, w, H)
    const right = g.createLinearGradient(x, 0, x + w, 0)
    right.addColorStop(0, `rgba(${Math.floor(165+rng()*30)},128,0,0.35)`)
    right.addColorStop(1, 'rgba(128,128,0,0)')
    g.fillStyle = right; g.fillRect(x, 0, w, H)
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 10)
  t.anisotropy = 4
  return t
}

// ─── Roughness map: wet glossy spots + subtle dry ridges ─────────────────────
function buildRoughnessMap (W = 256, H = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(13)

  // Medium base roughness
  g.fillStyle = 'rgb(145,145,145)'
  g.fillRect(0, 0, W, H)

  // Wet plasma patches — smooth (dark = low roughness)
  for (let i = 0; i < 22; i++) {
    const x = rng() * W, y = rng() * H, r = 12 + rng() * 45
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(30,30,30,${0.35 + rng()*0.3})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }

  // Dry fibrous ridges — rough (light = high roughness)
  for (let i = 0; i < 8; i++) {
    const x = rng() * W, w = 3 + rng() * 10
    const gr = g.createLinearGradient(x, 0, x + w, 0)
    gr.addColorStop(0,   'rgba(0,0,0,0)')
    gr.addColorStop(0.5, `rgba(195,195,195,${0.3 + rng()*0.3})`)
    gr.addColorStop(1,   'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(x, 0, w, H)
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 10)
  return t
}

// ─── Emissive map: glowing capillaries — atmospheric glow, not overwhelming ──
function buildEmissiveMap (W = 256, H = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(99)

  g.fillStyle = 'rgb(0,0,0)'
  g.fillRect(0, 0, W, H)

  // Glowing capillary threads — 28, moderate opacity
  for (let i = 0; i < 28; i++) {
    let cx = rng() * W, cy = rng() * H
    const alpha = 0.20 + rng() * 0.28
    g.strokeStyle = `rgba(215,25,35,${alpha})`
    g.lineWidth = 1 + rng() * 2.2
    g.beginPath(); g.moveTo(cx, cy)
    for (let s = 0; s < 4; s++) {
      cx += (rng() - 0.5) * 45; cy += (rng() - 0.5) * 45
      g.lineTo(cx, cy)
    }
    g.stroke()
  }

  // Warm junction nodes — 18, soft radius
  for (let i = 0; i < 18; i++) {
    const x = rng() * W, y = rng() * H, r = 4 + rng() * 16
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(210,20,30,${0.22 + rng()*0.20})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 10)
  return t
}

export function createWorld (S: THREE.Scene): World {
  const group = new THREE.Group()
  S.add(group)

  // ── Tunnel geometry — higher segments for smoother organic walls ──────────
  // More radial (40) and height (48) segments + organic noise deformation
  const tg = new THREE.CylinderGeometry(9, 9, 220, 40, 48, true)
  tg.rotateX(Math.PI / 2)
  const tp = tg.attributes.position
  const rng = seededRng(7)
  for (let i = 0; i < tp.count; i++) {
    const z = tp.getZ(i)
    const theta = Math.atan2(tp.getY(i), tp.getX(i))
    // Low-frequency radial pulse (artery contraction ripple)
    const pulse  = Math.sin(z * 0.18 + theta * 1.5) * 0.28
    // Mid-frequency vessel ridge bumps
    const ridge  = Math.sin(z * 0.55 + theta * 4.0) * 0.12
    // High-frequency micro-texture noise
    const noise  = (rng() - 0.5) * 0.18
    const disp = 1 + (pulse + ridge + noise) * 0.055
    tp.setX(i, tp.getX(i) * disp)
    tp.setY(i, tp.getY(i) * disp)
  }
  tp.needsUpdate = true
  tg.computeVertexNormals()

  // Build all PBR maps
  const tex        = buildAlbedoMap()
  const normalMap  = buildNormalMap()
  const roughMap   = buildRoughnessMap()
  const emissMap   = buildEmissiveMap()

  const tunnel = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map:               tex,
      normalMap:         normalMap,
      normalScale:       new THREE.Vector2(0.8, 0.8),
      roughnessMap:      roughMap,
      roughness:         0.65,
      metalness:         0.04,
      emissiveMap:       emissMap,
      emissive:          new THREE.Color(1.0, 0.15, 0.1),  // warm red-orange glow
      emissiveIntensity: 0.35,                               // modest base; GameEngine pulses it
      side:              THREE.BackSide,
      envMapIntensity:   0.4,
    })
  )
  tunnel.position.set(0, 2, -90)
  group.add(tunnel)

  // ── Floor — dark plasma pool with subtle wet sheen ────────────────────────
  const floorAlbedo = ((): THREE.CanvasTexture => {
    const fc = document.createElement('canvas'); fc.width = 256; fc.height = 256
    const fg = fc.getContext('2d')!
    fg.fillStyle = '#0e0005'; fg.fillRect(0, 0, 256, 256)
    const rngF = seededRng(55)
    for (let i = 0; i < 60; i++) {
      const x = rngF()*256, y = rngF()*256, r = 5+rngF()*40
      const gr = fg.createRadialGradient(x,y,0,x,y,r)
      gr.addColorStop(0, `rgba(80,0,10,${0.2+rngF()*0.3})`)
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      fg.fillStyle = gr; fg.beginPath(); fg.arc(x,y,r,0,Math.PI*2); fg.fill()
    }
    const t = new THREE.CanvasTexture(fc)
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4,56); return t
  })()

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 220, 1, 1),
    new THREE.MeshStandardMaterial({
      map:       floorAlbedo,
      color:     0x3a0810,       // visible dark-red, not near-black
      emissive:  0x4a0810,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.0,
      transparent: true,
      opacity:   0.92
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -90)
  group.add(floor)

  const edgeM = new THREE.MeshBasicMaterial({ color: 0x22e4ff })
  ;[-3.5, 3.5].forEach(x => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 220), edgeM)
    e.position.set(x, 0.05, -90)
    group.add(e)
  })

  const dg = new THREE.BoxGeometry(0.06, 0.02, 1.6),
    dm = new THREE.MeshBasicMaterial({ color: 0x5ad8ff }),
    dashes: THREE.Mesh[] = []
  ;[-1, 1].forEach(x => {
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(dg, dm)
      d.position.set(x, 0.03, -i * 7)
      group.add(d)
      dashes.push(d)
    }
  })

  // ── Red blood cells — GLB model, same count & placement as before ────────
  const RBC_TARGET = 1.4
  const rbcs: THREE.Object3D[] = []
  const rg = new THREE.TorusGeometry(0.7, 0.35, 10, 20)
  const rm = new THREE.MeshStandardMaterial({ color: 0xe0203c, emissive: 0x550012, roughness: 0.4 })
  for (let i = 0; i < 55; i++) {
    const m = new THREE.Mesh(rg, rm)
    m.scale.z = 0.5
    placeRbc(m, -Math.random() * 130)
    group.add(m)
    rbcs.push(m)
  }
  new GLTFLoader().load(
    `${import.meta.env.BASE_URL}models/blood-cell.glb`,
    gltf => {
      const src = gltf.scene
      const box = new THREE.Box3().setFromObject(src)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z, 0.001)
      src.scale.multiplyScalar(RBC_TARGET / maxDim)
      src.scale.z *= 0.5
      src.traverse(n => {
        const mesh = n as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mats.forEach(mat => {
          const sm = mat as THREE.MeshStandardMaterial
          if (!sm.isMeshStandardMaterial) return
          sm.emissive = new THREE.Color(0x550012)
          sm.emissiveIntensity = 0.6
          sm.metalness = Math.min(sm.metalness, 0.2)
          sm.roughness = Math.max(sm.roughness, 0.4)
          sm.needsUpdate = true
        })
      })
      rbcs.forEach((old, i) => {
        const pos = old.position.clone(), rot = old.rotation.clone()
        group.remove(old)
        const clone = src.clone(true)
        clone.traverse(n => {
          const m = n as THREE.Mesh
          if (!m.isMesh) return
          const list = Array.isArray(m.material) ? m.material : [m.material]
          m.material = Array.isArray(m.material) ? list.map(mat => mat.clone()) : list[0].clone()
        })
        clone.position.copy(pos); clone.rotation.copy(rot)
        group.add(clone); rbcs[i] = clone
      })
    },
    undefined,
    () => {}
  )

  const points = new THREE.BufferGeometry(),
    pa = new Float32Array(POINT_COUNT * 3)
  for (let i = 0; i < POINT_COUNT; i++) {
    pa[i * 3] = (Math.random() - 0.5) * 16
    pa[i * 3 + 1] = Math.random() * 9
    pa[i * 3 + 2] = -Math.random() * 130
  }
  points.setAttribute('position', new THREE.BufferAttribute(pa, 3))
  const pointsMesh = new THREE.Points(
    points,
    new THREE.PointsMaterial({ color: 0xff9ab5, size: 0.12, transparent: true, opacity: 0.8 })
  )
  group.add(pointsMesh)

  const plat = new THREE.Group()
  plat.add(
    new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: 0x22e4ff })),
    new THREE.Mesh(new THREE.CircleGeometry(1.3, 40),           new THREE.MeshBasicMaterial({ color: 0x22e4ff, transparent: true, opacity: 0.15 }))
  )
  plat.rotation.x = -Math.PI / 2
  plat.position.y = 0.06
  group.add(plat)

  const dispose = () => {
    S.remove(group)
    group.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
        else if (obj.material) obj.material.dispose()
      }
    })
    tex.dispose()
    normalMap.dispose()
    roughMap.dispose()
    emissMap.dispose()
    floorAlbedo.dispose()
  }

  return { group, tunnel, tex, dashes, rbcs, points, pa, plat, dispose }
}


