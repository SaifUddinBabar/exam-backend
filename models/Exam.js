import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  title: String,
  questions: [String],
  examCode: String,
  duration: Number,

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 172800 // 🔥 2 days
  }
});

export default mongoose.model("Exam", examSchema);