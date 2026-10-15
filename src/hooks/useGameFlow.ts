import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { GameEngine, type Action } from '../engine/GameEngine'
import { api, ApiError, errMsg } from '../api/client'
import type {
  AttemptResult,
  Brand,
  MissionInfo,
  QuizCheckpoint,
  ServerResult,
  SessionStart
} from '../api/types'
import type { RunSummary } from '../../shared/mission'
import { SHOP } from '../../shared/rules'
import { SKINS } from '../data/config'
import { useProfile } from '../store/profile'
import { useAuth } from '../store/auth'
import type { HudState, Screen } from '../types'
import type { WorldId } from '../data/worlds'

export interface FloatText {
  id: number
  t: string
  x: number
  y: number
  c: string
}
export type QuizState = { index: number; data?: QuizCheckpoint; error?: string }
export type ResultState =
  | { status: 'saving' }
  | {
      status: 'ok'
      data: ServerResult
      mission: MissionInfo
      challengeId: string | null
    }
  | {
      status: 'error'
      message: string
      retryable: boolean
      mission: MissionInfo
      challengeId: string | null
    }
export interface Briefing {
  mission: MissionInfo
  challengeId?: string
}

const INITIAL_HUD: HudState = {
  state: 'READY',
  hp: 100,
  maxHp: 100,
  score: 0,
  dist: 0,
  pills: 0,
  target: 0,
  time: 180,
  timeLimit: 180,
  streak: 0,
  shield: false,
  mult: 0,
  count: null
}
let uid = 0

/**
 * Connects the Three.js engine, the shared MissionMachine and the server:
 * start session -> run -> quiz checkpoints (server-recorded) -> submit summary -> server-validated result.
 */
