import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Skin } from '../types'

export type Pose = 'idle' | 'run' | 'jump' | 'slide'
const CLIP_PATTERNS: Record<Pose, RegExp> = {
  idle: /idle|stand|breath/i,
  run: /run|sprint|jog/i,
  jump: /jump|hop|leap/i,
  slide: /slide|roll|duck|crouch|dive/i
}

export interface ModelOptions {
  url: string
  height?: number
  facing?: number
  tintMaterials?: RegExp
  /** Environment map used ONLY on the character (keeps the tunnel look untouched). */
  envMap?: THREE.Texture | null
  /** Always use the bone-driven run cycle, even if the GLB has a run clip. */
  forceProcedural?: boolean
  /** Local axis the limb bones swing around. Try 'x' first; if limbs twist sideways try 'z'. */
  limbAxis?: 'x' | 'y' | 'z'
  /** Set to -1 if the legs/arms swing the wrong way (knees bending backwards). */
  limbSign?: 1 | -1
}
export interface ModelDoctor {
  root: THREE.Group
  has: Record<Pose, boolean>
  setPose(p: Pose): void
  update(dt: number, speed: number, frozen: boolean): void
  tint(skin: Skin): void
  dispose(): void
}

export function loadDoctorModel (o: ModelOptions): Promise<ModelDoctor> {
  return new Promise((resolve, reject) =>
    new GLTFLoader().load(
      o.url,
      g => {
        try { resolve(build(g, o)) } catch (e) { reject(e) }
      },
      undefined,
      reject
    )
  )
}

interface Limb {
  bone: THREE.Bone
  rest: THREE.Quaternion
  side: 1 | -1
  kind: 'leg' | 'knee' | 'arm' | 'forearm'
}

function classify (name: string): Limb['kind'] | null {
  const n = name.toLowerCase().replace(/^mixamorig[:_]?/, '')
  if (/twist|finger|thumb|index|middle|ring|pinky|toe|foot|hand|end$/.test(n)) return null
  if (/forearm|lowerarm|lower_arm/.test(n)) return 'forearm'
  if (/calf|shin|lowerleg|lower_leg|knee/.test(n)) return 'knee'
  if (/thigh|upleg|upperleg|upper_leg/.test(n)) return 'leg'
  if (/leg/.test(n) && !/lower/.test(n)) return 'leg'
  if (/arm/.test(n) && !/lower|fore/.test(n)) return 'arm'
  return null
}
function sideOf (bone: THREE.Bone, model: THREE.Object3D): 1 | -1 {
  const n = bone.name.toLowerCase()
  if (/left|[_.\- :]l$|^l[_.\- :]|[_.\- :]l[_.\- :]/.test(n)) return -1
  if (/right|[_.\- :]r$|^r[_.\- :]|[_.\- :]r[_.\- :]/.test(n)) return 1
  const p = model.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))
  return p.x < 0 ? -1 : 1
}

