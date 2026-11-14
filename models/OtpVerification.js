import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["registration", "password_reset", "login"],
      default: "registration",
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    resendAvailableAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB automatic TTL deletion
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

otpVerificationSchema.index({ phone: 1, purpose: 1 });

const OtpVerification = mongoose.model("OtpVerification", otpVerificationSchema);
export default OtpVerification;
