import mongoose from "mongoose";

// One row per (batch, student). A student may belong to many batches.
const batchMembershipSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    joinedVia: { type: String, enum: ["teacher", "code", "invite"], default: "teacher" },
    status: { type: String, enum: ["active", "removed"], default: "active" },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

batchMembershipSchema.index({ batchId: 1, studentId: 1 }, { unique: true });
batchMembershipSchema.index({ studentId: 1, status: 1 });
batchMembershipSchema.index({ batchId: 1, status: 1 });

export default mongoose.model("BatchMembership", batchMembershipSchema);
