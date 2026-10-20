import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { loadDoctorModel, type ModelDoctor, type Pose } from './doctorModel'
import type { HudState, Skin } from '../types'
import type { Brand } from '../api/types'
import {
  MissionMachine,
  type MissionRules,
  type RunSummary
} from '../../shared/mission'
import { makeBrandAssets, type BrandAssets } from './brand'
import { ZONES, type WorldId } from '../data/worlds'
import { createWorld, placeRbc, POINT_COUNT, type World } from './world'
import { createHeartWorld, placeHeartParticle, HEART_POINT_COUNT, type HeartWorld } from './worldHeart'
import { createLungsWorld, placeLungsParticle, LUNGS_POINT_COUNT, type LungsWorld } from './worldLungs'
import { applySkin, createDoctor, type Doctor } from './doctor'
import { createEntity, type EntType } from './entities'
import { Bursts } from './particles'
import { sfx } from './audio'

export type Action = 'l' | 'r' | 'u' | 'd'
type Mode = 'idle' | 'count' | 'run' | 'pause' | 'event' | 'over'

/** Per-world scene config (fog, background, light colours, heartbeat pulse colour) */
const WORLD_CONFIG: Record<WorldId, {
  bg: number; fog: number; fogDensity: number
  ambient: number; hemiSky: number; hemiGround: number
  trackLight: number; fillLight: number
  pulseColor: number; particleCount: number
}> = {
  Bloodstream: {
    bg: 0x2a0810, fog: 0x4a1020, fogDensity: 0.012,
    ambient: 0xff8899, hemiSky: 0xff6070, hemiGround: 0x661828,
    trackLight: 0xff5566, fillLight: 0xffcccc,
    pulseColor: 0xff9ab5, particleCount: POINT_COUNT
  },
  Heart: {
    bg: 0x180006, fog: 0x3a0010, fogDensity: 0.020,
    ambient: 0xff9090, hemiSky: 0xff6060, hemiGround: 0x331020,
    trackLight: 0xff2255, fillLight: 0xffaaaa,
    pulseColor: 0xff4466, particleCount: HEART_POINT_COUNT
  },
  Lungs: {
    bg: 0x040c18, fog: 0x082040, fogDensity: 0.016,
    ambient: 0x80c8ff, hemiSky: 0x60aaff, hemiGround: 0x102030,
    trackLight: 0x00aaff, fillLight: 0xaaddff,
    pulseColor: 0x44ccff, particleCount: LUNGS_POINT_COUNT
  }
}

export interface EngineEvents {
  onHud(h: HudState): void
  onQuiz(index: number): void
  onEnd(s: RunSummary): void
  onBanner(t: string): void
  onFloat(t: string, x: number, y: number, c: string): void
  onHit(): void
  onPause(p: boolean): void
}
interface Ent {
  t: EntType
  l: number
  m: THREE.Object3D
}
const LANES = [-2, 0, 2]
/** Overall scene brightness. 1 = bright default. Raise (1.3, 1.6) for brighter, lower (0.8) for moodier. */
const BRIGHTNESS = 1
const DOCTOR_MODEL = {
  url: `${import.meta.env.BASE_URL}models/doctor.glb`,
  height: 2.5,
  facing: Math.PI
  // limbAxis: 'x' as const, // try 'z' or 'y' if limbs swing sideways
  // limbSign: 1 as const    // set -1 if knees bend backwards
}

const fresh = () => ({
  lane: 1,
  x: 0,
  y: 0,
  vy: 0,
  slide: 0,
  speed: 15,
  dist: 0,
  inv: 0,
  shield: false,
  mult: 0,
  ms: 500,
  buf: 0,
  streak: 0
})
const IDLE_RULES: MissionRules = {
  timeLimit: 180,
  maxHealth: 100,
  target: 1,
  quizAt: [],
  requireFinalQuiz: false
}
const HERO_CAM = new THREE.Vector3(1.9, 1.7, 3.8),
  HERO_LOOK = new THREE.Vector3(0, 1.2, 0)
  const HERO_FACE = -0.2

export class GameEngine {
  private R: THREE.WebGLRenderer
  private S = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(70, 1, 0.1, 200)
  private w: World
  private d: Doctor
  private fx: Bursts
  private light: THREE.PointLight
  private fill: THREE.PointLight
  private ambLight: THREE.AmbientLight
  private hemiLight: THREE.HemisphereLight
  private envTex: THREE.Texture | null = null // environment map for the character only
  private ents: Ent[] = []
  private s = fresh()
  private mode: Mode = 'idle'
  private worldId: WorldId = 'Bloodstream'
  /** Single source of truth for timer, health, objective, quizzes and win/loss (shared/mission.ts). */
  private machine: MissionMachine | null = null
  private brand: BrandAssets | null = null
  private model: ModelDoctor | null = null
  private skin: Skin | null = null
  private pendingEnd: RunSummary | null = null
  private tm = 0
  private shake = 0
  private acc = 0
  private runT = 0
  private cd = 0
  private cdn = -1
  private goT = 0
  private camX = 0
  private hv = 0
  private hbOn = false
  private emitT = 0
  private overT = 0
  private prevX = 0
  private raf = 0
  private last = performance.now()
  private tmpV = new THREE.Vector3()
  private cleanup: Array<() => void> = []

  constructor (canvas: HTMLCanvasElement, private ev: EngineEvents) {
    this.R = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.R.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    // Correct colour output (works on old and new three.js versions)
    const Ra = this.R as any
    if ('outputColorSpace' in Ra) Ra.outputColorSpace = (THREE as any).SRGBColorSpace
    else Ra.outputEncoding = (THREE as any).sRGBEncoding
    // No tone mapping: it was what made the whole scene look dull/desaturated.
    this.R.toneMapping = THREE.NoToneMapping
    this.R.toneMappingExposure = 1
    const pmrem = new THREE.PMREMGenerator(this.R)
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()

    const wc = WORLD_CONFIG['Bloodstream']
    this.light = new THREE.PointLight(wc.trackLight, 3.5 * BRIGHTNESS, 22)
    this.fill  = new THREE.PointLight(wc.fillLight,  3.8 * BRIGHTNESS, 18)
    this.ambLight = new THREE.AmbientLight(wc.ambient, 2.2 * BRIGHTNESS)
    this.hemiLight = new THREE.HemisphereLight(wc.hemiSky, wc.hemiGround, 1.6 * BRIGHTNESS)

    this.S.background = new THREE.Color(wc.bg)
    this.S.fog = new THREE.FogExp2(wc.fog, wc.fogDensity)
    const dl = new THREE.DirectionalLight(0xffffff, 1.3 * BRIGHTNESS)
    dl.position.set(2, 8, 4)
    this.S.add(
      this.ambLight,
      dl,
      this.light,
      this.fill,
      this.hemiLight
    )
    this.w = createWorld(this.S)
    this.d = createDoctor(this.S)
    this.fx = new Bursts(this.S)
    this.resize()
    this.bindInput()
    this.raf = requestAnimationFrame(this.loop)
    void this.loadModel()
  }

