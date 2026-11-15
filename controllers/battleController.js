// 1v1 battle MVP. The server picks the questions, owns the clock, grades every
// answer and decides the result. Clients only send (questionIndex, optionIndex).
//
// Scoring per question:  correct = 10 + speed bonus (0–5),  wrong = −2,  no answer = 0.
//   speed bonus = max(0, 5 − floor(seconds since your previous answer / 3)), measured
//   with server timestamps only.
// Result: higher score wins; equal score → fewer seconds used wins; else draw.
// A player who leaves an active battle forfeits. When the server clock passes
// endsAt, the battle is finalised on the next request from anyone.
import crypto from "crypto";
import Battle from "../models/Battle.js";
import Question from "../models/Question.js";
import { applyBattleResult, getStats, publicStats } from "../services/gamification.js";
import { isStaff, toId } from "../utils/access.js";

const QUESTIONS_PER_BATTLE = 10;
const SECONDS_PER_QUESTION = 20;
const COUNTDOWN_SECONDS = 3;
const RANDOM_WAIT_SECONDS = 60;
const FRIEND_WAIT_SECONDS = 15 * 60;
const ANSWER_GRACE_MS = 2000;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** Only shared, admin/teacher-controlled questions are used for battles. */
const BATTLE_POOL = { hidden: { $ne: true }, $or: [{ isPublic: true }, { organizationId: null }] };

function cleanFilters(body = {}) {
  const s = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const difficulty = ["easy", "medium", "hard", "mixed"].includes(body.difficulty) ? body.difficulty : "mixed";
  return { className: s(body.className, 40), subject: s(body.subject, 60), chapter: s(body.chapter), topic: s(body.topic), difficulty };
}

function questionMatch(f) {
  const m = { ...BATTLE_POOL };
  if (f.className) m.className = f.className;
  if (f.subject) m.subject = f.subject;
  if (f.chapter) m.chapter = f.chapter;
  if (f.topic) m.topic = f.topic;
  return m;
}

