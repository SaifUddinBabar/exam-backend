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
    // Who may see / take the exam. Exams created before this field existed
    // have no `assignment` and are treated as visible to all students
    // (the previous behaviour) — see utils/access.js.
    assignment: {
      mode: { type: String, enum: ["all", "batches", "students"] },
      batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Batch" }],
      studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    subject: { type: String, trim: true, default: "" },
    // Soft delete: archived exams disappear from lists but keep their results.
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

examSchema.index({ organizationId: 1, createdAt: -1 });
examSchema.index({ authorId: 1, createdAt: -1 });
examSchema.index({ "assignment.mode": 1, "assignment.batchIds": 1 });
examSchema.index({ "assignment.studentIds": 1 });

export default mongoose.model("Exam", examSchema);
