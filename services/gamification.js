// XP, rating, league, streak and achievement rules. Every change here is
// triggered by a server-verified event; clients can never submit XP or rating.
//
// XP
//   Battle:  win 30, draw 15, loss 10 (only if the player answered at least one
//            question), plus 2 per correct answer.
//   Exam:    2 per correct answer on the first attempt of an exam.
//   Practice: 1 per correct answer, capped at 50 per session.
// Rating (ranked 1v1 battles only): Elo, start 1000, K = 32, floor 100.
// League is derived from rating:
//   Bronze < 1100 ≤ Silver < 1250 ≤ Gold < 1400 ≤ Platinum < 1550 ≤ Diamond < 1700 ≤ Champion
//   Promotion/demotion happens automatically as rating crosses a boundary.
// Day streak: consecutive Asia/Dhaka calendar days with at least one XP event.
import PlayerStats from "../models/PlayerStats.js";

export const LEAGUES = [
  { key: "bronze", name: "Bronze", min: 0 },
  { key: "silver", name: "Silver", min: 1100 },
  { key: "gold", name: "Gold", min: 1250 },
  { key: "platinum", name: "Platinum", min: 1400 },
  { key: "diamond", name: "Diamond", min: 1550 },
  { key: "champion", name: "Champion", min: 1700 },
];

export const XP_RULES = {
  battleWin: 30,
  battleDraw: 15,
  battleLoss: 10,
  battlePerCorrect: 2,
  examPerCorrect: 2,
  practicePerCorrect: 1,
  practiceCap: 50,
};

export const ACHIEVEMENTS = {
  first_battle: { title: "First Battle", description: "Finish your first battle." },
  first_win: { title: "First Victory", description: "Win a battle." },
  win_streak_3: { title: "On Fire", description: "Win 3 battles in a row." },
  battles_10: { title: "Battle Ready", description: "Finish 10 battles." },
  perfect_battle: { title: "Flawless", description: "Answer every battle question correctly." },
  day_streak_7: { title: "Week Warrior", description: "Stay active 7 days in a row." },
  first_exam: { title: "Exam Taker", description: "Submit your first online exam." },
  league_gold: { title: "Gold League", description: "Reach the Gold league." },
};

export function leagueFor(rating = 1000) {
  let current = LEAGUES[0];
  for (const l of LEAGUES) if (rating >= l.min) current = l;
  const idx = LEAGUES.indexOf(current);
  const next = LEAGUES[idx + 1] || null;
  return { ...current, next: next ? { key: next.key, name: next.name, min: next.min, needed: next.min - rating } : null };
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
export function dhakaDay(date = new Date()) {
  return new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}
export function isoWeekKey(date = new Date()) {
  const d = new Date(date.getTime() + DHAKA_OFFSET_MS);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getStats(userId) {
  return PlayerStats.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function addAchievement(stats, code) {
  if (!ACHIEVEMENTS[code]) return false;
  if (stats.achievements.some((a) => a.code === code)) return false;
  stats.achievements.push({ code, earnedAt: new Date() });
  return true;
}

function touchActivity(stats, now = new Date()) {
  const today = dhakaDay(now);
  if (stats.lastActiveDay !== today) {
    const yesterday = dhakaDay(new Date(now.getTime() - 86400000));
    stats.dayStreak = stats.lastActiveDay === yesterday ? stats.dayStreak + 1 : 1;
    stats.bestDayStreak = Math.max(stats.bestDayStreak, stats.dayStreak);
    stats.lastActiveDay = today;
  }
  const wk = isoWeekKey(now);
  if (stats.weekKey !== wk) {
    stats.weekKey = wk;
    stats.weeklyXp = 0;
  }
  if (stats.dayStreak >= 7) addAchievement(stats, "day_streak_7");
}

export async function awardXp(userId, amount, { achievements = [] } = {}) {
  const stats = await getStats(userId);
  touchActivity(stats);
  const xp = Math.max(0, Math.round(amount));
  stats.xp += xp;
  stats.weeklyXp += xp;
  achievements.forEach((c) => addAchievement(stats, c));
  await stats.save();
  return { xp, stats };
}

export function eloDelta(ratingA, ratingB, scoreA, k = 32) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(k * (scoreA - expectedA));
}

/**
 * Applies a finished 1v1 battle to both players. `outcome` is 1 (A won), 0 (B won) or 0.5 (draw).
 * Returns per-player { ratingBefore, ratingAfter, xpEarned }.
 */
export async function applyBattleResult(battle) {
  const [pa, pb] = battle.players;
  const [sa, sb] = await Promise.all([getStats(pa.userId), getStats(pb.userId)]);
  const outcomeA = battle.isDraw ? 0.5 : String(battle.winnerId) === String(pa.userId) ? 1 : 0;
  const out = [];
  const ranked = battle.ranked !== false;
  const dA = ranked ? eloDelta(sa.rating, sb.rating, outcomeA) : 0;
  const dB = ranked ? eloDelta(sb.rating, sa.rating, 1 - outcomeA) : 0;

  for (const [p, s, outcome, delta] of [
    [pa, sa, outcomeA, dA],
    [pb, sb, 1 - outcomeA, dB],
  ]) {
    const participated = (p.answers || []).length > 0;
    const before = s.rating;
    touchActivity(s);
    s.rating = Math.max(100, s.rating + delta);
    s.peakRating = Math.max(s.peakRating, s.rating);
    s.battles += 1;
    let xp = 0;
    if (outcome === 1) {
      s.wins += 1;
      s.winStreak += 1;
      s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak);
      xp += XP_RULES.battleWin;
      addAchievement(s, "first_win");
    } else if (outcome === 0.5) {
      s.draws += 1;
      s.winStreak = 0;
      xp += participated ? XP_RULES.battleDraw : 0;
    } else {
      s.losses += 1;
      s.winStreak = 0;
      xp += participated ? XP_RULES.battleLoss : 0;
    }
    xp += (p.correctCount || 0) * XP_RULES.battlePerCorrect;
    s.xp += xp;
    s.weeklyXp += xp;
    addAchievement(s, "first_battle");
    if (s.winStreak >= 3) addAchievement(s, "win_streak_3");
    if (s.battles >= 10) addAchievement(s, "battles_10");
    if (battle.questionIds.length > 0 && p.correctCount === battle.questionIds.length) addAchievement(s, "perfect_battle");
    if (s.rating >= 1250) addAchievement(s, "league_gold");
    await s.save();
    out.push({ ratingBefore: before, ratingAfter: s.rating, xpEarned: xp });
  }
  return out;
}

export function publicStats(stats) {
  if (!stats) return null;
  const s = stats.toObject ? stats.toObject() : stats;
  return {
    xp: s.xp,
    rating: s.rating,
    peakRating: s.peakRating,
    league: leagueFor(s.rating),
    battles: s.battles,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    winStreak: s.winStreak,
    dayStreak: s.lastActiveDay && s.lastActiveDay >= dhakaDay(new Date(Date.now() - 86400000)) ? s.dayStreak : 0,
    bestDayStreak: s.bestDayStreak,
    weeklyXp: s.weekKey === isoWeekKey() ? s.weeklyXp : 0,
    achievements: (s.achievements || []).map((a) => ({ code: a.code, earnedAt: a.earnedAt, ...ACHIEVEMENTS[a.code] })),
  };
}
