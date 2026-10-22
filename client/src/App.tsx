import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGameFlow } from './hooks/useGameFlow'
import { useAuth } from './store/auth'
import { api } from './api/client'
import type { ChallengeInfo, MissionInfo } from './api/types'
import type { Screen } from './types'
import Home from './components/screens/Home'
import AuthScreen from './components/screens/AuthScreen'
import Worlds from './components/screens/Worlds'
import Missions from './components/screens/Missions'
import Briefing from './components/screens/Briefing'
import Dashboard from './components/screens/Dashboard'
import { ProfileScreen } from './components/screens/Info'
import Leaderboard from './components/screens/Leaderboard'
import Admin from './components/screens/Admin'
import Results from './components/screens/Results'
import Pause from './components/screens/Pause'
import Hud from './components/game/Hud'
import MedicalEvent from './components/game/MedicalEvent'

const PRIVATE: Screen[] = [
  'worlds',
  'missions',
  'briefing',
  'dashboard',
  'profile',
  'leaderboard',
  'admin'
]

export default function App () {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useGameFlow(canvasRef)
  const { user, progress, loading } = useAuth()
  // Route guard: protected screens need a signed-in user (the API enforces this again on every call).
  const screen: Screen =
    !loading && !user && PRIVATE.includes(g.screen) ? 'auth' : g.screen
  const inGame = screen === 'game' || screen === 'pause' || screen === 'event'

  const missionById = useCallback(
    async (id: string) =>
      (await api<{ mission: MissionInfo }>(`/missions/${id}`)).mission,
    []
  )
  const playNext = useCallback(async () => {
    const { missions } = await api<{ missions: MissionInfo[] }>('/missions')
    const open = missions.filter(m => !m.locked)
    g.openBriefing(open.find(m => !m.completed) || open[open.length - 1])
  }, [g])
  const playChallenge = useCallback(
    async (c: ChallengeInfo) =>
      g.openBriefing(await missionById(c.missionId), c.id),
    [g, missionById]
  )
  const retry = () => {
    if (g.result.status !== 'saving')
      void g.startMission(g.result.mission, g.result.challengeId ?? undefined)
  }
  const next = async (id: string) => g.openBriefing(await missionById(id))

  return (
    <>
      <canvas ref={canvasRef} />
      <motion.div
        id='flash'
        animate={{ opacity: g.flash ? 1 : 0 }}
        transition={{ duration: g.flash ? 0.05 : 0.4 }}
      />
      <AnimatePresence>
        {screen === 'home' && (
          <Home key='home' go={g.go} playNext={() => void playNext()} />
        )}
        {screen === 'auth' && <AuthScreen key='auth' go={g.go} />}
        {screen === 'worlds' && (
          <Worlds
            key='worlds'
            go={g.go}
            xp={progress?.xp ?? 0}
            onSelectWorld={g.setSelectedWorld}
          />
        )}
        {screen === 'missions' && (
          <Missions
            key='missions'
            go={g.go}
            onPick={m => g.openBriefing(m)}
            worldId={g.selectedWorld}
          />
        )}
        {screen === 'briefing' && g.briefing && (
          <Briefing
            key='briefing'
            mission={g.briefing.mission}
            challengeId={g.briefing.challengeId}
            starting={g.starting}
            error={g.startError}
            go={g.go}
            onStart={() =>
              void g.startMission(g.briefing!.mission, g.briefing!.challengeId)
            }
          />
        )}
        {screen === 'dashboard' && (
          <Dashboard
            key='dashboard'
            go={g.go}
            onContinue={() => void playNext()}
          />
        )}
        {screen === 'profile' && <ProfileScreen key='profile' go={g.go} />}
        {screen === 'leaderboard' && (
          <Leaderboard key='lb' go={g.go} onPlay={c => void playChallenge(c)} />
        )}
        {screen === 'admin' && <Admin key='admin' go={g.go} />}
        {screen === 'pause' && (
          <Pause
            key='pause'
            go={g.go}
            togglePause={g.togglePause}
            profile={g.profile}
            patch={g.patch}
          />
        )}
        {screen === 'event' && g.quiz && (
          <MedicalEvent
            key={`q${g.quiz.index}`}
            quiz={g.quiz}
            onRetry={() => void g.loadQuiz(g.quiz!.index)}
            onAnswer={g.submitAnswer}
            onContinue={g.finishQuiz}
          />
        )}
        {screen === 'results' && (
          <Results
            key='results'
            result={g.result}
            go={g.go}
            onRetry={retry}
            onNext={id => void next(id)}
            onResubmit={() => void g.submitResult()}
          />
        )}
      </AnimatePresence>
      {inGame && (
        <Hud
          hud={g.hud}
          floats={g.floats}
          banner={g.banner}
          profile={g.profile}
          brand={g.brand}
          act={g.act}
          togglePause={g.togglePause}
        />
      )}
    </>
  )
}