  /** Loads public/models/doctor.glb. On failure the built-in box doctor stays. */
  private async loadModel () {
    try {
      const m = await loadDoctorModel({
        ...DOCTOR_MODEL,
        envMap: this.envTex
        // forceProcedural: true, // uncomment if the GLB's own run clip looks stiff/wrong
      })
      this.d.parts.forEach(p => {
        p.visible = false // hide the box doctor, keep shadow + shield aura
      })
      this.d.group.add(m.root)
      this.model = m
      if (this.skin) m.tint(this.skin)
    } catch (e) {
      console.warn('Doctor GLB not loaded, using the built-in character:', e)
    }
  }

  /* ---------- public API ---------- */

  /** Switch world scene. Call before start() — rebuilds the tunnel geometry and recolours the scene. */
  setWorld (id: WorldId) {
    if (this.worldId === id) return
    this.worldId = id
    // Fully tear down and dispose previous world objects and textures
    this.w.dispose()
    // Build new world
    if (id === 'Heart') this.w = createHeartWorld(this.S)
    else if (id === 'Lungs') this.w = createLungsWorld(this.S)
    else this.w = createWorld(this.S)
    // Re-apply scene colours and all lights
    const wc = WORLD_CONFIG[id]
    ;(this.S.background as THREE.Color).set(wc.bg)
    ;(this.S.fog as THREE.FogExp2).color.set(wc.fog)
    ;(this.S.fog as THREE.FogExp2).density = wc.fogDensity
    this.ambLight.color.set(wc.ambient)
    this.hemiLight.color.set(wc.hemiSky)
    this.hemiLight.groundColor.set(wc.hemiGround)
    this.light.color.set(wc.trackLight)
    this.fill.color.set(wc.fillLight)
  }

  setSkin (s: Skin) {
    applySkin(this.d, s)
    this.skin = s
    this.model?.tint(s)
  }
  toIdle () {
    this.reset()
    this.machine = null
    this.mode = 'idle'
    this.emitHud()
  }
  setBrand (b: Brand | null) {
    this.brand = b ? makeBrandAssets(b) : null
  }
  /** Begins a 3-2-1 countdown, then the machine's timer starts. Ignored while a run is already live (no duplicate timers). */
  start (rules: MissionRules): boolean {
    if (['count', 'run', 'event', 'pause'].includes(this.mode)) return false
    this.reset()
    this.machine = new MissionMachine(rules, {
      onQuiz: i => this.ev.onQuiz(i),
      onEnd: e => {
        this.pendingEnd = e
        this.overT = 0
        if (e.outcome === 'won')
          this.fx.emit(new THREE.Vector3(this.s.x, 1.4, 0), 0x22e4ff, 40)
      }
    })
    this.mode = 'count'
    this.cd = 3
    this.cdn = -1
    this.emitHud()
    return true
  }
  togglePause () {
    if (this.mode === 'run') {
      this.mode = 'pause'
      this.ev.onPause(true)
    } else if (this.mode === 'pause') {
      this.mode = 'run'
      this.ev.onPause(false)
    }
  }
  /** Called once the server has recorded the quiz answer: resumes the run, or finishes it after the final checkpoint. */
  answerQuiz (correct: boolean) {
    const m = this.machine
    if (!m || this.mode !== 'event') return
    m.quizAnswered(correct)
    this.s.inv = 2
    this.mode = m.state === 'RUNNING' ? 'run' : 'over'
    this.emitHud()
  }
  act (a: Action) {
    if (this.mode !== 'run') return
    const s = this.s
    if (a === 'l') s.lane = Math.max(0, s.lane - 1)
    if (a === 'r') s.lane = Math.min(2, s.lane + 1)
    if (a === 'u') {
      if (s.y === 0) s.vy = 10
      else s.buf = 0.15
    }
    if (a === 'd') {
      s.slide = 0.7
      if (s.y > 0) s.vy = -16
    }
  }
  dispose () {
    cancelAnimationFrame(this.raf)
    this.cleanup.forEach(f => f())
    this.w.dispose()
    this.R.dispose()
    this.envTex?.dispose()
    this.model?.dispose()
  }

