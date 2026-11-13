import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Batch name is required"],
      trim: true,
    },
    academicYear: {
      type: String,
      trim: true,
      default: "2026",
    },
    program: {
      type: String,
      trim: true,
      default: "General",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

batchSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export default mongoose.model("Batch", batchSchema);
