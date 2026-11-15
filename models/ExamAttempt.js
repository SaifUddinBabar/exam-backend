import mongoose from "mongoose";

// Server-side record of a running exam. The deadline is fixed when the
// student starts, so refreshing or changing device cannot extend the timer.
const examAttemptSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    examCode: { type: String, required: true, uppercase: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    attemptNumber: { type: Number, default: 1 },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    // { [questionId]: chosen option text }
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },
    savedAt: { type: Date, default: null },
    status: { type: String, enum: ["in_progress", "submitted"], default: "in_progress" },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Submission", default: null },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

examAttemptSchema.index({ examId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
examAttemptSchema.index({ studentId: 1, status: 1 });

export default mongoose.model("ExamAttempt", examAttemptSchema);
