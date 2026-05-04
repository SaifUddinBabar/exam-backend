import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  question: String,
  options: [String],
  correctAnswer: String,
  chapter: String,
  subject: String,
  tutorId: String,
  image: {
  type: String
}
  
});

export default mongoose.model("Question", questionSchema);