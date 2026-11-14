import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["teacher", "student"],
      required: true,
      default: "student",
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    recipientPhone: {
      type: String,
      trim: true,
      default: "",
    },
    recipientEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    maxUses: {
      type: Number,
      default: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "revoked", "expired"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

invitationSchema.index({ organizationId: 1, status: 1 });

const Invitation = mongoose.model("Invitation", invitationSchema);
export default Invitation;
