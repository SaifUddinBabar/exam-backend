import mongoose from "mongoose";

// Gamification state per student. Written only by server-side events
// (battle results, exam and practice submissions), never by the client.
const playerStatsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    xp: { type: Number, default: 0 },
    rating: { type: Number, default: 1000 },
    peakRating: { type: Number, default: 1000 },
    battles: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    bestWinStreak: { type: Number, default: 0 },
    dayStreak: { type: Number, default: 0 },
    bestDayStreak: { type: Number, default: 0 },
    lastActiveDay: { type: String, default: "" }, // YYYY-MM-DD in Asia/Dhaka
    weekKey: { type: String, default: "" }, // ISO week, e.g. 2026-W46
    weeklyXp: { type: Number, default: 0 },
    practiceXpDay: { type: String, default: "" },
    practiceXpToday: { type: Number, default: 0 },
    achievements: [
      {
        _id: false,
        code: { type: String, required: true },
        earnedAt: { type: Date, default: () => new Date() },
      },
    ],
  },
  { timestamps: true }
);

playerStatsSchema.index({ rating: -1 });
playerStatsSchema.index({ xp: -1 });
playerStatsSchema.index({ weekKey: 1, weeklyXp: -1 });

export default mongoose.model("PlayerStats", playerStatsSchema);
