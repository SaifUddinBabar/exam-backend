// Daily tournament. Everyone gets the same 10 questions per Bangladesh calendar day,
// one attempt each, 30 s per question on the server clock. Scoring as in battles:
// correct 10 + speed bonus (0–5, from server timestamps), wrong −2. Ranking: score desc,
// then time used asc. XP on finishing: 10 for taking part + 2 per correct answer.
// Integrity: everyone sees the same questions all day, so per-question correctness and
// answers are hidden until the day is over (only the total score is shown).
import { DailyTournament, TournamentEntry } from "../models/Tournament.js";
import Question from "../models/Question.js";
import { pickQuestions } from "./battleController.js";
import { isPlayableId } from "../services/topicIndex.js";
import { awardXp, dhakaDay, XP_RULES } from "../services/gamification.js";
import { isStaff } from "../utils/access.js";

const QUESTIONS = 10;
const GRACE_MS = 2000;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function todaysTournament() {
  const day = dhakaDay();
  let t = await DailyTournament.findOne({ day });
  if (t) {
    // A set picked before the playability check may hold a question that needs a missing
    // passage. Re-pick only while nobody has started, so everyone still gets the same set.
    const bad = [];
    for (const id of t.questionIds) if (!(await isPlayableId(id))) bad.push(id);
    if (bad.length && !(await TournamentEntry.exists({ day }))) {
      const ids = await pickQuestions({ className: "", subject: "", chapter: "", topic: "", difficulty: "mixed" }, QUESTIONS);
      t = (await DailyTournament.findOneAndUpdate({ _id: t._id, questionIds: t.questionIds }, { $set: { questionIds: ids } }, { new: true })) || (await DailyTournament.findOne({ day }));
    }
    return t;
  }
  const ids = await pickQuestions({ className: "", subject: "", chapter: "", topic: "", difficulty: "mixed" }, QUESTIONS);
  try {
    t = await DailyTournament.create({ day, questionIds: ids });
  } catch (e) {
    if (e.code !== 11000) throw e;
    t = await DailyTournament.findOne({ day }); // created concurrently
  }
  return t;
}

async function leaderboard(day, limit = 20) {
  return TournamentEntry.find({ day, finishedAt: { $ne: null } }).sort({ score: -1, timeMs: 1, finishedAt: 1 }).limit(limit).select("name score correctCount timeMs userId").lean();
}

async function finishEntry(entry, now = new Date()) {
  if (entry.finishedAt) return entry;
  const last = entry.answers.length ? Math.max(...entry.answers.map((a) => new Date(a.answeredAt).getTime())) : entry.endsAt.getTime();
  const done = await TournamentEntry.findOneAndUpdate({ _id: entry._id, finishedAt: null }, { $set: { finishedAt: now, timeMs: Math.max(0, last - entry.startedAt.getTime()) } }, { new: true });
  if (!done) return TournamentEntry.findById(entry._id);
  const xp = (done.answers.length ? 10 : 0) + done.correctCount * XP_RULES.battlePerCorrect;
  if (xp) await awardXp(done.userId, xp);
  done.xpEarned = xp;
  await done.save();
  return done;
}

async function questionsFor(t, entry, reveal) {
  const qs = await Question.find({ _id: { $in: t.questionIds } }).select("question options questionBn questionEn optionsBn optionsEn image chapter topic correctAnswer explanation explanationBn explanationEn").lean();
  const map = new Map(qs.map((q) => [String(q._id), q]));
  return t.questionIds.map((id, i) => {
    const q = map.get(String(id)) || {};
    const out = { index: i, question: q.question, options: q.options, questionBn: q.questionBn, questionEn: q.questionEn, optionsBn: q.optionsBn, optionsEn: q.optionsEn, image: q.image, chapter: q.chapter, topic: q.topic };
    if (reveal) out.correctIndex = (q.options || []).indexOf(q.correctAnswer);
    if (reveal) Object.assign(out, { explanation: q.explanation, explanationBn: q.explanationBn, explanationEn: q.explanationEn });
    return out;
  });
}

function entryView(e) {
  if (!e) return null;
  const answers = e.answers.map((a) => ({ index: a.index, optionIndex: a.optionIndex, answeredAt: a.answeredAt }));
  return { startedAt: e.startedAt, endsAt: e.endsAt, answers, answered: answers.length, score: e.finishedAt ? e.score : null, correctCount: e.finishedAt ? e.correctCount : null, finishedAt: e.finishedAt, timeMs: e.timeMs, xpEarned: e.xpEarned };
}

