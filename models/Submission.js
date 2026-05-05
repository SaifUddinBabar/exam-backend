import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema({
  examCode: String,
  name: String,
  roll: String,
  score: Number,

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 172800 // 🔥 2 days
  }
});

export default mongoose.model("Submission", submissionSchema);