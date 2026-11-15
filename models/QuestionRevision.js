import mongoose from "mongoose";

// Snapshot of a question *before* each edit, so original Bengali/English
// content can always be inspected or restored.
const questionRevisionSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    before: { type: mongoose.Schema.Types.Mixed, required: true },
    changedFields: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("QuestionRevision", questionRevisionSchema);
