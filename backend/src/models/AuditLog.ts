import mongoose from "mongoose"

export interface IAuditLog {
  _id:           mongoose.Types.ObjectId
  school_id:     mongoose.Types.ObjectId
  actor_id:      mongoose.Types.ObjectId
  actor_role:    string
  action:        string
  resource_type: string
  resource_id:   string
  before:        unknown
  after:         unknown
  ip:            string | null
  timestamp:     Date
}

const auditLogSchema = new mongoose.Schema<IAuditLog>({
  school_id:     { type: mongoose.Schema.Types.ObjectId, required: true, ref: "School" },
  actor_id:      { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  actor_role:    { type: String, required: true },
  action:        { type: String, required: true },
  resource_type: { type: String, required: true },
  resource_id:   { type: String, required: true },
  before:        { type: mongoose.Schema.Types.Mixed, default: null },
  after:         { type: mongoose.Schema.Types.Mixed, default: null },
  ip:            { type: String, default: null },
  timestamp:     { type: Date, default: () => new Date() },
}, {
  versionKey: false,
})

// Compound index: admin views audit log for their school ordered by time
auditLogSchema.index({ school_id: 1, timestamp: -1 })
// Individual actor lookup (e.g. "what did this teacher do?")
auditLogSchema.index({ actor_id: 1, timestamp: -1 })
// TTL: auto-delete audit entries older than 2 years (DPDP Act data minimisation)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2 * 365 * 24 * 60 * 60 })

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model<IAuditLog>("AuditLog", auditLogSchema)
