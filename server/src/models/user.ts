import { Schema, model, Types } from 'mongoose'

export const PROFESSIONS = [
  'doctor',
  'pharmacist',
  'student',
  'nurse',
  'other'
] as const
export const ROLES = ['player', 'org_admin', 'admin'] as const

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    displayNameLower: { type: String, required: true, unique: true },
    phone: { type: String },
    profession: { type: String, enum: PROFESSIONS, default: 'doctor' },
    role: { type: String, enum: ROLES, default: 'player' },
    /** Organization this user administers (org_admin). */
    organization: { type: Types.ObjectId, ref: 'Organization', default: null },
    memberOf: [{ type: Types.ObjectId, ref: 'Organization' }],
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, default: null },
    resetExpires: { type: Date, default: null },
    termsAcceptedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
)

export const User = model('User', userSchema)
