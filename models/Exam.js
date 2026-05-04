import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  title: String,
  questions: [String], // question IDs
  examCode: String,
  duration: Number
});

export default mongoose.model("Exam", examSchema);