function build (
  gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] },
  o: ModelOptions
): ModelDoctor {
  const model = gltf.scene
  if (import.meta.env.DEV)
    console.info('[doctor.glb] clips:', gltf.animations.map(a => a.name))

  const box = new THREE.Box3().setFromObject(model),
    size = box.getSize(new THREE.Vector3())
  model.scale.multiplyScalar((o.height ?? 2.1) / size.y)
  box.setFromObject(model)
  const c = box.getCenter(new THREE.Vector3())
  model.position.set(
    model.position.x - c.x,
    model.position.y - box.min.y,
    model.position.z - c.z
  )
  const baseY = model.position.y
  const root = new THREE.Group()
  root.rotation.y = o.facing ?? Math.PI
  root.add(model)
  model.traverse(n => {
    if ((n as THREE.SkinnedMesh).isSkinnedMesh) n.frustumCulled = false
  })

  /* ---------- clips ---------- */
  const mixer = new THREE.AnimationMixer(model)
  const actions: Partial<Record<Pose, THREE.AnimationAction>> = {}
  ;(Object.keys(CLIP_PATTERNS) as Pose[]).forEach(p => {
    const clip = gltf.animations.find(a => CLIP_PATTERNS[p].test(a.name))
    if (!clip) return
    const a = mixer.clipAction(clip)
    if (p === 'jump' || p === 'slide') {
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
    }
    actions[p] = a
  })
  if (!actions.run) {
    const walk = gltf.animations.find(a => /walk/i.test(a.name))
    if (walk) actions.run = mixer.clipAction(walk)
  }
  const procedural = !!o.forceProcedural || !actions.run

  let pose: Pose | null = null,
    active: THREE.AnimationAction | null = null
  const setPose = (p: Pose) => {
    if (p === pose) return
    pose = p
    if (procedural && !o.forceProcedural === false) {
      /* forced: no clips are played */
    }
    const next = procedural
      ? null
      : actions[p] ?? (p === 'idle' ? actions.idle ?? actions.run : actions.run) ?? null
    if (next === active) return
    if (next) next.reset().setEffectiveWeight(1).fadeIn(0.15).play()
    if (active) active.fadeOut(0.15)
    active = next
  }

  /* ---------- colourful materials ---------- */
  const tintRx = o.tintMaterials ?? /coat|jacket|shirt|top|cloth|torso/i,
    tintable: THREE.MeshStandardMaterial[] = []
  model.traverse(n => {
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    const list = Array.isArray(m.material) ? m.material : [m.material]
    const cloned = list.map(src => {
      const cl = src.clone() as THREE.MeshStandardMaterial
      if (cl.isMeshStandardMaterial) {
        // Metals render black without a proper environment -> make them matte.
        cl.metalness = Math.min(cl.metalness, 0.15)
        cl.roughness = Math.max(cl.roughness, 0.55)
        if (o.envMap) { cl.envMap = o.envMap; cl.envMapIntensity = 1.1 }
        // Self-light with the model's own colours so the dark-red tunnel can't mute them.
        if (cl.map) {
          cl.emissive.set(0xffffff)
          cl.emissiveMap = cl.map
          cl.emissiveIntensity = 0.35
        } else {
          cl.emissive.copy(cl.color).multiplyScalar(0.35)
        }
        if (tintRx.test(cl.name)) tintable.push(cl)
        cl.needsUpdate = true
      }
      return cl
    })
    m.material = Array.isArray(m.material) ? cloned : cloned[0]
  })

  /* ---------- procedural run cycle ---------- */
  const limbs: Limb[] = []
  let spine: THREE.Bone | null = null
  const spineRest = new THREE.Quaternion()
  if (procedural) {
    model.updateMatrixWorld(true)
    model.traverse(n => {
      const b = n as THREE.Bone
      if (!b.isBone) return
      if (!spine && /spine|chest/i.test(b.name) && !/spine\d|spine_\d|spine[12]/i.test(b.name.replace(/spine$/i, 'x')) === false)
        spine = b
      const kind = classify(b.name)
      if (kind) limbs.push({ bone: b, rest: b.quaternion.clone(), side: sideOf(b, model), kind })
    })
    if (spine) spineRest.copy((spine as THREE.Bone).quaternion)
    if (import.meta.env.DEV)
      console.info('[doctor.glb] animated bones:', limbs.map(l => `${l.bone.name}:${l.kind}`))
  }
  const axis = new THREE.Vector3(
    o.limbAxis === 'x' || !o.limbAxis ? 1 : 0,
    o.limbAxis === 'y' ? 1 : 0,
    o.limbAxis === 'z' ? 1 : 0
  )
  const sign = o.limbSign ?? 1
  const qTmp = new THREE.Quaternion()
  let phase = 0, amp = 0, airAmt = 0

  const drive = (dt: number, speed: number) => {
    const running = pose === 'run'
    amp += ((running ? 1 : 0) - amp) * (1 - Math.exp(-dt * 10))
    airAmt += ((pose === 'jump' ? 1 : 0) - airAmt) * (1 - Math.exp(-dt * 14))
    phase += dt * THREE.MathUtils.clamp(8 + speed * 0.25, 9, 15)
    const s = Math.sin(phase), s2 = Math.sin(phase + Math.PI / 2)
    for (const l of limbs) {
      let a = 0
      const ph = l.side // left/right opposite
      if (l.kind === 'leg') a = ph * s * 0.95 * amp - airAmt * (l.side > 0 ? 0.9 : -0.4)
      else if (l.kind === 'knee') a = -Math.max(0, -ph * s2 + 0.2) * 1.1 * amp - airAmt * 0.8
      else if (l.kind === 'arm') a = -ph * s * 0.85 * amp - airAmt * 2.2
      else a = -(0.7 + 0.3 * Math.max(0, ph * s)) * amp - airAmt * 0.5
      qTmp.setFromAxisAngle(axis, a * sign)
      l.bone.quaternion.copy(l.rest).multiply(qTmp)
    }
    if (spine) {
      qTmp.setFromAxisAngle(axis, -0.12 * amp * sign)
      ;(spine as THREE.Bone).quaternion.copy(spineRest).multiply(qTmp)
    }
    // bounce + sway of the whole body
    model.position.y = baseY + Math.abs(Math.sin(phase)) * 0.09 * amp
    model.rotation.y = Math.sin(phase) * 0.12 * amp
  }

  return {
    root,
    has: {
      idle: !!actions.idle,
      run: !!actions.run || procedural,
      jump: !!actions.jump,
      slide: !!actions.slide
    },
    setPose,
    update (dt, speed, frozen) {
      mixer.timeScale = frozen ? 0 : pose === 'run' ? THREE.MathUtils.clamp(speed / 15, 0.8, 1.8) : 1
      mixer.update(dt)
      if (procedural && !frozen) drive(dt, speed) // runs after the mixer so it wins
    },
    tint (skin) {
      tintable.forEach(m => m.color.setHex(skin.coat))
    },
    dispose () {
      mixer.stopAllAction()
      model.traverse(n => {
        const m = n as THREE.Mesh
        if (!m.isMesh) return
        m.geometry.dispose()
        ;(Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose())
      })
    }
  }
}