  /* ---------- internals ---------- */
  private reset () {
    this.ents.forEach(e => this.S.remove(e.m))
    this.ents = []
    this.s = fresh()
    this.acc = 0
    this.overT = 0
    this.pendingEnd = null
    this.goT = 0
  }
  private emitHud () {
    const s = this.s,
      m = this.machine,
      r = m?.rules ?? IDLE_RULES
    this.ev.onHud({
      state: m?.state ?? 'READY',
      hp: m?.health ?? r.maxHealth,
      maxHp: r.maxHealth,
      score: m ? m.liveScore() : 0,
      dist: Math.floor(s.dist),
      pills: m?.pills ?? 0,
      target: r.target,
      time: m ? Math.ceil(m.remaining) : r.timeLimit,
      timeLimit: r.timeLimit,
      streak: s.streak,
      shield: s.shield,
      mult: s.mult,
      count: this.mode === 'count' ? this.cdn : this.goT > 0 ? 0 : null
    })
  }
  private resize = () => {
    this.R.setSize(innerWidth, innerHeight)
    this.cam.aspect = innerWidth / innerHeight
  }
  private bindInput () {
    const keys: Record<string, Action> = {
      ArrowLeft: 'l',
      ArrowRight: 'r',
      ArrowUp: 'u',
      ArrowDown: 'd',
      a: 'l',
      d: 'r',
      w: 'u',
      s: 'd'
    }
    const kd = (e: KeyboardEvent) => {
      // Never hijack typing: forms (login, signup, admin) need every letter, including W/A/S/D/P.
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (this.mode !== 'run' && this.mode !== 'pause') return // keys only control a live run
      const k = keys[e.key]
      if (k) {
        e.preventDefault()
        this.act(k)
      }
      if (e.key === 'Escape' || e.key === 'p') this.togglePause()
    }
    let sx = 0,
      sy = 0,
      fired = true
    const ts = (e: TouchEvent) => {
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
      fired = false
    }
    const tm = (e: TouchEvent) => {
      if (fired) return
      const t = e.touches[0],
        dx = t.clientX - sx,
        dy = t.clientY - sy
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
      fired = true
      this.act(
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u'
      )
    }
    const vc = () => {
      if (document.hidden && this.mode === 'run') this.togglePause()
    }
    addEventListener('keydown', kd)
    addEventListener('touchstart', ts, { passive: true })
    addEventListener('touchmove', tm, { passive: true })
    addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', vc)
    this.cleanup.push(() => {
      removeEventListener('keydown', kd)
      removeEventListener('touchstart', ts)
      removeEventListener('touchmove', tm)
      removeEventListener('resize', this.resize)
      document.removeEventListener('visibilitychange', vc)
    })
  }
  private add (t: EntType, l: number, z: number) {
    const m = createEntity(t, this.brand)
    m.position.x = LANES[l]
    m.position.z = z
    this.S.add(m)
    this.ents.push({ t, l, m })
  }
  private spawn () {
    const z = -95,
      free = [0, 1, 2],
      n = Math.random() < 0.35 ? 2 : 1
    for (let i = 0; i < n; i++)
      this.add(
        Math.random() < 0.5 ? 'virus' : 'bact',
        free.splice((Math.random() * free.length) | 0, 1)[0],
        z
      )
    const k = free[(Math.random() * free.length) | 0],
      r = Math.random()
    if (r < 0.08) this.add('shield', k, z)
    else if (r < 0.15) this.add('x2', k, z)
    else for (let i = 0; i < 4; i++) this.add('pill', k, z - i * 2.2)
  }
  private floatAt (p: THREE.Vector3, text: string, c: string) {
    const v = this.tmpV.copy(p).project(this.cam)
    this.ev.onFloat(
      text,
      ((v.x + 1) / 2) * innerWidth,
      ((1 - v.y) / 2) * innerHeight,
      c
    )
  }
  private hurt () {
    const s = this.s
    if (s.inv > 0) return
    s.streak = 0
    this.fx.emit(
      new THREE.Vector3(s.x, 1.2, 0),
      s.shield ? 0x3b82ff : 0xff3d6e,
      18
    )
    if (navigator.vibrate) navigator.vibrate(70)
    sfx(110, 0.3, 'square', 0.12)
    if (s.shield) {
      s.shield = false
      s.inv = 1
      return
    }
    this.machine?.damage()
    s.inv = 1.3
    this.shake = 0.5
    this.ev.onHit()
  }
  private pick (e: Ent) {
    const s = this.s,
      p = e.m.position,
      m = s.mult > 0 ? 2 : 1
    if (e.t === 'pill') {
      s.streak++
      const v = (10 + Math.min(s.streak, 20)) * m
      this.machine?.collect(1, v - 10, !!this.brand)
      this.fx.emit(p, 0x22e4ff, 8)
      sfx(660 + Math.min(s.streak, 12) * 40, 0.1)
      this.floatAt(p, '+' + v, '#22e4ff')
    } else if (e.t === 'shield') {
      s.shield = true
      sfx(520, 0.3)
      this.fx.emit(p, 0x3b82ff, 16)
      this.floatAt(p, '🛡 SHIELD', '#6aa8ff')
    } else {
      s.mult = 8
      this.fx.emit(p, 0xffd24d, 16)
      this.floatAt(p, '✨ x2', '#ffd24d')
    }
  }
  private stepRun (dt: number) {
    const s = this.s,
      mm = this.machine!
    s.speed = Math.min(32, 15 + s.dist * 0.004)
    const d = s.speed * dt
    s.dist += d
    mm.advance(dt, s.dist)
    this.acc += d
    if (this.acc >= 10) {
      this.acc = 0
      this.spawn()
    }
    s.inv = Math.max(0, s.inv - dt)
    s.mult = Math.max(0, s.mult - dt)
    s.x += (LANES[s.lane] - s.x) * (1 - Math.exp(-dt * 13))
    if (s.y > 0 || s.vy > 0) {
      s.vy -= 28 * dt
      s.y += s.vy * dt
      if (s.y <= 0) {
        s.y = 0
        s.vy = s.buf > 0 ? 10 : 0
      }
    }
    s.slide = Math.max(0, s.slide - dt)
    s.buf = Math.max(0, s.buf - dt)
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i],
        m = e.m
      m.position.z += d
      m.rotation.y += dt * (e.t === 'virus' ? 2 : 3)
      if (e.t === 'bact') m.rotation.x += dt
      if (m.position.z > 7) {
        this.S.remove(m)
        this.ents.splice(i, 1)
        continue
      }
      if (Math.abs(m.position.z) < 0.7 && Math.abs(m.position.x - s.x) < 0.9) {
        if (e.t === 'virus') {
          if (s.y < 1) this.hurt()
        } else if (e.t === 'bact') {
          if (s.slide <= 0) this.hurt()
        } else {
          this.pick(e)
          this.S.remove(m)
          this.ents.splice(i, 1)
        }
      }
    }
    if (s.dist >= s.ms) {
      const zones = ZONES[this.worldId]
      this.ev.onBanner(
        `${s.ms} m · ENTERING ${zones[(s.ms / 500 - 1) % zones.length]}`
      )
      s.ms += 500
    }
    mm.resolve() // objective / health / deadline / quiz checkpoint decisions happen in exactly one place
    if (mm.state === 'QUIZ_PAUSED') this.mode = 'event'
    else if (mm.state === 'WON' || mm.state === 'LOST') this.mode = 'over'
    if (mm.state !== 'RUNNING') this.emitHud() // HUD shows the exact frozen/final values (e.g. 0:00 at the deadline)
  }
  private update (dt: number) {
    this.tm += dt
    const s = this.s
    if (this.mode === 'count') {
      this.cd -= dt
      const n = Math.ceil(this.cd)
      if (n !== this.cdn) {
        this.cdn = n
        if (n <= 0) this.goT = 0.7
        this.emitHud()
      }
      if (this.cd <= 0) {
        this.mode = 'run'
        this.machine?.start()
      }
    }
    if (this.goT > 0) {
      this.goT -= dt
      if (this.goT <= 0) this.emitHud()
    }
    if (this.mode === 'run') this.stepRun(dt)
    if (this.mode === 'over' && this.pendingEnd) {
      this.overT += dt
      if (this.overT > 0.9) {
        const e = this.pendingEnd
        this.pendingEnd = null
        this.machine?.toResults()
        this.ev.onEnd(e)
      }
    }
    const sp =
        this.mode === 'run'
          ? s.speed
          : this.mode === 'over'
          ? s.speed * 0.2
          : this.mode === 'idle'
          ? 3
          : this.mode === 'count'
          ? 7
          : 0,
      dz = sp * dt
    this.animate(dt, sp, dz)
    this.emitT += dt
    if (this.mode === 'run' && this.emitT > 0.08) {
      this.emitT = 0
      this.emitHud()
    }
  }
  private animate (dt: number, sp: number, dz: number) {
    const w = this.w,
      d = this.d,
      s = this.s,
      tm = this.tm,
      wc = WORLD_CONFIG[this.worldId],
      pc = wc.particleCount
    w.rbcs.forEach(m => {
      m.position.z += dz * 0.9
      m.rotation.x += dt * 0.5
      if (m.position.z > 8) {
        if (this.worldId === 'Heart') placeHeartParticle(m, -125)
        else if (this.worldId === 'Lungs') placeLungsParticle(m, -125)
        else placeRbc(m, -125)
      }
    })
    w.dashes.forEach(m => {
      m.position.z += dz
      if (m.position.z > 6) m.position.z -= 168
    })
    for (let i = 0; i < pc; i++) {
      w.pa[i * 3 + 2] += dz * 1.1
      if (w.pa[i * 3 + 2] > 8) w.pa[i * 3 + 2] = -125
    }
    w.points.attributes.position.needsUpdate = true
    w.tunnel.rotation.z += dt * 0.02
    w.tex.offset.y -= (dz / 220) * 26
    const hb = Math.pow(Math.max(0, Math.sin(tm * 5.2)), 6)
    ;(this.S.fog as THREE.FogExp2).density = wc.fogDensity + hb * 0.003
    this.light.intensity = (3.5 + hb * 1.2) * BRIGHTNESS
    w.tunnel.material.emissiveIntensity = 0.35 + hb * 0.5   // base 0.35, pulses to 0.85 on heartbeat
    if (this.mode === 'run') {
      if (hb > 0.9 && !this.hbOn) {
        this.hbOn = true
        sfx(55, 0.18, 'sine', 0.3)
      } else if (hb < 0.3) this.hbOn = false
    }
    this.fx.update(dt, dz)

    // ── Heart world: animate interior anatomy elements ──────────────────────
    if (this.worldId === 'Heart') {
      const hw = this.w as HeartWorld
      hw.phase = (hw.phase ?? 0) + dt

      // Heartbeat pulse — 72 bpm = ~0.83 s period
      const beat = Math.pow(Math.max(0, Math.sin(hw.phase * Math.PI * 2 / 0.83)), 8)

      // Tunnel breathes with each beat (systolic squeeze)
      const squeeze = 1 - beat * 0.04
      hw.tunnel.scale.set(squeeze, squeeze, 1)

      // Purkinje rings flash on each beat
      hw.purkinjeRings?.forEach((r, i) => {
        const mat = r.material as THREE.MeshBasicMaterial
        const phase = (hw.phase - i * 0.04) * Math.PI * 2 / 0.83
        const glow = Math.pow(Math.max(0, Math.sin(phase)), 10)
        mat.opacity = 0.12 + glow * 0.65
        r.position.z += dz
        if (r.position.z > 8) r.position.z -= 220
      })

      // Valve leaflets open/close — flap on beat
      hw.valveLeaflets?.forEach((v, i) => {
        const phase = hw.phase * Math.PI * 2 / 0.83
        v.rotation.x = 0.3 + Math.sin(phase) * 0.55
        v.position.z += dz
        if (v.position.z > 8) v.position.z -= 220
      })

      // Chordae tendineae sway gently
      hw.chordae?.forEach((c, i) => {
        c.rotation.z = Math.sin(hw.phase * 1.8 + i * 0.7) * 0.08
        c.position.z += dz
        if (c.position.z > 8) c.position.z -= 220
      })

      // Trabeculae scroll with world
      hw.trabeculae?.forEach(t => {
        t.position.z += dz
        if (t.position.z > 8) t.position.z -= 210
      })

      // Papillary muscles scroll
      hw.papillaryMuscles?.forEach(p => {
        p.position.z += dz
        if (p.position.z > 8) p.position.z -= 220
      })

      // Coronary vessels pulse brightness on beat
      hw.coronaryVessels?.forEach(cv => {
        const mat = cv.material as THREE.MeshBasicMaterial
        mat.opacity = 0.4 + beat * 0.5
      })

      // Light pulses with heartbeat
      this.light.intensity = (2.4 + beat * 2.0) * BRIGHTNESS
      ;(this.S.fog as THREE.FogExp2).density = 0.020 + beat * 0.006
    }

    // ── Lungs world: animate airway respiratory breathing & cartilage ───────
    if (this.worldId === 'Lungs') {
      const lw = this.w as LungsWorld
      lw.phase = (lw.phase ?? 0) + dt
      // Respiratory cycle: ~16 breaths/min = ~3.75s per breath
      const breath = Math.sin((lw.phase * Math.PI * 2) / 3.75)
      // Airway gently dilates during inhalation, narrows slightly during exhalation
      const expansion = 1 + breath * 0.025
      lw.tunnel.scale.set(expansion, expansion, 1)

      // Cartilage rings scroll and have a faint blue sheen
      lw.cartilageRings?.forEach((r, i) => {
        const pulse = 0.4 + Math.sin(lw.phase * 2 + i * 0.3) * 0.25
        // GLB clones are Groups; procedural fallbacks are Meshes — traverse covers both
        r.traverse(o => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          mats.forEach(mat => {
            const sm = mat as THREE.MeshStandardMaterial
            if (sm.isMeshStandardMaterial && sm.emissive) {
              sm.emissiveIntensity = pulse
            }
          })
        })
        r.position.z += dz
        if (r.position.z > 8) r.position.z -= 220
      })

      // Branching ports scroll
      lw.branchingPorts?.forEach(p => {
        p.position.z += dz
        if (p.position.z > 8) p.position.z -= 220
      })
    }

    const live =
      this.mode === 'run' || this.mode === 'idle' || this.mode === 'count'
    if (live) this.runT += dt * (sp * 0.55)
    const x = s.x,
      y = s.y,
      sl = s.slide > 0,
      air = y > 0.05,
      sw = air ? 0 : Math.sin(this.runT) * 0.95,
      k = 1 - Math.exp(-dt * 20)
    const mdl = this.model
    if (mdl) {
      // GLB character: animation clips (or the procedural bone cycle) drive the limbs
      const pose: Pose = air
        ? 'jump'
        : sl
        ? 'slide'
        : this.mode === 'idle'
        ? 'idle'
        : 'run'
      mdl.setPose(pose)
      const vx = (x - this.prevX) / Math.max(dt, 1e-4)
      mdl.update(dt, s.speed, !live, vx, s.vy)
    } else {
      // built-in box character
      d.legL.rotation.x += ((air ? -0.7 : sw) - d.legL.rotation.x) * k
      d.legR.rotation.x += ((air ? 0.5 : -sw) - d.legR.rotation.x) * k
      d.armL.rotation.x += ((air ? -2.4 : -sw) - d.armL.rotation.x) * k
      d.armR.rotation.x += ((air ? -2.4 : sw) - d.armR.rotation.x) * k
    }
    this.prevX = x
    d.group.position.set(
      x,
      y +
        (sl && !mdl ? 0.15 : 0) +
        (!mdl && live && !air && !sl ? Math.abs(Math.sin(this.runT)) * 0.09 : 0),
      0
    )
    // lean forward when sliding (only if the model has no slide clip of its own)
    d.group.rotation.x +=
      ((sl && !mdl?.has.slide ? -1.2 : mdl ? 0 : 0.14) - d.group.rotation.x) * k
    d.group.rotation.z = (LANES[s.lane] - s.x) * 0.14
    d.group.visible = !(s.inv > 0 && Math.floor(tm * 20) % 2 === 0)
    d.aura.visible = s.shield
    const shm = d.shadow.material as THREE.MeshBasicMaterial
    d.shadow.position.x = x
    d.shadow.scale.setScalar(Math.max(0.35, 1 - y * 0.22))
    shm.opacity = 0.5 * d.shadow.scale.x
    this.light.position.set(x, 3, 2)
    this.fill.position.set(x + 1, 2.5, 3) // keeps the character evenly lit in its true colours

    this.shake = Math.max(0, this.shake - dt)
    const sk = this.shake * 0.4,
      cs = 1 - Math.exp(-dt * 7)
    this.camX += (x * 0.6 - this.camX) * cs
    const tf =
      (innerWidth < innerHeight ? 82 : 68) +
      (this.mode === 'run' ? (s.speed - 15) * 0.4 : 0)
    this.cam.fov += (tf - this.cam.fov) * cs
    this.cam.updateProjectionMatrix()
    this.cam.position.set(
      this.camX + (Math.random() - 0.5) * sk,
      3.4 + y * 0.25 + (Math.random() - 0.5) * sk,
      6.2
    )
    this.cam.lookAt(this.camX * 0.5, 1.2, -8)
    this.hv +=
      ((this.mode === 'idle' ? 1 : 0) - this.hv) * (1 - Math.exp(-dt * 3))
    const hv = this.hv
    w.plat.visible = hv > 0.02
    w.plat.scale.setScalar(Math.max(0.01, hv))
    w.plat.rotation.z += dt
    // d.group.rotation.y = hv * (Math.PI - 0.5)
    d.group.rotation.y = hv * HERO_FACE
    if (hv > 0.01) {
      this.cam.position.lerp(HERO_CAM, hv)
      this.cam.lookAt(
        this.tmpV.set(this.camX * 0.5, 1.2, -8).lerp(HERO_LOOK, hv)
      )
    }
  }
  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop)
    let left = Math.min(0.5, (t - this.last) / 1000)
    this.last = t
    // Fixed small sub-steps: mission time follows the REAL clock even at low FPS (so slow devices are not penalised against the server deadline)
    // and fast obstacles can never be skipped between two frames.
    while (left > 1e-6) {
      const step = Math.min(0.025, left)
      this.update(step)
      left -= step
    }
    this.R.render(this.S, this.cam)
  }
}



