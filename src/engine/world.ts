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

// ─── Albedo: rich biological tissue with capillary networks ─────────────────
function buildAlbedoMap (W = 1024, H = 1024): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(42)

  // Base — mid arterial red, bright enough to show detail under scene lighting
  const base = g.createLinearGradient(0, 0, W, H)
  base.addColorStop(0.0, '#8a1520')
  base.addColorStop(0.3, '#b02030')
  base.addColorStop(0.6, '#c42838')
  base.addColorStop(1.0, '#961a26')
  g.fillStyle = base
  g.fillRect(0, 0, W, H)

  // Large vessel fibres — longitudinal smooth-muscle bands
  for (let i = 0; i < 18; i++) {
    const x = rng() * W
    const grad = g.createLinearGradient(x - 12, 0, x + 12, 0)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.5, `rgba(${Math.floor(100 + rng()*60)},${Math.floor(rng()*18)},${Math.floor(rng()*18)},${0.3 + rng()*0.25})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(x - 12, 0, 24, H)
  }

  // Capillary network — thin branching lines, brighter red
  for (let i = 0; i < 120; i++) {
    let cx = rng() * W, cy = rng() * H
    const segments = 4 + Math.floor(rng() * 8)
    const alpha = 0.3 + rng() * 0.5
    const r = Math.floor(210 + rng() * 45)
    const gr = Math.floor(20 + rng() * 30)
    g.strokeStyle = `rgba(${r},${gr},${Math.floor(rng()*15)},${alpha})`
    g.lineWidth = 0.5 + rng() * 1.8
    g.beginPath()
    g.moveTo(cx, cy)
    for (let s = 0; s < segments; s++) {
      cx += (rng() - 0.5) * 60
      cy += (rng() - 0.5) * 60
      g.lineTo(cx, cy)
    }
    g.stroke()
  }

  // Wet membrane highlight patches — brighter warm-red subsurface scatter
  for (let i = 0; i < 80; i++) {
    const x = rng() * W, y = rng() * H
    const rx = 8 + rng() * 55, ry = 5 + rng() * 35
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry))
    gr.addColorStop(0, `rgba(240,60,70,${0.15 + rng()*0.2})`)
    gr.addColorStop(0.6, `rgba(180,20,30,${0.08 + rng()*0.1})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.save()
    g.translate(x, y)
    g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry))
    g.beginPath()
    g.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2)
    g.fill()
    g.restore()
  }

  // Fibrous connective tissue strands — lighter so they show
  for (let i = 0; i < 200; i++) {
    const x = rng() * W, y = rng() * H
    const len = 15 + rng() * 80
    const angle = rng() * Math.PI
    const dx = Math.cos(angle) * len, dy = Math.sin(angle) * len
    g.strokeStyle = `rgba(${Math.floor(140+rng()*80)},${Math.floor(10+rng()*20)},${Math.floor(rng()*18)},${0.2+rng()*0.3})`
    g.lineWidth = 0.3 + rng() * 0.9
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke()
  }

  // Soft venous shadow pools — lighter opacity so they don't crush the image
  for (let i = 0; i < 20; i++) {
    const x = rng() * W, y = rng() * H, r = 20 + rng() * 90
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(0,0,0,${0.12 + rng()*0.15})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 22)
  t.anisotropy = 16
  return t
}

