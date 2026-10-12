import type { ACHIEVEMENTS } from '../../shared/rules'
export type Role = 'player' | 'org_admin' | 'admin'
export interface User {
  id: string
  email: string
  displayName: string
  profession: string
  role: Role
  organization: string | null
}
export interface Progress {
  xp: number
  coins: number
  level: number
  xpIntoLevel: number
  xpForNext: number
  unlockedLevel: number
  personalBest: number
  inventory: string[]
  totals: {
    runs: number
    wins: number
    pills: number
    quizAnswered: number
    quizCorrect: number
    collisions: number
    playSeconds: number
  }
  achievements: {
    key: typeof ACHIEVEMENTS[number]['key']
    title: string
    desc: string
    earned: boolean
  }[]
}
export interface Brand {
  campaignId: string
  name: string
  sponsor: string
  disclosure: string
  label: string
  color: string
  logoUrl: string | null
}
export interface MissionInfo {
  id: string
  key: string
  world: string
  level: number
  title: string
  description: string
  difficulty: number
  timeLimit: number
  maxHealth: number
  target: number
  quizAt: number[]
  quizSeconds: number
  requireFinalQuiz: boolean
  reward: { xp: number; coins: number }
  locked?: boolean
  completed?: boolean
  bestScore?: number
  bestStars?: number
  attempts?: number
}
export interface SessionStart {
  sessionId: string
  mission: MissionInfo
  brand: Brand | null
  challengeId: string | null
  expiresAt: string
}
export interface QuizCheckpoint {
  index: number
  id: string
  scenario: string
  question: string
  options: string[]
  vitals: { hr: number; bp: string; spo2: number } | null
  difficulty: number
  topics: string[]
  seconds: number
}
export interface AttemptResult {
  correct: boolean
  timedOut: boolean
  correctIndex: number
  explanation: string
  xpPreview: number
}
export interface ServerResult {
  outcome: 'won' | 'lost'
  reason: 'health' | 'timeout' | null
  score: number
  stars: number
  xp: number
  coins: number
  qualifying: boolean
  collisions: number
  pills: number
  brandedPills: number
  activeSeconds: number
  distance: number
  quiz: { answered: number; correct: number; accuracy: number }
  newBest: boolean
  levelBefore: number
  levelAfter: number
  unlocked: { id: string; level: number; title: string } | null
  nextMissionId: string | null
  newAchievements: string[]
  progress: Progress
  sponsor: { name: string; disclosure: string } | null
}
export interface ChallengeInfo {
  id: string
  title: string
  description: string
  missionId: string
  missionTitle?: string
  missionLevel: number
  startsAt: string
  endsAt: string
  status: 'scheduled' | 'open' | 'closing' | 'closed'
  maxParticipants: number
  participantCount: number
  maxAttempts: number
  minLevel: number
  joined: boolean
  rules: string[]
  finalized: boolean
  winners: { displayName: string; rank: number }[] | null
}
export interface Standing {
  rank: number
  userId: string
  displayName: string
  outcome: string
  score: number
  stars: number
  quizCorrect: number
  activeSeconds: number
  collisions: number
  pills: number
}
export interface Dashboard {
  progress: Progress
  quiz: {
    answered: number
    correct: number
    accuracy: number
    byTopic: {
      topic: string
      answered: number
      correct: number
      accuracy: number
    }[]
  }
  recent: {
    id: string
    mission: string
    level: number
    outcome: string
    score: number
    stars: number
    at: string
  }[]
  challenges: { id: string; title: string; status: string; endsAt: string }[]
}