// import * as THREE from 'three'
// import { loadDoctorModel, type ModelDoctor, type Pose } from "./doctorModel"
// import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
// import type { HudState, Skin } from '../types'
// import type { Brand } from '../api/types'
// import {
//   MissionMachine,
//   type MissionRules,
//   type RunSummary
// } from '../../shared/mission'
// import { makeBrandAssets, type BrandAssets } from './brand'
// import { ZONES } from '../data/worlds'
// import { createWorld, placeRbc, POINT_COUNT, type World } from './world'
// import { applySkin, createDoctor, type Doctor } from './doctor'
// import { createEntity, type EntType } from './entities'
// import { Bursts } from './particles'
// import { sfx } from './audio'

// export type Action = 'l' | 'r' | 'u' | 'd'
// type Mode = 'idle' | 'count' | 'run' | 'pause' | 'event' | 'over'
// export interface EngineEvents {
//   onHud(h: HudState): void
//   onQuiz(index: number): void
//   onEnd(s: RunSummary): void
//   onBanner(t: string): void
//   onFloat(t: string, x: number, y: number, c: string): void
//   onHit(): void
//   onPause(p: boolean): void
// }
// interface Ent {
//   t: EntType
//   l: number
//   m: THREE.Object3D
// }
// const LANES = [-2, 0, 2]
// const DOCTOR_MODEL = { url: `${import.meta.env.BASE_URL}models/doctor.glb`, 
// height: 2.2, facing: Math.PI};
// console.log("Doctor Model =>", DOCTOR_MODEL);

