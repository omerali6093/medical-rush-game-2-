import { Schema, model, Types } from 'mongoose'

const questionSchema = new Schema(
  {
    scenario: { type: String, required: true },
    question: { type: String, required: true },
    options: { type: [String], validate: (v: string[]) => v.length === 3 },
    correctIndex: { type: Number, required: true, min: 0, max: 2 },
    explanation: { type: String, required: true },
    difficulty: { type: Number, min: 1, max: 3, default: 1 },
    topics: { type: [String], default: [] },
    vitals: { hr: Number, bp: String, spo2: Number },
    /** Only 'approved' questions are ever served. Approval must come from a qualified medical reviewer. */
    status: {
      type: String,
      enum: ['draft', 'approved', 'retired'],
      default: 'draft'
    },
    reviewedBy: { type: Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    sampleContent: { type: Boolean, default: false },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
)
questionSchema.index({ status: 1, difficulty: 1 })

const attemptSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    session: { type: Types.ObjectId, ref: 'GameSession', required: true },
    checkpointIndex: { type: Number, required: true },
    question: { type: Types.ObjectId, ref: 'QuizQuestion', required: true },
    selectedIndex: { type: Number, required: true },
    correct: { type: Boolean, required: true },
    timedOut: { type: Boolean, default: false },
    responseMs: { type: Number, default: 0 }
  },
  { timestamps: true }
)
attemptSchema.index({ session: 1, checkpointIndex: 1 }, { unique: true })
attemptSchema.index({ user: 1, createdAt: -1 })

export const QuizQuestion = model('QuizQuestion', questionSchema)
export const QuizAttempt = model('QuizAttempt', attemptSchema)
