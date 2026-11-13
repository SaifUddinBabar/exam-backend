import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    examCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      default: null,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    roll: {
      type: String,
      required: true,
      trim: true,
    },
    score: {
      type: Number,
      required: true,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
    correctCount: {
      type: Number,
      default: 0,
    },
    wrongCount: {
      type: Number,
      default: 0,
    },
    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    attemptNumber: {
      type: Number,
      default: 1,
    },
    isFinal: {
      type: Boolean,
      default: true,
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

submissionSchema.index(
  { examId: 1, studentId: 1, attemptNumber: 1 },
  { unique: true, sparse: true }
);
submissionSchema.index({ examId: 1, roll: 1, attemptNumber: 1 }, { unique: true });
submissionSchema.index({ examId: 1, studentId: 1 });
submissionSchema.index({ examCode: 1, score: -1, createdAt: 1 });
submissionSchema.index({ organizationId: 1, createdAt: -1 });

export default mongoose.model("Submission", submissionSchema);