// const fresh = () => ({
//   lane: 1,
//   x: 0,
//   y: 0,
//   vy: 0,
//   slide: 0,
//   speed: 15,
//   dist: 0,
//   inv: 0,
//   shield: false,
//   mult: 0,
//   ms: 500,
//   buf: 0,
//   streak: 0
// })
// const IDLE_RULES: MissionRules = {
//   timeLimit: 180,
//   maxHealth: 100,
//   target: 1,
//   quizAt: [],
//   requireFinalQuiz: false
// }
// const HERO_CAM = new THREE.Vector3(1.9, 1.7, 3.8),
//   HERO_LOOK = new THREE.Vector3(0, 1.2, 0)

// export class GameEngine {
//   private R: THREE.WebGLRenderer
//   private S = new THREE.Scene()
//   private cam = new THREE.PerspectiveCamera(70, 1, 0.1, 200)
//   private w: World
//   private d: Doctor
//   private fx: Bursts
//   private light = new THREE.PointLight(0x22e4ff, 1.6, 18)
//   private ents: Ent[] = []
//   private s = fresh()
//   private mode: Mode = 'idle'
//   /** Single source of truth for timer, health, objective, quizzes and win/loss (shared/mission.ts). */
//   private machine: MissionMachine | null = null
//   private brand: BrandAssets | null = null
//   private model: ModelDoctor | null = null
//   private skin: Skin | null = null
//   private pendingEnd: RunSummary | null = null
//   private tm = 0
//   private shake = 0
//   private acc = 0
//   private runT = 0
//   private cd = 0
//   private cdn = -1
//   private goT = 0
//   private camX = 0
//   private hv = 0
//   private hbOn = false
//   private emitT = 0
//   private overT = 0
//   private raf = 0
//   private last = performance.now()
//   private tmpV = new THREE.Vector3()
//   private cleanup: Array<() => void> = []

