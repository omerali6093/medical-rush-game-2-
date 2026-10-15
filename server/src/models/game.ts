import { Schema, model, Types } from 'mongoose'

const missionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    world: { type: String, default: 'Bloodstream' },
    level: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    difficulty: { type: Number, min: 1, max: 3, default: 1 },
    timeLimit: { type: Number, default: 180, min: 30, max: 180 },
    maxHealth: { type: Number, default: 100 },
    objective: {
      type: { type: String, default: 'collect' },
      target: { type: Number, required: true }
    },
    quizAt: { type: [Number], default: [30, 60, 90, 120, 150, 175] },
    quizSeconds: { type: Number, default: 12 },
    requireFinalQuiz: { type: Boolean, default: false },
    minStars: { type: Number, default: 1 },
    reward: {
      xp: { type: Number, default: 120 },
      coins: { type: Number, default: 30 },
      quizXp: { type: Number, default: 40 },
      maxXp: { type: Number, default: 600 },
      maxCoins: { type: Number, default: 200 }
    },
    status: { type: String, enum: ['draft', 'active'], default: 'active' }
  },
  { timestamps: true }
)

const sessionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    mission: { type: Types.ObjectId, ref: 'Mission', required: true },
    missionLevel: Number,
    challenge: { type: Types.ObjectId, ref: 'Challenge', default: null },
    campaign: { type: Types.ObjectId, ref: 'Campaign', default: null },
    status: {
      type: String,
      enum: [
        'active',
        'finalizing',
        'completed',
        'rejected',
        'abandoned',
        'expired'
      ],
      default: 'active'
    },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    finalizingAt: Date,
    completedAt: Date,
    quizPlan: [{ type: Types.ObjectId, ref: 'QuizQuestion' }],
    outcome: { type: String, enum: ['won', 'lost', null], default: null },
    reason: { type: String, default: null },
    score: { type: Number, default: 0 },
    stars: { type: Number, default: 0 },
    xpAwarded: { type: Number, default: 0 },
    coinsAwarded: { type: Number, default: 0 },
    activeSeconds: { type: Number, default: 0 },
    pills: { type: Number, default: 0 },
    brandedPills: { type: Number, default: 0 },
    collisions: { type: Number, default: 0 },
    quizCorrect: { type: Number, default: 0 },
    quizAnswered: { type: Number, default: 0 },
    validation: {
      status: { type: String, default: 'pending' },
      flags: { type: [String], default: [] }
    },
    result: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: true, minimize: false }
)
sessionSchema.index({ user: 1, status: 1 })
sessionSchema.index({ challenge: 1, status: 1 })
sessionSchema.index({ status: 1, outcome: 1, completedAt: -1 })

const progressSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    xp: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    unlockedLevel: { type: Number, default: 1 },
    missions: { type: Schema.Types.Mixed, default: {} },
    achievements: { type: [String], default: [] },
    inventory: { type: [String], default: [] },
    personalBest: { type: Number, default: 0 },
    totals: {
      runs: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      pills: { type: Number, default: 0 },
      quizAnswered: { type: Number, default: 0 },
      quizCorrect: { type: Number, default: 0 },
      collisions: { type: Number, default: 0 },
      playSeconds: { type: Number, default: 0 }
    },
    rev: { type: Number, default: 0 },
    appliedSessions: { type: [String], default: [] }
  },
  { timestamps: true, minimize: false }
)

const transactionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['xp', 'coins', 'spend'], required: true },
    amount: { type: Number, required: true },
    reason: String,
    session: { type: Types.ObjectId, ref: 'GameSession', default: null },
    idempotencyKey: { type: String, required: true, unique: true }
  },
  { timestamps: true }
)
transactionSchema.index({ user: 1, createdAt: -1 })

export const Mission = model('Mission', missionSchema)
export const GameSession = model('GameSession', sessionSchema)
export const PlayerProgress = model('PlayerProgress', progressSchema)
export const Transaction = model('Transaction', transactionSchema)
