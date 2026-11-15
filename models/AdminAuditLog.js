import mongoose from "mongoose";

// Append-only record of administrative changes (who changed what, before → after).
const adminAuditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, enum: ["platform", "organization"], required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ organizationId: 1, createdAt: -1 });

export default mongoose.model("AdminAuditLog", adminAuditLogSchema);