async function pickQuestions(f, n = QUESTIONS_PER_BATTLE) {
  const base = questionMatch(f);
  let picked = [];
  if (f.difficulty === "mixed") {
    const plan = [
      ["easy", Math.round(n * 0.4)],
      ["medium", Math.round(n * 0.4)],
      ["hard", n - 2 * Math.round(n * 0.4)],
    ];
    for (const [d, k] of plan) {
      if (k > 0) picked.push(...(await Question.aggregate([{ $match: { ...base, difficulty: d } }, { $sample: { size: k } }, { $project: { _id: 1 } }])));
    }
  } else {
    picked = await Question.aggregate([{ $match: { ...base, difficulty: f.difficulty } }, { $sample: { size: n } }, { $project: { _id: 1 } }]);
  }
  if (picked.length < n) {
    const have = picked.map((p) => p._id);
    const fill = await Question.aggregate([
      { $match: { ...base, _id: { $nin: have }, ...(f.difficulty === "mixed" ? {} : { difficulty: f.difficulty }) } },
      { $sample: { size: n - picked.length } },
      { $project: { _id: 1 } },
    ]);
    picked.push(...fill);
  }
  // Shuffle so difficulty order is not predictable
  for (let i = picked.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.map((p) => p._id);
}

const matchKeyOf = (f) => [f.className, f.subject, f.chapter, f.topic, f.difficulty].join("|").toLowerCase();

function playerEntry(user) {
  return { userId: user._id, name: user.name, joinedAt: new Date(), lastSeenAt: new Date(), answers: [] };
}

function timing(now = new Date(), n = QUESTIONS_PER_BATTLE) {
  const startedAt = new Date(now.getTime() + COUNTDOWN_SECONDS * 1000);
  return { startedAt, endsAt: new Date(startedAt.getTime() + n * SECONDS_PER_QUESTION * 1000) };
}

/** Finalise an active battle exactly once (atomic status transition). */
async function finalize(battleId, { forfeitUserId = null } = {}) {
  const b = await Battle.findOneAndUpdate({ _id: battleId, status: "active" }, { $set: { status: "finished", finishedAt: new Date() } }, { new: true });
  if (!b) return Battle.findById(battleId);
  const [a, c] = b.players;
  const used = (p) => {
    const last = p.answers.length ? Math.max(...p.answers.map((x) => new Date(x.answeredAt).getTime())) : b.endsAt.getTime();
    return last - b.startedAt.getTime();
  };
  let winner = null;
  let reason = "score";
  if (forfeitUserId) {
    winner = String(a.userId) === String(forfeitUserId) ? c : a;
    reason = "forfeit";
  } else if (a.score !== c.score) {
    winner = a.score > c.score ? a : c;
  } else if (a.answers.length + c.answers.length > 0 && used(a) !== used(c)) {
    winner = used(a) < used(c) ? a : c;
    reason = "time";
  }
  b.winnerId = winner ? winner.userId : null;
  b.isDraw = !winner;
  b.resultReason = winner ? reason : "draw";
  const deltas = await applyBattleResult(b);
  b.players.forEach((p, i) => {
    p.ratingBefore = deltas[i].ratingBefore;
    p.ratingAfter = deltas[i].ratingAfter;
    p.xpEarned = deltas[i].xpEarned;
  });
  b.markModified("players");
  await b.save();
  return b;
}

/** Applies time-based transitions (expiry / end of clock) before reading a battle. */
async function refresh(b) {
  const now = new Date();
  if (b.status === "waiting" && b.expiresAt && now > b.expiresAt) {
    await Battle.updateOne({ _id: b._id, status: "waiting" }, { $set: { status: "cancelled", resultReason: "no_opponent" } });
    return Battle.findById(b._id);
  }
  if (b.status === "active" && now.getTime() > b.endsAt.getTime() + ANSWER_GRACE_MS) {
    return finalize(b._id);
  }
  return b;
}

async function viewFor(b, userId) {
  const me = b.players.find((p) => String(p.userId) === String(userId));
  const opp = b.players.find((p) => String(p.userId) !== String(userId));
  const view = {
    _id: b._id,
    mode: b.mode,
    status: b.status,
    roomCode: b.mode === "friend" ? b.roomCode : undefined,
    filters: b.filters,
    secondsPerQuestion: b.secondsPerQuestion,
    totalQuestions: b.questionIds.length,
    startedAt: b.startedAt,
    endsAt: b.endsAt,
    expiresAt: b.expiresAt,
    serverNow: new Date(),
    me: me && { name: me.name, score: me.score, correctCount: me.correctCount, wrongCount: me.wrongCount, answered: me.answers.length, answers: me.answers, ratingBefore: me.ratingBefore, ratingAfter: me.ratingAfter, xpEarned: me.xpEarned },
    opponent: opp ? { name: opp.name, score: opp.score, answered: opp.answers.length, ratingBefore: opp.ratingBefore, ratingAfter: opp.ratingAfter } : null,
    result: b.status === "finished" ? { winner: b.isDraw ? "draw" : String(b.winnerId) === String(userId) ? "me" : "opponent", reason: b.resultReason } : null,
  };
  if (b.status === "active" || b.status === "finished") {
    const qs = await Question.find({ _id: { $in: b.questionIds } })
      .select("question options questionBn questionEn optionsBn optionsEn image chapter topic difficulty correctAnswer explanation explanationBn explanationEn")
      .lean();
    const map = new Map(qs.map((q) => [String(q._id), q]));
    const finished = b.status === "finished";
    view.questions = b.questionIds.map((id, i) => {
      const q = map.get(String(id)) || {};
      const answeredByMe = me?.answers.some((a) => a.index === i);
      const out = {
        index: i,
        question: q.question,
        options: q.options,
        questionBn: q.questionBn,
        questionEn: q.questionEn,
        optionsBn: q.optionsBn,
        optionsEn: q.optionsEn,
        image: q.image,
        chapter: q.chapter,
        topic: q.topic,
        difficulty: q.difficulty,
      };
      // The correct option is revealed for a question only after this player answered it, or at the end.
      if (finished || answeredByMe) {
        out.correctIndex = (q.options || []).indexOf(q.correctAnswer);
      }
      if (finished) {
        out.explanation = q.explanation;
        out.explanationBn = q.explanationBn;
        out.explanationEn = q.explanationEn;
      }
      return out;
    });
  }
  return view;
}

async function loadParticipantBattle(req, res) {
  const id = toId(req.params.id);
  if (!id) {
    fail(res, 400, "Invalid battle id.");
    return null;
  }
  let b = await Battle.findById(id);
  if (!b) {
    fail(res, 404, "Battle not found.");
    return null;
  }
  if (!b.players.some((p) => String(p.userId) === String(req.user._id))) {
    fail(res, 403, "You are not part of this battle.");
    return null;
  }
  return refresh(b);
}

async function ensureNoOpenBattle(user) {
  const open = await Battle.find({ "players.userId": user._id, status: { $in: ["waiting", "active"] } });
  for (const b of open) {
    const r = await refresh(b);
    if (r.status === "waiting" || r.status === "active") return r;
  }
  return null;
}

function requireStudent(req, res) {
  if (isStaff(req.user)) {
    fail(res, 403, "Battles are for student accounts.");
    return false;
  }
  return true;
}

// POST /api/battles/find — random matchmaking
export const findMatch = async (req, res) => {
  try {
    if (!requireStudent(req, res)) return;
    const existing = await ensureNoOpenBattle(req.user);
    if (existing) return res.json({ success: true, battle: await viewFor(existing, req.user._id), resumed: true });

    const f = cleanFilters(req.body);
    const matchKey = matchKeyOf(f);
    const now = new Date();
    const t = timing(now);
    const joined = await Battle.findOneAndUpdate(
      { status: "waiting", mode: "random", matchKey, expiresAt: { $gt: now }, "players.0.userId": { $ne: req.user._id }, "players.1": { $exists: false } },
      { $push: { players: playerEntry(req.user) }, $set: { status: "active", startedAt: t.startedAt, endsAt: t.endsAt, expiresAt: null } },
      { new: true, sort: { createdAt: 1 } }
    );
    if (joined) return res.json({ success: true, battle: await viewFor(joined, req.user._id), matched: true });

    const questionIds = await pickQuestions(f);
    if (questionIds.length < 5) return fail(res, 400, "Not enough questions for this topic yet. Try a wider topic or another difficulty.");
    const b = await Battle.create({
      mode: "random",
      ranked: true,
      createdBy: req.user._id,
      filters: f,
      matchKey,
      questionIds,
      secondsPerQuestion: SECONDS_PER_QUESTION,
      players: [playerEntry(req.user)],
      expiresAt: new Date(now.getTime() + RANDOM_WAIT_SECONDS * 1000),
    });
    return res.status(201).json({ success: true, battle: await viewFor(b, req.user._id), waiting: true });
  } catch (e) {
    console.error("findMatch:", e.message);
    return fail(res, 500, "Could not start matchmaking.");
  }
};

// POST /api/battles/friend — create a private room with a code
export const createFriendRoom = async (req, res) => {
  try {
    if (!requireStudent(req, res)) return;
    const existing = await ensureNoOpenBattle(req.user);
    if (existing) return res.json({ success: true, battle: await viewFor(existing, req.user._id), resumed: true });
    const f = cleanFilters(req.body);
    const questionIds = await pickQuestions(f);
    if (questionIds.length < 5) return fail(res, 400, "Not enough questions for this topic yet. Try a wider topic or another difficulty.");
    let b;
    for (let i = 0; i < 5 && !b; i++) {
      try {
        b = await Battle.create({
          mode: "friend",
          ranked: false,
          roomCode: crypto.randomBytes(3).toString("hex").toUpperCase(),
          createdBy: req.user._id,
          filters: f,
          matchKey: matchKeyOf(f),
          questionIds,
          secondsPerQuestion: SECONDS_PER_QUESTION,
          players: [playerEntry(req.user)],
          expiresAt: new Date(Date.now() + FRIEND_WAIT_SECONDS * 1000),
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    }
    return res.status(201).json({ success: true, battle: await viewFor(b, req.user._id) });
  } catch (e) {
    console.error("createFriendRoom:", e.message);
    return fail(res, 500, "Could not create a room.");
  }
};

// POST /api/battles/join { roomCode }
export const joinFriendRoom = async (req, res) => {
  try {
    if (!requireStudent(req, res)) return;
    const code = String(req.body?.roomCode || "").trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(code)) return fail(res, 400, "Enter the 6-character room code.");
    const existing = await ensureNoOpenBattle(req.user);
    if (existing && existing.roomCode !== code) return fail(res, 409, "Finish or leave your current battle first.", { battleId: existing._id });
    if (existing) return res.json({ success: true, battle: await viewFor(existing, req.user._id) });
    const now = new Date();
    const t = timing(now);
    const b = await Battle.findOneAndUpdate(
      { roomCode: code, status: "waiting", expiresAt: { $gt: now }, "players.0.userId": { $ne: req.user._id }, "players.1": { $exists: false } },
      { $push: { players: playerEntry(req.user) }, $set: { status: "active", startedAt: t.startedAt, endsAt: t.endsAt, expiresAt: null } },
      { new: true }
    );
    if (!b) return fail(res, 404, "This room is not available. It may have expired or already started.");
    return res.json({ success: true, battle: await viewFor(b, req.user._id) });
  } catch (e) {
    console.error("joinFriendRoom:", e.message);
    return fail(res, 500, "Could not join the room.");
  }
};

// GET /api/battles/:id — poll state
export const getBattle = async (req, res) => {
  try {
    const b = await loadParticipantBattle(req, res);
    if (!b) return;
    await Battle.updateOne({ _id: b._id, "players.userId": req.user._id }, { $set: { "players.$.lastSeenAt": new Date() } });
    return res.json({ success: true, battle: await viewFor(b, req.user._id) });
  } catch (e) {
    console.error("getBattle:", e.message);
    return fail(res, 500, "Could not load the battle.");
  }
};

// POST /api/battles/:id/answer { index, optionIndex }
export const answerQuestion = async (req, res) => {
  try {
    const b = await loadParticipantBattle(req, res);
    if (!b) return;
    if (b.status !== "active") return fail(res, 409, "This battle is not running.", { battle: await viewFor(b, req.user._id) });
    const now = new Date();
    if (now < b.startedAt) return fail(res, 425, "The battle has not started yet.");
    if (now.getTime() > b.endsAt.getTime() + ANSWER_GRACE_MS) return fail(res, 409, "Time is up.");

    const index = Number(req.body?.index);
    const optionIndex = Number(req.body?.optionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= b.questionIds.length) return fail(res, 400, "Invalid question.");
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return fail(res, 400, "Invalid option.");

    const me = b.players.find((p) => String(p.userId) === String(req.user._id));
    if (me.answers.some((a) => a.index === index)) return fail(res, 409, "You already answered this question.");

    const q = await Question.findById(b.questionIds[index]).select("options correctAnswer").lean();
    const correct = q && q.options?.[optionIndex] === q.correctAnswer;
    const prev = me.answers.length ? Math.max(...me.answers.map((a) => new Date(a.answeredAt).getTime())) : b.startedAt.getTime();
    const secs = Math.max(0, (now.getTime() - prev) / 1000);
    const points = correct ? 10 + Math.max(0, 5 - Math.floor(secs / 3)) : -2;

    // Atomic: only add if this index is still unanswered by this player.
    const updated = await Battle.findOneAndUpdate(
      { _id: b._id, status: "active", players: { $elemMatch: { userId: req.user._id, "answers.index": { $ne: index } } } },
      {
        $push: { "players.$.answers": { index, answer: String(optionIndex), correct, points, answeredAt: now } },
        $inc: { "players.$.score": points, [correct ? "players.$.correctCount" : "players.$.wrongCount"]: 1 },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, "You already answered this question.");

    let current = updated;
    if (current.players.length === 2 && current.players.every((p) => p.answers.length >= current.questionIds.length)) {
      current = await finalize(current._id);
    }
    return res.json({ success: true, correct, points, correctIndex: (q?.options || []).indexOf(q?.correctAnswer), battle: await viewFor(current, req.user._id) });
  } catch (e) {
    console.error("answerQuestion:", e.message);
    return fail(res, 500, "Could not record your answer.");
  }
};

// POST /api/battles/:id/leave
export const leaveBattle = async (req, res) => {
  try {
    const b = await loadParticipantBattle(req, res);
    if (!b) return;
    if (b.status === "waiting") {
      await Battle.updateOne({ _id: b._id, status: "waiting" }, { $set: { status: "cancelled", resultReason: "left" } });
    } else if (b.status === "active") {
      await finalize(b._id, { forfeitUserId: req.user._id });
    }
    const fresh = await Battle.findById(b._id);
    return res.json({ success: true, battle: await viewFor(fresh, req.user._id) });
  } catch (e) {
    console.error("leaveBattle:", e.message);
    return fail(res, 500, "Could not leave the battle.");
  }
};

// GET /api/battles/history
export const battleHistory = async (req, res) => {
  try {
    const rows = await Battle.find({ "players.userId": req.user._id, status: "finished" }).sort({ finishedAt: -1 }).limit(30).lean();
    return res.json({
      success: true,
      battles: rows.map((b) => {
        const me = b.players.find((p) => String(p.userId) === String(req.user._id));
        const opp = b.players.find((p) => String(p.userId) !== String(req.user._id));
        return {
          _id: b._id,
          mode: b.mode,
          finishedAt: b.finishedAt,
          filters: b.filters,
          myScore: me?.score,
          opponentScore: opp?.score,
          opponentName: opp?.name,
          result: b.isDraw ? "draw" : String(b.winnerId) === String(req.user._id) ? "win" : "loss",
          reason: b.resultReason,
          ratingChange: me?.ratingAfter != null && me?.ratingBefore != null ? me.ratingAfter - me.ratingBefore : 0,
          xpEarned: me?.xpEarned || 0,
        };
      }),
    });
  } catch (e) {
    console.error("battleHistory:", e.message);
    return fail(res, 500, "Could not load battle history.");
  }
};

// GET /api/battles/current — the student's open battle, if any
export const currentBattle = async (req, res) => {
  try {
    const b = await ensureNoOpenBattle(req.user);
    return res.json({ success: true, battle: b ? await viewFor(b, req.user._id) : null });
  } catch (e) {
    console.error("currentBattle:", e.message);
    return fail(res, 500, "Could not load your battle.");
  }
};

// GET /api/battles/topics — Subject → Chapter → Topic tree with question counts (no questions)
export const battleTopics = async (req, res) => {
  try {
    const rows = await Question.aggregate([
      { $match: BATTLE_POOL },
      { $group: { _id: { s: "$subject", c: "$chapter", t: "$topic" }, n: { $sum: 1 }, classes: { $addToSet: "$className" } } },
    ]);
    const subjects = new Map();
    rows.forEach((r) => {
      const s = r._id.s || "Other";
      if (!subjects.has(s)) subjects.set(s, { name: s, count: 0, chapters: new Map() });
      const sub = subjects.get(s);
      sub.count += r.n;
      const c = r._id.c || "General";
      if (!sub.chapters.has(c)) sub.chapters.set(c, { name: c, count: 0, topics: [] });
      const ch = sub.chapters.get(c);
      ch.count += r.n;
      if (r._id.t) ch.topics.push({ name: r._id.t, count: r.n });
    });
    const classes = (await Question.distinct("className", BATTLE_POOL)).filter(Boolean).sort();
    return res.json({
      success: true,
      classes,
      subjects: [...subjects.values()].map((s) => ({
        name: s.name,
        count: s.count,
        chapters: [...s.chapters.values()].map((c) => ({ ...c, topics: c.topics.sort((a, b) => b.count - a.count) })).sort((a, b) => a.name.localeCompare(b.name)),
      })),
    });
  } catch (e) {
    console.error("battleTopics:", e.message);
    return fail(res, 500, "Could not load topics.");
  }
};

// GET /api/battles/me/stats
export const myStats = async (req, res) => {
  try {
    return res.json({ success: true, stats: publicStats(await getStats(req.user._id)) });
  } catch (e) {
    console.error("myStats:", e.message);
    return fail(res, 500, "Could not load your stats.");
  }
};
