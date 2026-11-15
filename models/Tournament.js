import mongoose from "mongoose";

// Daily tournament: one shared question set per day (Asia/Dhaka), one attempt per student.
const dailyTournamentSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, unique: true }, // YYYY-MM-DD
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    secondsPerQuestion: { type: Number, default: 30 },
  },
  { timestamps: true }
);

const entrySchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    answers: [
      {
        _id: false,
        index: Number,
        optionIndex: Number,
        correct: Boolean,
        points: Number,
        answeredAt: Date,
      },
    ],
    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
    timeMs: { type: Number, default: null },
    xpEarned: { type: Number, default: 0 },
  },
  { timestamps: true }
);
entrySchema.index({ day: 1, userId: 1 }, { unique: true });
// Leaderboard: covers the full sort (score, time, finish time) so nothing is sorted in memory.
entrySchema.index({ day: 1, score: -1, timeMs: 1, finishedAt: 1 });

export const DailyTournament = mongoose.model("DailyTournament", dailyTournamentSchema);
export const TournamentEntry = mongoose.model("TournamentEntry", entrySchema);
