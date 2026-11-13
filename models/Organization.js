import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    code: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "trial"],
      default: "active",
    },
    plan: {
      type: String,
      enum: ["free", "basic", "premium", "enterprise"],
      default: "free",
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
      default: "Dhaka",
    },
    settings: {
      allowPublicRegistration: {
        type: Boolean,
        default: false,
      },
      brandColor: {
        type: String,
        default: "#2563eb",
      },
      logoUrl: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  }
);

organizationSchema.index({ status: 1 });

export default mongoose.model("Organization", organizationSchema);
