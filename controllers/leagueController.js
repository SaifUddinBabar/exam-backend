import PlayerStats from "../models/PlayerStats.js";
import Battle from "../models/Battle.js";
import Batch from "../models/Batch.js";
import BatchMembership from "../models/BatchMembership.js";
import User from "../models/User.js";
import { LEAGUES, XP_RULES, ACHIEVEMENTS, leagueFor, isoWeekKey, getStats, publicStats } from "../services/gamification.js";
import { isStaff, isSuperAdmin, toId } from "../utils/access.js";

const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function friendIds(userId) {
  const ids = await Battle.distinct("players.userId", { "players.userId": userId, status: "finished" });
  return ids.filter((id) => String(id) !== String(userId));
}

// GET /api/league/leaderboard?scope=global|weekly|batch|friends&batchId=
export const leaderboard = async (req, res) => {
  try {
    const scope = ["global", "weekly", "batch", "friends"].includes(req.query.scope) ? req.query.scope : "global";
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 50));
    let match = { battles: { $gt: 0 } };
    let sort = { rating: -1, xp: -1, _id: 1 };
    let valueField = "rating";

    if (scope === "weekly") {
      match = { weekKey: isoWeekKey(), weeklyXp: { $gt: 0 } };
      sort = { weeklyXp: -1, _id: 1 };
      valueField = "weeklyXp";
    } else if (scope === "batch") {
      const batchId = toId(req.query.batchId);
      if (!batchId) return fail(res, 400, "Choose a batch.");
      const batch = await Batch.findById(batchId).lean();
      if (!batch) return fail(res, 404, "Batch not found.");
      const isOwner = isSuperAdmin(req.user) || String(batch.ownerId) === String(req.user._id);
      const isMember = await BatchMembership.exists({ batchId, studentId: req.user._id, status: "active" });
      if (!isOwner && !isMember) return fail(res, 403, "You are not in this batch.");
      const members = await BatchMembership.find({ batchId, status: "active" }).distinct("studentId");
      match = { userId: { $in: members }, xp: { $gt: 0 } };
      sort = { xp: -1, _id: 1 };
      valueField = "xp";
    } else if (scope === "friends") {
      const ids = await friendIds(req.user._id);
      match = { userId: { $in: [...ids, req.user._id] } };
      sort = { rating: -1, _id: 1 };
    }

    const rows = await PlayerStats.find(match).sort(sort).limit(limit).lean();
    const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select("name avatar").lean();
    const uMap = new Map(users.map((u) => [String(u._id), u]));

    let me = null;
    if (!isStaff(req.user)) {
      const mine = await PlayerStats.findOne({ userId: req.user._id }).lean();
      if (mine) {
        const myValue = mine[valueField] ?? 0;
        const inScope = await PlayerStats.exists({ ...match, userId: req.user._id });
        if (inScope) {
          const ahead = await PlayerStats.countDocuments({ ...match, [valueField]: { $gt: myValue } });
          me = { rank: ahead + 1, value: myValue, league: leagueFor(mine.rating) };
        }
      }
    }

    return res.json({
      success: true,
      scope,
      metric: valueField,
      weekKey: scope === "weekly" ? isoWeekKey() : undefined,
      me,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        name: uMap.get(String(r.userId))?.name || "Student",
        avatar: uMap.get(String(r.userId))?.avatar || "",
        value: r[valueField] ?? 0,
        rating: r.rating,
        xp: r.xp,
        wins: r.wins,
        battles: r.battles,
        league: leagueFor(r.rating),
        isMe: String(r.userId) === String(req.user._id),
      })),
    });
  } catch (e) {
    console.error("leaderboard:", e.message);
    return fail(res, 500, "Could not load the leaderboard.");
  }
};

// GET /api/league/me
export const myLeague = async (req, res) => {
  try {
    const stats = await getStats(req.user._id);
    const ahead = stats.battles > 0 ? await PlayerStats.countDocuments({ battles: { $gt: 0 }, rating: { $gt: stats.rating } }) : null;
    return res.json({ success: true, stats: publicStats(stats), globalRank: ahead === null ? null : ahead + 1 });
  } catch (e) {
    console.error("myLeague:", e.message);
    return fail(res, 500, "Could not load your league.");
  }
};

// GET /api/league/rules — how XP, rating and leagues work
export const rules = (req, res) =>
  res.json({
    success: true,
    leagues: LEAGUES,
    xp: XP_RULES,
    rating: { start: 1000, k: 32, floor: 100, rankedModes: ["random"] },
    achievements: Object.entries(ACHIEVEMENTS).map(([code, a]) => ({ code, ...a })),
    battleScoring: { correct: 10, speedBonusMax: 5, wrong: -2, unanswered: 0, secondsPerQuestion: 20, questions: 10 },
  });
