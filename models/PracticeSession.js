import mongoose from "mongoose";

const practiceSessionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "Self Practice Session",
      trim: true,
    },
    mode: {
      type: String,
      enum: ["practice", "test"],
      default: "practice",
    },
    subject: {
      type: String,
      default: "ICT",
      trim: true,
    },
    chapter: {
      type: String,
      default: "All Chapters",
      trim: true,
    },
    topic: {
      type: String,
      default: "All Topics",
      trim: true,
    },
    difficulty: {
      type: String,
      default: "mixed",
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
    questions: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Question",
          required: true,
        },
        studentAnswer: {
          type: String,
          default: "",
        },
        correctAnswer: {
          type: String,
          default: "",
        },
        isCorrect: {
          type: Boolean,
          default: false,
        },
      },
    ],
    totalQuestions: {
      type: Number,
      default: 0,
    },
    score: {
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
    unattemptedCount: {
      type: Number,
      default: 0,
    },
    timeSpentSeconds: {
      type: Number,
      default: 0,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

practiceSessionSchema.index({ studentId: 1, createdAt: -1 });

export default mongoose.model("PracticeSession", practiceSessionSchema);
