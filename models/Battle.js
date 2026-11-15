import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    answer: { type: String, default: "" },
    correct: { type: Boolean, default: false },
    points: { type: Number, default: 0 },
    answeredAt: { type: Date, required: true },
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    joinedAt: { type: Date, default: () => new Date() },
    answers: { type: [answerSchema], default: [] },
    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: () => new Date() },
    ratingBefore: { type: Number, default: null },
    ratingAfter: { type: Number, default: null },
    xpEarned: { type: Number, default: 0 },
  },
  { _id: false }
);

// One 1v1 match. Every field that decides the result is written only by the server.
const battleSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ["random", "friend"], required: true },
    ranked: { type: Boolean, default: true },
    status: { type: String, enum: ["waiting", "active", "finished", "cancelled"], default: "waiting", index: true },
    roomCode: { type: String, uppercase: true, trim: true, default: undefined },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    filters: {
      className: { type: String, default: "" },
      subject: { type: String, default: "" },
      chapter: { type: String, default: "" },
      topic: { type: String, default: "" },
      difficulty: { type: String, default: "mixed" },
    },
    // Matchmaking key: battles with identical filters match each other.
    matchKey: { type: String, default: "" },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    secondsPerQuestion: { type: Number, default: 20 },
    players: { type: [playerSchema], default: [] },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isDraw: { type: Boolean, default: false },
    resultReason: { type: String, default: "" },
    expiresAt: { type: Date, default: null }, // waiting rooms expire
  },
  { timestamps: true }
);

battleSchema.index({ status: 1, mode: 1, matchKey: 1, createdAt: 1 });
battleSchema.index({ roomCode: 1 }, { unique: true, partialFilterExpression: { roomCode: { $type: "string" } } });
battleSchema.index({ "players.userId": 1, createdAt: -1 });

export default mongoose.model("Battle", battleSchema);