// GET /api/tournament/today
export const today = async (req, res) => {
  try {
    const t = await todaysTournament();
    let entry = await TournamentEntry.findOne({ day: t.day, userId: req.user._id });
    if (entry && !entry.finishedAt && Date.now() > entry.endsAt.getTime() + GRACE_MS) entry = await finishEntry(entry);
    const [board, participants] = await Promise.all([leaderboard(t.day), TournamentEntry.countDocuments({ day: t.day })]);
    let myRank = null;
    if (entry?.finishedAt) myRank = (await TournamentEntry.countDocuments({ day: t.day, finishedAt: { $ne: null }, $or: [{ score: { $gt: entry.score } }, { score: entry.score, timeMs: { $lt: entry.timeMs } }] })) + 1;
    return res.json({
      success: true,
      day: t.day,
      totalQuestions: t.questionIds.length,
      secondsPerQuestion: t.secondsPerQuestion,
      participants,
      me: entryView(entry),
      myRank,
      questions: entry && !entry.finishedAt ? await questionsFor(t, entry, false) : undefined,
      leaderboard: board.map((b, i) => ({ rank: i + 1, name: b.name, score: b.score, correctCount: b.correctCount, timeMs: b.timeMs, isMe: String(b.userId) === String(req.user._id) })),
      serverNow: new Date(),
    });
  } catch (e) {
    console.error("tournament today:", e.message);
    return fail(res, 500, "Could not load today's tournament.");
  }
};

// POST /api/tournament/today/start
export const start = async (req, res) => {
  try {
    if (isStaff(req.user)) return fail(res, 403, "Tournaments are for student accounts.");
    const t = await todaysTournament();
    if (t.questionIds.length < 5) return fail(res, 400, "Not enough questions for today's tournament.");
    const now = new Date();
    try {
      await TournamentEntry.create({ day: t.day, userId: req.user._id, name: req.user.name, startedAt: now, endsAt: new Date(now.getTime() + t.questionIds.length * t.secondsPerQuestion * 1000) });
    } catch (e) {
      if (e.code !== 11000) throw e; // already started today — resume
    }
    return today(req, res);
  } catch (e) {
    console.error("tournament start:", e.message);
    return fail(res, 500, "Could not start the tournament.");
  }
};

// POST /api/tournament/today/answer { index, optionIndex }
export const answer = async (req, res) => {
  try {
    const t = await todaysTournament();
    const entry = await TournamentEntry.findOne({ day: t.day, userId: req.user._id });
    if (!entry) return fail(res, 400, "Start today's tournament first.");
    if (entry.finishedAt) return fail(res, 409, "You've already finished today's tournament.");
    const now = new Date();
    if (now.getTime() > entry.endsAt.getTime() + GRACE_MS) {
      await finishEntry(entry);
      return fail(res, 409, "Time is up.");
    }
    const index = Number(req.body?.index);
    const optionIndex = Number(req.body?.optionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= t.questionIds.length) return fail(res, 400, "Invalid question.");
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return fail(res, 400, "Invalid option.");
    const q = await Question.findById(t.questionIds[index]).select("options correctAnswer").lean();
    const correct = q?.options?.[optionIndex] === q?.correctAnswer;
    const prev = entry.answers.length ? Math.max(...entry.answers.map((a) => new Date(a.answeredAt).getTime())) : entry.startedAt.getTime();
    const points = correct ? 10 + Math.max(0, 5 - Math.floor((now.getTime() - prev) / 3000)) : -2;
    const updated = await TournamentEntry.findOneAndUpdate(
      { _id: entry._id, finishedAt: null, "answers.index": { $ne: index } },
      { $push: { answers: { index, optionIndex, correct, points, answeredAt: now } }, $inc: { score: points, correctCount: correct ? 1 : 0 } },
      { new: true }
    );
    if (!updated) return fail(res, 409, "You already answered this question.");
    if (updated.answers.length >= t.questionIds.length) await finishEntry(updated);
    return res.json({ success: true, recorded: true, answered: updated.answers.length });
  } catch (e) {
    console.error("tournament answer:", e.message);
    return fail(res, 500, "Could not record your answer.");
  }
};

// POST /api/tournament/today/finish
export const finish = async (req, res) => {
  try {
    const t = await todaysTournament();
    const entry = await TournamentEntry.findOne({ day: t.day, userId: req.user._id });
    if (!entry) return fail(res, 400, "Start today's tournament first.");
    await finishEntry(entry);
    return today(req, res);
  } catch (e) {
    console.error("tournament finish:", e.message);
    return fail(res, 500, "Could not finish.");
  }
};