//   constructor (canvas: HTMLCanvasElement, private ev: EngineEvents) {
//     this.R = new THREE.WebGLRenderer({ canvas, antialias: true })
//     this.R.setPixelRatio(Math.min(devicePixelRatio, 1.75))
//     this.S.background = new THREE.Color(0x12030a)
//     this.S.fog = new THREE.FogExp2(0x2a0510, 0.024)
//     const dl = new THREE.DirectionalLight(0xffffff, 0.7)
//     dl.position.set(2, 8, 4)
//     this.S.add(
//       new THREE.AmbientLight(0xaa6677, 0.9),
//       dl,
//       this.light,
//       new THREE.HemisphereLight(0xff8aa0, 0x220010, 0.55)
//     )
//     this.w = createWorld(this.S)
//     this.d = createDoctor(this.S)
//     this.fx = new Bursts(this.S)
//     this.resize()
//     this.bindInput()
//     this.raf = requestAnimationFrame(this.loop)
//     void this.loadModel()
//   }

//   /** Loads public/models/doctor.glb. On failure the built-in box doctor stays. */
//   private async loadModel () {
//     try {
//       const m = await loadDoctorModel(DOCTOR_MODEL)
//       this.d.parts.forEach(p => {
//         p.visible = false // hide the box doctor, keep shadow + shield aura
//       })
//       this.d.group.add(m.root)
//       this.model = m
//       if (this.skin) m.tint(this.skin)
//     } catch (e) {
//       console.warn('Doctor GLB not loaded, using the built-in character:', e)
//     }
//   }

//   /* ---------- public API ---------- */
//   setSkin (s: Skin) {
//     applySkin(this.d, s);
//     this.skin = s;
//     this.model?.tint(s);
//   }
//   toIdle () {
//     this.reset()
//     this.machine = null
//     this.mode = 'idle'
//     this.emitHud()
//   }
//   setBrand (b: Brand | null) {
//     this.brand = b ? makeBrandAssets(b) : null
//   }
//   /** Begins a 3-2-1 countdown, then the machine's timer starts. Ignored while a run is already live (no duplicate timers). */
//   start (rules: MissionRules): boolean {
//     if (['count', 'run', 'event', 'pause'].includes(this.mode)) return false
//     this.reset()
//     this.machine = new MissionMachine(rules, {
//       onQuiz: i => this.ev.onQuiz(i),
//       onEnd: e => {
//         this.pendingEnd = e
//         this.overT = 0
//         if (e.outcome === 'won')
//           this.fx.emit(new THREE.Vector3(this.s.x, 1.4, 0), 0x22e4ff, 40)
//       }
//     })
//     this.mode = 'count'
//     this.cd = 3
//     this.cdn = -1
//     this.emitHud()
//     return true
//   }
//   togglePause () {
//     if (this.mode === 'run') {
//       this.mode = 'pause'
//       this.ev.onPause(true)
//     } else if (this.mode === 'pause') {
//       this.mode = 'run'
//       this.ev.onPause(false)
//     }
//   }
//   /** Called once the server has recorded the quiz answer: resumes the run, or finishes it after the final checkpoint. */
//   answerQuiz (correct: boolean) {
//     const m = this.machine
//     if (!m || this.mode !== 'event') return
//     m.quizAnswered(correct)
//     this.s.inv = 2
//     this.mode = m.state === 'RUNNING' ? 'run' : 'over'
//     this.emitHud()
//   }
//   act (a: Action) {
//     if (this.mode !== 'run') return
//     const s = this.s
//     if (a === 'l') s.lane = Math.max(0, s.lane - 1)
//     if (a === 'r') s.lane = Math.min(2, s.lane + 1)
//     if (a === 'u') {
//       if (s.y === 0) s.vy = 10
//       else s.buf = 0.15
//     }
//     if (a === 'd') {
//       s.slide = 0.7
//       if (s.y > 0) s.vy = -16
//     }
//   }
//   dispose () {
//     cancelAnimationFrame(this.raf)
//     this.cleanup.forEach(f => f())
//     this.R.dispose()
//     this.model?.dispose();
//   }