export function useGameFlow (canvasRef: RefObject<HTMLCanvasElement>) {
  const { profile, patch } = useProfile()
  const { progress, setProgress } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')
  const [hud, setHud] = useState<HudState>(INITIAL_HUD)
  const [flash, setFlash] = useState(false)
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(
    null
  )
  const [floats, setFloats] = useState<FloatText[]>([])
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [quiz, setQuiz] = useState<QuizState | null>(null)
  const [result, setResult] = useState<ResultState>({ status: 'saving' })
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [selectedWorld, setSelectedWorld] = useState<WorldId>('Bloodstream')
  const engine = useRef<GameEngine | null>(null)
  const startingRef = useRef(false)
  const session = useRef<SessionStart | null>(null)
  const summary = useRef<RunSummary | null>(null)
  const setProgressRef = useRef(setProgress)
  setProgressRef.current = setProgress

  const loadQuiz = useCallback(async (index: number) => {
    const s = session.current
    if (!s) return
    setQuiz({ index })
    try {
      const r = await api<{ checkpoint: QuizCheckpoint }>(
        `/quiz/checkpoint?sessionId=${s.sessionId}&index=${index}`
      )
      setQuiz({ index, data: r.checkpoint })
    } catch (e) {
      setQuiz({ index, error: errMsg(e) })
    }
  }, [])

  /** Sends the run summary; the SERVER decides outcome, score, stars, rewards and unlocks. Safe to retry (idempotent). */
  const submitResult = useCallback(async () => {
    const s = session.current,
      sum = summary.current
    if (!s || !sum) return
    setResult({ status: 'saving' })
    try {
      const data = await api<ServerResult>(
        `/game-sessions/${s.sessionId}/complete`,
        {
          body: {
            outcome: sum.outcome,
            reason: sum.reason,
            stats: {
              activeSeconds: sum.activeSeconds,
              distance: sum.distance,
              pills: sum.pills,
              brandedPills: sum.brandedPills,
              bonusPoints: Math.round(sum.bonusPoints),
              collisions: sum.collisions,
              hpRemaining: sum.hpRemaining
            }
          }
        }
      )
      setProgressRef.current(data.progress)
      setResult({
        status: 'ok',
        data,
        mission: s.mission,
        challengeId: s.challengeId
      })
    } catch (e) {
      setResult({
        status: 'error',
        message: errMsg(e),
        retryable:
          e instanceof ApiError && (e.code === 'network' || e.status >= 500),
        mission: s.mission,
        challengeId: s.challengeId
      })
    }
  }, [])

  useEffect(() => {
    const e = new GameEngine(canvasRef.current!, {
      onHud: setHud,
      onHit: () => {
        setFlash(true)
        setTimeout(() => setFlash(false), 150)
      },
      onBanner: text => setBanner({ id: ++uid, text }),
      onFloat: (t, x, y, c) => {
        const id = ++uid
        setFloats(f => [...f, { id, t, x, y, c }])
        setTimeout(() => setFloats(f => f.filter(i => i.id !== id)), 800)
      },
      onPause: p => setScreen(p ? 'pause' : 'game'),
      onQuiz: index => {
        setScreen('event')
        void loadQuiz(index)
      },
      onEnd: sum => {
        summary.current = sum
        setScreen('results')
        void submitResult()
      }
    })
    engine.current = e
    return () => e.dispose()
  }, [canvasRef, loadQuiz, submitResult])

  const ownedSkin = (i: number) =>
    SKINS[i]?.shopId == null || !!progress?.inventory.includes(SKINS[i].shopId!)
  useEffect(() => {
    engine.current?.setSkin(SKINS[ownedSkin(profile.skin) ? profile.skin : 0])
  }, [profile.skin, progress?.inventory]) // eslint-disable-line

  const startMission = useCallback(
    async (m: MissionInfo, challengeId?: string) => {
      if (startingRef.current) return // a mission starts once: double taps cannot create a second timer
      startingRef.current = true
      setStarting(true)
      setStartError(null)
      try {
        const e = engine.current!
        e.toIdle()
        // Apply world scene before the session starts
        e.setWorld(selectedWorld)
        const s = await api<SessionStart>('/game-sessions/start', {
          body: { missionId: m.id, challengeId }
        })
        session.current = s
        summary.current = null
        setBrand(s.brand)
        e.setBrand(s.brand)
        const k = s.mission
        if (
          e.start({
            timeLimit: k.timeLimit,
            maxHealth: k.maxHealth,
            target: k.target,
            quizAt: k.quizAt,
            requireFinalQuiz: k.requireFinalQuiz
          })
        )
          setScreen('game')
      } catch (err) {
        setStartError(errMsg(err))
      } finally {
        startingRef.current = false
        setStarting(false)
      }
    },
    [selectedWorld]
  )

  const go = useCallback((s: Screen) => {
    engine.current?.toIdle()
    setStartError(null)
    setScreen(s)
  }, [])
  const openBriefing = useCallback(
    (mission: MissionInfo, challengeId?: string) => {
      engine.current?.toIdle()
      setStartError(null)
      setBriefing({ mission, challengeId })
      setScreen('briefing')
    },
    []
  )
  const submitAnswer = useCallback(
    (selected: number, ms: number) => {
      const s = session.current!
      return api<AttemptResult>('/quiz/attempts', {
        body: {
          sessionId: s.sessionId,
          checkpointIndex: quiz!.index,
          selectedIndex: selected,
          responseMs: ms
        }
      })
    },
    [quiz]
  )
  const finishQuiz = useCallback((correct: boolean) => {
    engine.current?.answerQuiz(correct)
    setQuiz(null)
    setScreen('game')
  }, [])
  const act = useCallback((a: Action) => engine.current?.act(a), [])
  const togglePause = useCallback(() => engine.current?.togglePause(), [])

  return {
    screen,
    go,
    hud,
    flash,
    banner,
    floats,
    brand,
    briefing,
    openBriefing,
    startMission,
    starting,
    startError,
    quiz,
    loadQuiz,
    submitAnswer,
    finishQuiz,
    result,
    submitResult,
    act,
    togglePause,
    profile,
    patch,
    setScreen,
    selectedWorld,
    setSelectedWorld
  }
}
export { SHOP }