// ─── Normal map: vein ridges + muscle fibre bumps ───────────────────────────
function buildNormalMap (W = 512, H = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(77)

  // Flat normal baseline: RGB(128,128,255) = pointing straight out
  g.fillStyle = 'rgb(128,128,255)'
  g.fillRect(0, 0, W, H)

  // Longitudinal vein ridges — raise the normal toward +X or -X
  for (let i = 0; i < 14; i++) {
    const x = rng() * W
    const w = 4 + rng() * 18
    // Left slope of ridge: normal tilts left (R < 128)
    const gleft = g.createLinearGradient(x - w, 0, x, 0)
    gleft.addColorStop(0, 'rgba(128,128,0,0)')
    gleft.addColorStop(1, `rgba(${Math.floor(60+rng()*40)},128,0,0.7)`)
    g.fillStyle = gleft; g.fillRect(x - w, 0, w, H)
    // Right slope: normal tilts right (R > 128)
    const gright = g.createLinearGradient(x, 0, x + w, 0)
    gright.addColorStop(0, `rgba(${Math.floor(180+rng()*50)},128,0,0.7)`)
    gright.addColorStop(1, 'rgba(128,128,0,0)')
    g.fillStyle = gright; g.fillRect(x, 0, w, H)
  }

  // Horizontal muscle ring bumps
  for (let i = 0; i < 22; i++) {
    const y = rng() * H
    const h = 3 + rng() * 10
    const gtop = g.createLinearGradient(0, y - h, 0, y)
    gtop.addColorStop(0, 'rgba(128,128,0,0)')
    gtop.addColorStop(1, `rgba(128,${Math.floor(60+rng()*40)},0,0.5)`)
    g.fillStyle = gtop; g.fillRect(0, y - h, W, h)
    const gbot = g.createLinearGradient(0, y, 0, y + h)
    gbot.addColorStop(0, `rgba(128,${Math.floor(180+rng()*50)},0,0.5)`)
    gbot.addColorStop(1, 'rgba(128,128,0,0)')
    g.fillStyle = gbot; g.fillRect(0, y, W, h)
  }

  // Fine noise pores / micro-bumps
  for (let i = 0; i < 600; i++) {
    const x = rng() * W, y = rng() * H, r = 1 + rng() * 5
    const rVal = Math.floor(90 + rng() * 80)
    const gVal = Math.floor(90 + rng() * 80)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(${rVal},${gVal},200,0.6)`)
    gr.addColorStop(1, 'rgba(128,128,255,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 22)
  t.anisotropy = 8
  return t
}

// ─── Roughness map: wet gloss (dark=smooth) vs dry fibre (light=rough) ──────
function buildRoughnessMap (W = 512, H = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(13)

  // Base: medium-high roughness tissue
  g.fillStyle = 'rgb(160,160,160)'
  g.fillRect(0, 0, W, H)

  // Wet plasma pools — very smooth (dark)
  for (let i = 0; i < 60; i++) {
    const x = rng() * W, y = rng() * H, r = 10 + rng() * 60
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(20,20,20,${0.5 + rng()*0.4})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }

  // Dry fibrous ridges — rough (light)
  for (let i = 0; i < 20; i++) {
    const x = rng() * W, w = 2 + rng() * 8
    const gr = g.createLinearGradient(x, 0, x + w, 0)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(0.5, `rgba(210,210,210,${0.4+rng()*0.4})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(x, 0, w, H)
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 22)
  return t
}

// ─── Emissive map: glowing hot capillaries pulsing from within ───────────────
function buildEmissiveMap (W = 512, H = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const rng = seededRng(99)

  // Black base — no emission except capillaries
  g.fillStyle = 'rgb(0,0,0)'
  g.fillRect(0, 0, W, H)

  // Glowing capillary threads
  for (let i = 0; i < 60; i++) {
    let cx = rng() * W, cy = rng() * H
    const segments = 5 + Math.floor(rng() * 10)
    const r = Math.floor(180 + rng() * 75)
    const alpha = 0.3 + rng() * 0.5
    g.strokeStyle = `rgba(${r},${Math.floor(rng()*30)},${Math.floor(rng()*20)},${alpha})`
    g.lineWidth = 0.5 + rng() * 2.5
    g.beginPath(); g.moveTo(cx, cy)
    for (let s = 0; s < segments; s++) {
      cx += (rng() - 0.5) * 50; cy += (rng() - 0.5) * 50
      g.lineTo(cx, cy)
    }
    g.stroke()
  }

  // Hot-spot glow nodes at capillary junctions
  for (let i = 0; i < 40; i++) {
    const x = rng() * W, y = rng() * H, r = 3 + rng() * 18
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(255,${Math.floor(rng()*60)},0,${0.4+rng()*0.4})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 22)
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
      normalScale:       new THREE.Vector2(1.1, 1.1),
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