//   /* ---------- internals ---------- */
//   private reset () {
//     this.ents.forEach(e => this.S.remove(e.m))
//     this.ents = []
//     this.s = fresh()
//     this.acc = 0
//     this.overT = 0
//     this.pendingEnd = null
//     this.goT = 0
//   }
//   private emitHud () {
//     const s = this.s,
//       m = this.machine,
//       r = m?.rules ?? IDLE_RULES
//     this.ev.onHud({
//       state: m?.state ?? 'READY',
//       hp: m?.health ?? r.maxHealth,
//       maxHp: r.maxHealth,
//       score: m ? m.liveScore() : 0,
//       dist: Math.floor(s.dist),
//       pills: m?.pills ?? 0,
//       target: r.target,
//       time: m ? Math.ceil(m.remaining) : r.timeLimit,
//       timeLimit: r.timeLimit,
//       streak: s.streak,
//       shield: s.shield,
//       mult: s.mult,
//       count: this.mode === 'count' ? this.cdn : this.goT > 0 ? 0 : null
//     })
//   }
//   private resize = () => {
//     this.R.setSize(innerWidth, innerHeight)
//     this.cam.aspect = innerWidth / innerHeight
//   }
//   private bindInput () {
//     const keys: Record<string, Action> = {
//       ArrowLeft: 'l',
//       ArrowRight: 'r',
//       ArrowUp: 'u',
//       ArrowDown: 'd',
//       a: 'l',
//       d: 'r',
//       w: 'u',
//       s: 'd'
//     }
//     const kd = (e: KeyboardEvent) => {
//       // Never hijack typing: forms (login, signup, admin) need every letter, including W/A/S/D/P.
//       const t = e.target as HTMLElement | null
//       if (
//         t &&
//         (t.tagName === 'INPUT' ||
//           t.tagName === 'TEXTAREA' ||
//           t.tagName === 'SELECT' ||
//           t.isContentEditable)
//       )
//         return
//       if (e.ctrlKey || e.metaKey || e.altKey) return
//       if (this.mode !== 'run' && this.mode !== 'pause') return // keys only control a live run
//       const k = keys[e.key]
//       if (k) {
//         e.preventDefault()
//         this.act(k)
//       }
//       if (e.key === 'Escape' || e.key === 'p') this.togglePause()
//     }
//     let sx = 0,
//       sy = 0,
//       fired = true
//     const ts = (e: TouchEvent) => {
//       sx = e.touches[0].clientX
//       sy = e.touches[0].clientY
//       fired = false
//     }
//     const tm = (e: TouchEvent) => {
//       if (fired) return
//       const t = e.touches[0],
//         dx = t.clientX - sx,
//         dy = t.clientY - sy
//       if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
//       fired = true
//       this.act(
//         Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u'
//       )
//     }
//     const vc = () => {
//       if (document.hidden && this.mode === 'run') this.togglePause()
//     }
//     addEventListener('keydown', kd)
//     addEventListener('touchstart', ts, { passive: true })
//     addEventListener('touchmove', tm, { passive: true })
//     addEventListener('resize', this.resize)
//     document.addEventListener('visibilitychange', vc)
//     this.cleanup.push(() => {
//       removeEventListener('keydown', kd)
//       removeEventListener('touchstart', ts)
//       removeEventListener('touchmove', tm)
//       removeEventListener('resize', this.resize)
//       document.removeEventListener('visibilitychange', vc)
//     })
//   }
//   private add (t: EntType, l: number, z: number) {
//     const m = createEntity(t, this.brand)
//     m.position.x = LANES[l]
//     m.position.z = z
//     this.S.add(m)
//     this.ents.push({ t, l, m })
//   }
//   private spawn () {
//     const z = -95,
//       free = [0, 1, 2],
//       n = Math.random() < 0.35 ? 2 : 1
//     for (let i = 0; i < n; i++)
//       this.add(
//         Math.random() < 0.5 ? 'virus' : 'bact',
//         free.splice((Math.random() * free.length) | 0, 1)[0],
//         z
//       )
//     const k = free[(Math.random() * free.length) | 0],
//       r = Math.random()
//     if (r < 0.08) this.add('shield', k, z)
//     else if (r < 0.15) this.add('x2', k, z)
//     else for (let i = 0; i < 4; i++) this.add('pill', k, z - i * 2.2)
//   }
//   private floatAt (p: THREE.Vector3, text: string, c: string) {
//     const v = this.tmpV.copy(p).project(this.cam)
//     this.ev.onFloat(
//       text,
//       ((v.x + 1) / 2) * innerWidth,
//       ((1 - v.y) / 2) * innerHeight,
//       c
//     )
//   }
//   private hurt () {
//     const s = this.s
//     if (s.inv > 0) return
//     s.streak = 0
//     this.fx.emit(
//       new THREE.Vector3(s.x, 1.2, 0),
//       s.shield ? 0x3b82ff : 0xff3d6e,
//       18
//     )
//     if (navigator.vibrate) navigator.vibrate(70)
//     sfx(110, 0.3, 'square', 0.12)
//     if (s.shield) {
//       s.shield = false
//       s.inv = 1
//       return
//     }
//     this.machine?.damage()
//     s.inv = 1.3
//     this.shake = 0.5
//     this.ev.onHit()
//   }
//   private pick (e: Ent) {
//     const s = this.s,
//       p = e.m.position,
//       m = s.mult > 0 ? 2 : 1
//     if (e.t === 'pill') {
//       s.streak++
//       const v = (10 + Math.min(s.streak, 20)) * m
//       this.machine?.collect(1, v - 10, !!this.brand)
//       this.fx.emit(p, 0x22e4ff, 8)
//       sfx(660 + Math.min(s.streak, 12) * 40, 0.1)
//       this.floatAt(p, '+' + v, '#22e4ff')
//     } else if (e.t === 'shield') {
//       s.shield = true
//       sfx(520, 0.3)
//       this.fx.emit(p, 0x3b82ff, 16)
//       this.floatAt(p, '🛡 SHIELD', '#6aa8ff')
//     } else {
//       s.mult = 8
//       this.fx.emit(p, 0xffd24d, 16)
//       this.floatAt(p, '✨ x2', '#ffd24d')
//     }
//   }
//   private stepRun (dt: number) {
//     const s = this.s,
//       mm = this.machine!
//     s.speed = Math.min(32, 15 + s.dist * 0.004)
//     const d = s.speed * dt
//     s.dist += d
//     mm.advance(dt, s.dist)
//     this.acc += d
//     if (this.acc >= 10) {
//       this.acc = 0
//       this.spawn()
//     }
//     s.inv = Math.max(0, s.inv - dt)
//     s.mult = Math.max(0, s.mult - dt)
//     s.x += (LANES[s.lane] - s.x) * (1 - Math.exp(-dt * 13))
//     if (s.y > 0 || s.vy > 0) {
//       s.vy -= 28 * dt
//       s.y += s.vy * dt
//       if (s.y <= 0) {
//         s.y = 0
//         s.vy = s.buf > 0 ? 10 : 0
//       }
//     }
//     s.slide = Math.max(0, s.slide - dt)
//     s.buf = Math.max(0, s.buf - dt)
//     for (let i = this.ents.length - 1; i >= 0; i--) {
//       const e = this.ents[i],
//         m = e.m
//       m.position.z += d
//       m.rotation.y += dt * (e.t === 'virus' ? 2 : 3)
//       if (e.t === 'bact') m.rotation.x += dt
//       if (m.position.z > 7) {
//         this.S.remove(m)
//         this.ents.splice(i, 1)
//         continue
//       }
//       if (Math.abs(m.position.z) < 0.7 && Math.abs(m.position.x - s.x) < 0.9) {
//         if (e.t === 'virus') {
//           if (s.y < 1) this.hurt()
//         } else if (e.t === 'bact') {
//           if (s.slide <= 0) this.hurt()
//         } else {
//           this.pick(e)
//           this.S.remove(m)
//           this.ents.splice(i, 1)
//         }
//       }
//     }
//     if (s.dist >= s.ms) {
//       this.ev.onBanner(
//         `${s.ms} m · ENTERING ${ZONES[(s.ms / 500 - 1) % ZONES.length]}`
//       )
//       s.ms += 500
//     }
//     mm.resolve() // objective / health / deadline / quiz checkpoint decisions happen in exactly one place
//     if (mm.state === 'QUIZ_PAUSED') this.mode = 'event'
//     else if (mm.state === 'WON' || mm.state === 'LOST') this.mode = 'over'
//     if (mm.state !== 'RUNNING') this.emitHud() // HUD shows the exact frozen/final values (e.g. 0:00 at the deadline)
//   }
//   private update (dt: number) {
//     this.tm += dt
//     const s = this.s
//     if (this.mode === 'count') {
//       this.cd -= dt
//       const n = Math.ceil(this.cd)
//       if (n !== this.cdn) {
//         this.cdn = n
//         if (n <= 0) this.goT = 0.7
//         this.emitHud()
//       }
//       if (this.cd <= 0) {
//         this.mode = 'run'
//         this.machine?.start()
//       }
//     }
//     if (this.goT > 0) {
//       this.goT -= dt
//       if (this.goT <= 0) this.emitHud()
//     }
//     if (this.mode === 'run') this.stepRun(dt)
//     if (this.mode === 'over' && this.pendingEnd) {
//       this.overT += dt
//       if (this.overT > 0.9) {
//         const e = this.pendingEnd
//         this.pendingEnd = null
//         this.machine?.toResults()
//         this.ev.onEnd(e)
//       }
//     }
//     const sp =
//         this.mode === 'run'
//           ? s.speed
//           : this.mode === 'over'
//           ? s.speed * 0.2
//           : this.mode === 'idle'
//           ? 3
//           : this.mode === 'count'
//           ? 7
//           : 0,
//       dz = sp * dt
//     this.animate(dt, sp, dz)
//     this.emitT += dt
//     if (this.mode === 'run' && this.emitT > 0.08) {
//       this.emitT = 0
//       this.emitHud()
//     }
//   }
//   private animate (dt: number, sp: number, dz: number) {
//     const w = this.w,
//       d = this.d,
//       s = this.s,
//       tm = this.tm
//     w.rbcs.forEach(m => {
//       m.position.z += dz * 0.9
//       m.rotation.x += dt * 0.5
//       if (m.position.z > 8) placeRbc(m, -125)
//     })
//     w.dashes.forEach(m => {
//       m.position.z += dz
//       if (m.position.z > 6) m.position.z -= 168
//     })
//     for (let i = 0; i < POINT_COUNT; i++) {
//       w.pa[i * 3 + 2] += dz * 1.1
//       if (w.pa[i * 3 + 2] > 8) w.pa[i * 3 + 2] = -125
//     }
//     w.points.attributes.position.needsUpdate = true
//     w.tunnel.rotation.z += dt * 0.02
//     w.tex.offset.y -= (dz / 220) * 26
//     const hb = Math.pow(Math.max(0, Math.sin(tm * 5.2)), 6)
//     ;(this.S.fog as THREE.FogExp2).density = 0.024 + hb * 0.004
//     this.light.intensity = 1.6 + hb * 0.9
//     w.tunnel.material.emissiveIntensity = 1 + hb * 1.3
//     if (this.mode === 'run') {
//       if (hb > 0.9 && !this.hbOn) {
//         this.hbOn = true
//         sfx(55, 0.18, 'sine', 0.3)
//       } else if (hb < 0.3) this.hbOn = false
//     }
//     this.fx.update(dt, dz)