// import * as THREE from 'three'
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
// import type { Skin } from '../types'

// /** Poses the game needs. Each is matched to an animation clip in the GLB by name (see CLIP_PATTERNS). */
// export type Pose = 'idle' | 'run' | 'jump' | 'slide'
// const CLIP_PATTERNS: Record<Pose, RegExp> = {
//   idle: /idle|stand|breath/i,
//   run: /run|sprint|jog/i,
//   jump: /jump|hop|leap/i,
//   slide: /slide|roll|duck|crouch|dive/i
// }

// export interface ModelOptions {
//   url: string
//   /** Character height in game units (the built-in doctor is ~2.1). The model is auto-scaled to this. */
//   height?: number
//   /** Y rotation so the model faces away from the camera (-Z). Most GLBs face +Z, so the default is Math.PI. */
//   facing?: number
//   /** Materials whose name matches are recoloured by the skin shop (coat colour). Optional. */
//   tintMaterials?: RegExp
// }
// export interface ModelDoctor {
//   root: THREE.Group
//   has: Record<Pose, boolean>
//   setPose(p: Pose): void
//   update(dt: number, speed: number, frozen: boolean): void
//   tint(skin: Skin): void
//   dispose(): void
// }

// export function loadDoctorModel (o: ModelOptions): Promise<ModelDoctor> {
//   return new Promise((resolve, reject) =>
//     new GLTFLoader().load(
//       o.url,
//       g => {
//         try {
//           resolve(build(g, o))
//         } catch (e) {
//           reject(e)
//         }
//       },
//       undefined,
//       reject
//     )
//   )
// }

// function build (
//   gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] },
//   o: ModelOptions
// ): ModelDoctor {
//   const model = gltf.scene
//   if (import.meta.env.DEV)
//     console.info(
//       '[doctor.glb] animation clips:',
//       gltf.animations.map(a => a.name)
//     )

