import mongoose from "mongoose";

const organizationMembershipSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["org_admin", "teacher", "student"],
      required: true,
      default: "student",
    },
    studentRoll: {
      type: String,
      trim: true,
      default: "",
    },
    batchIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
      },
    ],
    status: {
      type: String,
      enum: ["active", "pending", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Compounded unique index: A user has one membership role per organization
organizationMembershipSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true }
);

organizationMembershipSchema.index({ organizationId: 1, role: 1 });
organizationMembershipSchema.index({ organizationId: 1, studentRoll: 1 });

export default mongoose.model("OrganizationMembership", organizationMembershipSchema);