//     const live =
//       this.mode === 'run' || this.mode === 'idle' || this.mode === 'count'
//     if (live) this.runT += dt * (sp * 0.55)
//     const x = s.x,
//       y = s.y,
//       sl = s.slide > 0,
//       air = y > 0.05,
//       sw = air ? 0 : Math.sin(this.runT) * 0.95,
//       k = 1 - Math.exp(-dt * 20)
//     const mdl = this.model
//     if (mdl) {
//       // GLB character: animation clips drive the limbs
//       const pose: Pose = air
//         ? 'jump'
//         : sl
//         ? 'slide'
//         : this.mode === 'idle'
//         ? 'idle'
//         : 'run'
//       mdl.setPose(pose)
//       mdl.update(dt, s.speed, !live)
//     } else {
//       // built-in box character
//       d.legL.rotation.x += ((air ? -0.7 : sw) - d.legL.rotation.x) * k
//       d.legR.rotation.x += ((air ? 0.5 : -sw) - d.legR.rotation.x) * k
//       d.armL.rotation.x += ((air ? -2.4 : -sw) - d.armL.rotation.x) * k
//       d.armR.rotation.x += ((air ? -2.4 : sw) - d.armR.rotation.x) * k
//     }
//     d.group.position.set(
//       x,
//       y +
//         (sl && !mdl ? 0.15 : 0) +
//         (!mdl && live && !air && !sl ? Math.abs(Math.sin(this.runT)) * 0.09 : 0),
//       0
//     )
//     // lean forward when sliding (only if the model has no slide clip of its own)
//     d.group.rotation.x +=
//       ((sl && !mdl?.has.slide ? -1.2 : mdl ? 0 : 0.14) - d.group.rotation.x) * k
//     d.group.rotation.z = (LANES[s.lane] - s.x) * 0.14
//     d.group.visible = !(s.inv > 0 && Math.floor(tm * 20) % 2 === 0)
//     d.aura.visible = s.shield
//     const shm = d.shadow.material as THREE.MeshBasicMaterial
//     d.shadow.position.x = x
//     d.shadow.scale.setScalar(Math.max(0.35, 1 - y * 0.22))
//     shm.opacity = 0.5 * d.shadow.scale.x
//     this.light.position.set(x, 3, 2)

//     this.shake = Math.max(0, this.shake - dt)
//     const sk = this.shake * 0.4,
//       cs = 1 - Math.exp(-dt * 7)
//     this.camX += (x * 0.6 - this.camX) * cs
//     const tf =
//       (innerWidth < innerHeight ? 82 : 68) +
//       (this.mode === 'run' ? (s.speed - 15) * 0.4 : 0)
//     this.cam.fov += (tf - this.cam.fov) * cs
//     this.cam.updateProjectionMatrix()
//     this.cam.position.set(
//       this.camX + (Math.random() - 0.5) * sk,
//       3.4 + y * 0.25 + (Math.random() - 0.5) * sk,
//       6.2
//     )
//     this.cam.lookAt(this.camX * 0.5, 1.2, -8)
//     this.hv +=
//       ((this.mode === 'idle' ? 1 : 0) - this.hv) * (1 - Math.exp(-dt * 3))
//     const hv = this.hv
//     w.plat.visible = hv > 0.02
//     w.plat.scale.setScalar(Math.max(0.01, hv))
//     w.plat.rotation.z += dt
//     d.group.rotation.y = hv * (Math.PI - 0.5)
//     if (hv > 0.01) {
//       this.cam.position.lerp(HERO_CAM, hv)
//       this.cam.lookAt(
//         this.tmpV.set(this.camX * 0.5, 1.2, -8).lerp(HERO_LOOK, hv)
//       )
//     }
//   }
//   private loop = (t: number) => {
//     this.raf = requestAnimationFrame(this.loop)
//     let left = Math.min(0.5, (t - this.last) / 1000)
//     this.last = t
//     // Fixed small sub-steps: mission time follows the REAL clock even at low FPS (so slow devices are not penalised against the server deadline)
//     // and fast obstacles can never be skipped between two frames.
//     while (left > 1e-6) {
//       const step = Math.min(0.025, left)
//       this.update(step)
//       left -= step
//     }
//     this.R.render(this.S, this.cam)
//   }
// }