//   // Fit: scale to the target height, stand on the floor (y = 0), centre on x/z.
//   const box = new THREE.Box3().setFromObject(model),
//     size = box.getSize(new THREE.Vector3())
//   model.scale.multiplyScalar((o.height ?? 2.1) / size.y)
//   box.setFromObject(model)
//   const c = box.getCenter(new THREE.Vector3())
//   model.position.set(
//     model.position.x - c.x,
//     model.position.y - box.min.y,
//     model.position.z - c.z
//   )
//   const root = new THREE.Group()
//   root.rotation.y = o.facing ?? Math.PI
//   root.add(model)
//   model.traverse(n => {
//     if ((n as THREE.SkinnedMesh).isSkinnedMesh) n.frustumCulled = false
//   }) // skinned bounds can be wrong -> never cull

//   // Clips -> poses. Missing clips fall back: jump/slide -> run, idle -> run.
//   const mixer = new THREE.AnimationMixer(model)
//   const actions: Partial<Record<Pose, THREE.AnimationAction>> = {}
//   ;(Object.keys(CLIP_PATTERNS) as Pose[]).forEach(p => {
//     const clip = gltf.animations.find(a => CLIP_PATTERNS[p].test(a.name))
//     if (!clip) return
//     const a = mixer.clipAction(clip)
//     if (p === 'jump' || p === 'slide') {
//       a.setLoop(THREE.LoopOnce, 1)
//       a.clampWhenFinished = true
//     }
//     actions[p] = a
//   })
//   if (!actions.run) {
//     const walk = gltf.animations.find(a => /walk/i.test(a.name))
//     if (walk) actions.run = mixer.clipAction(walk)
//   }

//   let pose: Pose | null = null,
//     active: THREE.AnimationAction | null = null
//   const setPose = (p: Pose) => {
//     if (p === pose) return
//     pose = p
//     const next =
//       actions[p] ??
//       (p === 'idle' ? actions.idle ?? actions.run : actions.run) ??
//       null
//     if (next === active) return
//     if (next) next.reset().setEffectiveWeight(1).fadeIn(0.15).play()
//     if (active) active.fadeOut(0.15)
//     active = next
//   }

//   // Optional coat tint for the skin shop (clone materials so shared ones are not all recoloured).
//   const tintRx = o.tintMaterials ?? /coat|jacket|shirt|top|cloth|torso/i,
//     tintable: THREE.MeshStandardMaterial[] = []
//   model.traverse(n => {
//     const m = n as THREE.Mesh
//     if (!m.isMesh) return
//     const list = Array.isArray(m.material) ? m.material : [m.material]
//     const cloned = list.map(mat => {
//       const cl = mat.clone()
//       if (tintRx.test(cl.name) && (cl as THREE.MeshStandardMaterial).color)
//         tintable.push(cl as THREE.MeshStandardMaterial)
//       return cl
//     })
//     m.material = Array.isArray(m.material) ? cloned : cloned[0]
//   })

//   return {
//     root,
//     has: {
//       idle: !!actions.idle,
//       run: !!actions.run,
//       jump: !!actions.jump,
//       slide: !!actions.slide
//     },
//     setPose,
//     update (dt, speed, frozen) {
//       mixer.timeScale = frozen
//         ? 0
//         : pose === 'run'
//         ? THREE.MathUtils.clamp(speed / 15, 0.8, 1.8)
//         : 1
//       mixer.update(dt)
//     },
//     tint (skin) {
//       tintable.forEach(m => m.color.setHex(skin.coat))
//     },
//     dispose () {
//       mixer.stopAllAction()
//       model.traverse(n => {
//         const m = n as THREE.Mesh
//         if (!m.isMesh) return
//         m.geometry.dispose()
//         ;(Array.isArray(m.material) ? m.material : [m.material]).forEach(x =>
//           x.dispose()
//         )
//       })
//     }
//   }
// }
