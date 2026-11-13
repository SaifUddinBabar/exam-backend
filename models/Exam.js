import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    questions: [
      {
        type: String,
        required: true,
      },
    ],
    examCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 1,
    },
    // Multi-tenant scoping: null for public Examino model tests
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    negativeMarkPerWrong: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Submission & Scheduling Policy
    examType: {
      type: String,
      enum: ["practice", "scheduled", "coaching"],
      default: "practice",
    },
    allowRetake: {
      type: Boolean,
      default: false,
    },
    maxAttempts: {
      type: Number,
      default: 1,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    solutionReleaseTime: {
      type: Date,
      default: null,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

examSchema.index({ organizationId: 1, createdAt: -1 });

export default mongoose.model("Exam", examSchema);
