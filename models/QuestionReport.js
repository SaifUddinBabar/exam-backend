import mongoose from "mongoose";

// A user flags a problematic question. The question itself is never changed
// by a report; the owner or an admin reviews it.
const questionReportSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: {
      type: String,
      enum: ["wrong_answer", "typo", "wrong_subject", "wrong_topic", "image_missing", "duplicate", "language", "other"],
      required: true,
    },
    note: { type: String, trim: true, default: "", maxlength: 1000 },
    status: { type: String, enum: ["open", "resolved", "dismissed"], default: "open", index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
questionReportSchema.index({ questionId: 1, reportedBy: 1, status: 1 });

export default mongoose.model("QuestionReport", questionReportSchema);
