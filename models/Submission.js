import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema({
  examCode: String,
  name: String,
  roll: String,
  score: Number
});

export default mongoose.model("Submission", submissionSchema);