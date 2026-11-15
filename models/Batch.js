import mongoose from "mongoose";

// A coaching batch, e.g. "HSC 2027 — Science — Batch A".
// organizationId is optional: independent teachers own batches directly via ownerId.
const batchSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Batch name is required"],
      trim: true,
      maxlength: 120,
    },
    classLevel: { type: String, trim: true, default: "", maxlength: 40 }, // HSC, SSC, ...
    academicYear: {
      type: String,
      trim: true,
      default: "2026",
    },
    subject: { type: String, trim: true, default: "", maxlength: 60 },
    program: {
      type: String,
      trim: true,
      default: "General",
    },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    // Join code students can type to join. Unique across the platform.
    code: { type: String, trim: true, uppercase: true, default: undefined },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Names are unique per organization (org batches) or per owner (teacher batches).
// NOTE: production still has the legacy non-partial index "organizationId_1_name_1";
// scripts/migrations/001_batch_indexes.mjs drops it (collection was empty at audit time).
batchSchema.index({ organizationId: 1, name: 1 }, { name: "org_name_unique_partial", unique: true, partialFilterExpression: { organizationId: { $type: "objectId" } } });
batchSchema.index({ ownerId: 1, name: 1 }, { name: "owner_name_unique_partial", unique: true, partialFilterExpression: { ownerId: { $type: "objectId" } } });
batchSchema.index({ code: 1 }, { name: "code_unique_partial", unique: true, partialFilterExpression: { code: { $type: "string" } } });

export default mongoose.model("Batch", batchSchema);
