import { Schema, model, Types } from 'mongoose'

const orgSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    contactEmail: String,
    status: { type: String, enum: ['active', 'suspended'], default: 'active' }
  },
  { timestamps: true }
)

/** Logos (<=256 KB, PNG/JPEG/WebP only — never SVG) must be approved by a platform admin before they can be shown. */
const assetSchema = new Schema(
  {
    org: { type: Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    mime: { type: String, required: true },
    data: { type: String, required: true },
    size: Number,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    uploadedBy: { type: Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
)

const campaignSchema = new Schema(
  {
    org: { type: Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    sponsorName: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'paused', 'ended'],
      default: 'draft'
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    asset: { type: Types.ObjectId, ref: 'BrandAsset', default: null },
    collectible: {
      label: { type: String, default: 'Sponsored dose' },
      color: { type: String, default: '#22e4ff' }
    },
    /** Mandatory sponsorship disclosure shown on briefing, HUD and results. */
    disclosure: { type: String, required: true },
    allMissions: { type: Boolean, default: true },
    missions: { type: [Number], default: [] },
    approvedBy: { type: Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
)
campaignSchema.index({ status: 1, startsAt: 1, endsAt: 1 })

const auditSchema = new Schema(
  {
    actor: { type: Types.ObjectId, ref: 'User' },
    action: String,
    target: String,
    meta: Schema.Types.Mixed
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
)

const challengeSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    mission: { type: Types.ObjectId, ref: 'Mission', required: true },
    missionLevel: Number,
    organization: { type: Types.ObjectId, ref: 'Organization', default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    maxParticipants: { type: Number, default: 50, min: 2, max: 50 },
    maxAttempts: { type: Number, default: 3, min: 1, max: 10 },
    minLevel: { type: Number, default: 1 },
    participants: [{ type: Types.ObjectId, ref: 'User' }],
    participantCount: { type: Number, default: 0 },
    finalized: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)
challengeSchema.index({ endsAt: -1 })

export const Organization = model('Organization', orgSchema)
export const BrandAsset = model('BrandAsset', assetSchema)
export const Campaign = model('Campaign', campaignSchema)
export const AuditLog = model('AuditLog', auditSchema)
export const Challenge = model('Challenge', challengeSchema)
