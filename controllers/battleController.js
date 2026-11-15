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
import mongoose from "mongoose";
import Battle from "../models/Battle.js";
import Question from "../models/Question.js";
import { applyBattleResult, applyGroupResult, getStats, publicStats } from "../services/gamification.js";
import { isStaff, toId } from "../utils/access.js";
import { ALL_CHAPTERS, UNCATEGORISED, chapterTopicNames, findChapterConfig } from "../utils/syllabusTopics.js";
import { idsForTopics, tallyChapters, getTopicIndex, unplayableIds } from "../services/topicIndex.js";
import { battleEvents, notifyBattle } from "../services/battleEvents.js";

const QUESTIONS_PER_BATTLE = 10;
const SECONDS_PER_QUESTION = 20;
const COUNTDOWN_SECONDS = 3;
const RANDOM_WAIT_SECONDS = 60;
const FRIEND_WAIT_SECONDS = 15 * 60;
const ANSWER_GRACE_MS = 2000;
// Connection handling: a player with no heartbeat (stream tick, poll or answer) for
// DISCONNECT_AFTER_MS is shown as reconnecting; after a further RECONNECT_GRACE_MS they
// forfeit (1v1, only while the other player is still connected) or leave (group).
const DISCONNECT_AFTER_MS = 12_000;
const RECONNECT_GRACE_MS = 30_000;
const STREAM_TICK_MS = 3_000;
const STREAM_MAX_LIFE_MS = 20 * 60_000;
// Rating-based matchmaking: start within ±150 rating, widen by 10 per second of waiting,
// accept anyone after 40 s so nobody waits out the full minute.
const BAND_BASE = 150;
const BAND_PER_SECOND = 10;
const BAND_OPEN_AFTER_SECONDS = 40;

export const ratingBand = (waitedSeconds) => (waitedSeconds >= BAND_OPEN_AFTER_SECONDS ? Infinity : BAND_BASE + BAND_PER_SECOND * Math.max(0, waitedSeconds));
const withinBand = (a, b, waitedSeconds) => a == null || b == null || Math.abs(a - b) <= ratingBand(waitedSeconds);
async function ratingOf(userId) {
  const st = await getStats(userId);
  return st?.rating ?? 1000;
}

// Question payloads for a battle never change during it; cache them so polling and
// streaming do not re-read the questions on every tick.
const questionCache = new Map(); // battleId → { at, qs }
const QUESTION_CACHE_MS = 30 * 60_000;
async function battleQuestions(b) {
  const k = String(b._id);
  const hit = questionCache.get(k);
  if (hit && Date.now() - hit.at < QUESTION_CACHE_MS) return hit.qs;
  const qs = await Question.find({ _id: { $in: b.questionIds } })
    .select("question options questionBn questionEn optionsBn optionsEn image chapter topic difficulty correctAnswer explanation explanationBn explanationEn")
    .lean();
  questionCache.set(k, { at: Date.now(), qs });
  if (questionCache.size > 2000) questionCache.delete(questionCache.keys().next().value);
  return qs;
}

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** Only shared, admin/teacher-controlled questions are used for battles. */
const BATTLE_POOL = { hidden: { $ne: true }, $or: [{ isPublic: true }, { organizationId: null }] };

function cleanFilters(body = {}) {
  const s = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const difficulty = ["easy", "medium", "hard", "mixed"].includes(body.difficulty) ? body.difficulty : "mixed";
  return { className: s(body.className, 40), subject: s(body.subject, 60), chapter: s(body.chapter), topic: s(body.topic), difficulty };
}

// Same standard chapters/topics as the Question Bank (utils/syllabusTopics.js).
async function questionMatch(f) {
  const m = { ...BATTLE_POOL };
  if (f.className) m.className = f.className;
  if (f.subject) m.subject = f.subject;
  const ch = findChapterConfig(f.chapter);
  if (f.chapter) m.chapter = ch ? { $in: ch.storedChapterNames } : f.chapter;
  // Never serve a question that needs a missing passage/figure or is malformed (read-time check only).
  const skip = await unplayableIds();
  if (f.topic && f.topic !== UNCATEGORISED) {
    const bad = new Set(skip.map(String));
    m._id = { $in: (await idsForTopics([f.topic], ch?.chapterId)).filter((id) => !bad.has(String(id))) };
  } else {
    m._id = { $nin: skip };
  }
  return m;
}

export async function pickQuestions(f, n = QUESTIONS_PER_BATTLE) {
  const base = await questionMatch(f);
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
async function finalize(battleId, opts = {}) {
  const r = await finalizeInner(battleId, opts);
  notifyBattle(battleId);
  return r;
}

async function finalizeInner(battleId, { forfeitUserId = null, forfeitReason = "forfeit" } = {}) {
  const b = await Battle.findOneAndUpdate({ _id: battleId, status: "active" }, { $set: { status: "finished", finishedAt: new Date() } }, { new: true });
  if (!b) return Battle.findById(battleId);
  if (b.mode === "group") return finalizeGroup(b);
  const [a, c] = b.players;
  const used = (p) => {
    const last = p.answers.length ? Math.max(...p.answers.map((x) => new Date(x.answeredAt).getTime())) : b.endsAt.getTime();
    return last - b.startedAt.getTime();
  };
  let winner = null;
  let reason = "score";
  if (forfeitUserId) {
    winner = String(a.userId) === String(forfeitUserId) ? c : a;
    reason = forfeitReason;
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
  b.settledAt = new Date();
  await b.save();
  return b;
}

/** Seconds used by a player (server timestamps); players without answers count the full clock. */
function usedMs(b, p) {
  const last = p.answers.length ? Math.max(...p.answers.map((x) => new Date(x.answeredAt).getTime())) : b.endsAt.getTime();
  return last - b.startedAt.getTime();
}

/** Group result: rank by score, then speed; players who left rank last. */
async function finalizeGroup(b) {
  const ranked = [...b.players].sort((x, y) => (x.leftAt ? 1 : 0) - (y.leftAt ? 1 : 0) || y.score - x.score || usedMs(b, x) - usedMs(b, y));
  const [first, second] = ranked;
  const tie = second && !first.leftAt && !second.leftAt && first.score === second.score && usedMs(b, first) === usedMs(b, second);
  b.isDraw = Boolean(tie);
  b.winnerId = tie ? null : first.userId;
  b.resultReason = tie ? "draw" : "score";
  const xp = await applyGroupResult(b, ranked);
  b.players.forEach((p) => {
    p.placement = ranked.findIndex((r) => String(r.userId) === String(p.userId)) + 1;
    p.xpEarned = xp.get(String(p.userId)) || 0;
  });
  b.markModified("players");
  b.settledAt = new Date();
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
  if (b.status === "waiting" && b.mode === "random" && b.players.length === 1) {
    const merged = await tryMerge(b, now);
    if (merged) return merged;
  }
  if (b.status === "active" && now.getTime() > b.endsAt.getTime() + ANSWER_GRACE_MS) {
    return finalize(b._id);
  }
  if (b.status === "active" && now >= b.startedAt) {
    const after = await applyDisconnects(b, now);
    if (after) return after;
  }
  return b;
}

/**
 * Two players waiting in separate random rooms (their ratings were too far apart when
 * they arrived) are paired once their widening bands overlap. The newer room merges
 * into the older one; ordering by (createdAt, _id) means only one side ever merges.
 */
async function tryMerge(b, now) {
  const me = b.players[0];
  const older = await Battle.find({
    _id: { $ne: b._id },
    status: "waiting",
    mode: "random",
    matchKey: b.matchKey,
    expiresAt: { $gt: now },
    "players.0.userId": { $ne: me.userId },
    "players.1": { $exists: false },
    $or: [{ createdAt: { $lt: b.createdAt } }, { createdAt: b.createdAt, _id: { $lt: b._id } }],
  })
    .sort({ createdAt: 1 })
    .limit(10)
    .select("hostRating createdAt")
    .lean();
  for (const o of older) {
    const waited = Math.max(now - b.createdAt, now - o.createdAt) / 1000;
    if (!withinBand(b.hostRating, o.hostRating, waited)) continue;
    const mine = await Battle.findOneAndUpdate({ _id: b._id, status: "waiting", "players.1": { $exists: false } }, { $set: { status: "cancelled", resultReason: "merged" } }, { new: true });
    if (!mine) return Battle.findById(b._id);
    const t = timing(now);
    const joined = await Battle.findOneAndUpdate(
      { _id: o._id, status: "waiting", "players.1": { $exists: false } },
      { $push: { players: playerEntry({ _id: me.userId, name: me.name }) }, $set: { status: "active", startedAt: t.startedAt, endsAt: t.endsAt, expiresAt: null } },
      { new: true }
    );
    if (joined) {
      await Battle.updateOne({ _id: b._id }, { $set: { mergedInto: joined._id } });
      notifyBattle(joined._id);
      notifyBattle(b._id);
      return Battle.findById(b._id);
    }
    // The older room was taken meanwhile: reopen ours and keep looking.
    await Battle.updateOne({ _id: b._id, status: "cancelled", resultReason: "merged" }, { $set: { status: "waiting", resultReason: "" } });
  }
  return null;
}

const lastSeenMs = (p) => new Date(p.lastSeenAt || p.joinedAt || 0).getTime();
const isConnected = (p, now = Date.now()) => now - lastSeenMs(p) <= DISCONNECT_AFTER_MS;

/** Forfeit / remove players whose reconnect grace has run out. Returns the updated battle, or null if nothing changed. */
async function applyDisconnects(b, now) {
  const limit = now.getTime() - DISCONNECT_AFTER_MS - RECONNECT_GRACE_MS;
  const total = b.questionIds.length;
  // A player who already answered everything is done, not disconnected.
  const gone = b.players.filter((p) => !p.leftAt && p.answers.length < total && lastSeenMs(p) < limit);
  if (!gone.length) return null;
  if (b.mode === "group") {
    for (const p of gone) {
      await Battle.updateOne({ _id: b._id, status: "active", players: { $elemMatch: { userId: p.userId, leftAt: null } } }, { $set: { "players.$.leftAt": now } });
    }
    const after = await Battle.findById(b._id);
    const stillIn = after.players.filter((p) => !p.leftAt);
    if (stillIn.length <= 1 || stillIn.every((p) => p.answers.length >= total)) return finalize(b._id);
    notifyBattle(b._id);
    return after;
  }
  // 1v1: only when the other player is still around; if both dropped, the clock ends it.
  const here = b.players.filter((p) => !gone.includes(p));
  if (gone.length === 1 && here.length === 1 && isConnected(here[0], now.getTime())) {
    return finalize(b._id, { forfeitUserId: gone[0].userId, forfeitReason: "disconnect" });
  }
  return null;
}

const graceEndsAt = (p) => new Date(lastSeenMs(p) + DISCONNECT_AFTER_MS + RECONNECT_GRACE_MS);

// finalize() claims the battle (status "finished") before ratings/XP/placements are written.
// Until that second write lands, report it as still running so clients keep polling.
// Battles finished before settledAt existed are treated as settled after 30 s.
function settled(b) {
  return Boolean(b.settledAt) || (b.finishedAt && Date.now() - new Date(b.finishedAt).getTime() > 30_000);
}
function shownStatus(b) {
  return b.status === "finished" && !settled(b) ? "active" : b.status;
}

async function viewFor(b, userId) {
  const me = b.players.find((p) => String(p.userId) === String(userId));
  const opp = b.players.find((p) => String(p.userId) !== String(userId));
  const view = {
    _id: b._id,
    mode: b.mode,
    status: shownStatus(b),
    roomCode: b.mode === "friend" || b.mode === "group" ? b.roomCode : undefined,
    filters: b.filters,
    secondsPerQuestion: b.secondsPerQuestion,
    totalQuestions: b.questionIds.length,
    startedAt: b.startedAt,
    endsAt: b.endsAt,
    expiresAt: b.expiresAt,
    serverNow: new Date(),
    me: me && { name: me.name, score: me.score, correctCount: me.correctCount, wrongCount: me.wrongCount, answered: me.answers.length, answers: me.answers, ratingBefore: me.ratingBefore, ratingAfter: me.ratingAfter, xpEarned: me.xpEarned },
    opponent: opp ? { name: opp.name, score: opp.score, answered: opp.answers.length, ratingBefore: opp.ratingBefore, ratingAfter: opp.ratingAfter, connected: Boolean(opp.leftAt) || isConnected(opp), graceEndsAt: !opp.leftAt && !isConnected(opp) ? graceEndsAt(opp) : null } : null,
    mergedInto: b.mergedInto || null,
    reconnectGraceSeconds: RECONNECT_GRACE_MS / 1000,
    maxPlayers: b.maxPlayers || 2,
    isHost: String(b.createdBy) === String(userId),
    players: b.players.map((p) => ({ name: p.name, score: p.score, answered: p.answers.length, placement: p.placement, left: Boolean(p.leftAt), connected: Boolean(p.leftAt) || isConnected(p), isMe: String(p.userId) === String(userId) })),
    result: shownStatus(b) === "finished" ? { winner: b.isDraw ? "draw" : String(b.winnerId) === String(userId) ? "me" : "opponent", reason: b.resultReason, placement: me?.placement || null } : null,
  };
  if (b.status === "active" || b.status === "finished") {
    const qs = await battleQuestions(b);
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
    const myRating = await ratingOf(req.user._id);
    // Oldest compatible room first; compatibility widens with how long that room has waited.
    const candidates = await Battle.find({ status: "waiting", mode: "random", matchKey, expiresAt: { $gt: now }, "players.0.userId": { $ne: req.user._id }, "players.1": { $exists: false } })
      .sort({ createdAt: 1 })
      .limit(25)
      .select("hostRating createdAt")
      .lean();
    let joined = null;
    for (const c of candidates) {
      if (!withinBand(myRating, c.hostRating, (now - c.createdAt) / 1000)) continue;
      joined = await Battle.findOneAndUpdate(
        { _id: c._id, status: "waiting", "players.1": { $exists: false } },
        { $push: { players: playerEntry(req.user) }, $set: { status: "active", startedAt: t.startedAt, endsAt: t.endsAt, expiresAt: null } },
        { new: true }
      );
      if (joined) break;
    }
    if (joined) {
      notifyBattle(joined._id);
      return res.json({ success: true, battle: await viewFor(joined, req.user._id), matched: true });
    }

    const questionIds = await pickQuestions(f);
    if (questionIds.length < 5) return fail(res, 400, "Not enough questions for this topic yet. Try a wider topic or another difficulty.");
    const b = await Battle.create({
      mode: "random",
      ranked: true,
      createdBy: req.user._id,
      filters: f,
      matchKey,
      hostRating: myRating,
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
    const group = req.body?.group === true || req.body?.group === "true";
    const maxPlayers = Math.max(3, Math.min(6, parseInt(req.body?.maxPlayers) || 4));
    const questionIds = await pickQuestions(f);
    if (questionIds.length < 5) return fail(res, 400, "Not enough questions for this topic yet. Try a wider topic or another difficulty.");
    let b;
    for (let i = 0; i < 5 && !b; i++) {
      try {
        b = await Battle.create({
          mode: group ? "group" : "friend",
          maxPlayers: group ? maxPlayers : 2,
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
    const room = await Battle.findOne({ roomCode: code, status: "waiting", expiresAt: { $gt: now } }).select("mode maxPlayers").lean();
    if (room?.mode === "group") {
      const g = await Battle.findOneAndUpdate(
        { roomCode: code, status: "waiting", expiresAt: { $gt: now }, "players.userId": { $ne: req.user._id }, $expr: { $lt: [{ $size: "$players" }, "$maxPlayers"] } },
        { $push: { players: playerEntry(req.user) } },
        { new: true }
      );
      if (!g) return fail(res, 409, "This group room is full or no longer open.");
      notifyBattle(g._id);
      return res.json({ success: true, battle: await viewFor(g, req.user._id) });
    }
    const t = timing(now);
    const b = await Battle.findOneAndUpdate(
      { roomCode: code, mode: "friend", status: "waiting", expiresAt: { $gt: now }, "players.0.userId": { $ne: req.user._id }, "players.1": { $exists: false } },
      { $push: { players: playerEntry(req.user) }, $set: { status: "active", startedAt: t.startedAt, endsAt: t.endsAt, expiresAt: null } },
      { new: true }
    );
    if (!b) return fail(res, 404, "This room is not available. It may have expired or already started.");
    notifyBattle(b._id);
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
    if (b.players.find((p) => String(p.userId) === String(req.user._id))?.leftAt) return fail(res, 409, "You left this battle.");
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
        $set: { "players.$.lastSeenAt": now },
        $inc: { "players.$.score": points, [correct ? "players.$.correctCount" : "players.$.wrongCount"]: 1 },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, "You already answered this question.");

    let current = updated;
    const remaining = current.players.filter((p) => !p.leftAt);
    if (current.players.length >= 2 && remaining.every((p) => p.answers.length >= current.questionIds.length)) {
      current = await finalize(current._id);
    } else {
      notifyBattle(current._id);
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
    if (b.mode === "group" && b.status === "waiting" && String(b.createdBy) !== String(req.user._id)) {
      await Battle.updateOne({ _id: b._id, status: "waiting" }, { $pull: { players: { userId: req.user._id } } });
      notifyBattle(b._id);
      return res.json({ success: true, left: true });
    }
    if (b.mode === "group" && b.status === "active") {
      await Battle.updateOne({ _id: b._id, status: "active", "players.userId": req.user._id }, { $set: { "players.$.leftAt": new Date() } });
      const after = await Battle.findById(b._id);
      const stillIn = after.players.filter((p) => !p.leftAt);
      if (stillIn.length <= 1 || stillIn.every((p) => p.answers.length >= after.questionIds.length)) await finalize(after._id);
      const fresh = await Battle.findById(b._id);
      notifyBattle(b._id);
      return res.json({ success: true, battle: await viewFor(fresh, req.user._id) });
    }
    if (b.status === "waiting") {
      await Battle.updateOne({ _id: b._id, status: "waiting" }, { $set: { status: "cancelled", resultReason: "left" } });
    } else if (b.status === "active") {
      await finalize(b._id, { forfeitUserId: req.user._id });
    }
    const fresh = await Battle.findById(b._id);
    notifyBattle(b._id);
    return res.json({ success: true, battle: await viewFor(fresh, req.user._id) });
  } catch (e) {
    console.error("leaveBattle:", e.message);
    return fail(res, 500, "Could not leave the battle.");
  }
};

// POST /api/battles/:id/start — host starts a group room (2+ players)
export const startGroupBattle = async (req, res) => {
  try {
    const b = await loadParticipantBattle(req, res);
    if (!b) return;
    if (b.mode !== "group") return fail(res, 400, "Only group rooms are started by the host.");
    if (String(b.createdBy) !== String(req.user._id)) return fail(res, 403, "Only the host can start the battle.");
    if (b.players.length < 2) return fail(res, 400, "At least 2 players are needed.");
    const t = timing(new Date());
    const started = await Battle.findOneAndUpdate({ _id: b._id, status: "waiting" }, { $set: { status: "active", startedAt: t.startedAt, endsAt: t.endsAt, expiresAt: null } }, { new: true });
    if (!started) return fail(res, 409, "This room has already started or closed.");
    // Everyone in the room gets a fresh heartbeat so the reconnect grace starts now.
    await Battle.updateOne({ _id: started._id }, { $set: { "players.$[].lastSeenAt": new Date() } });
    notifyBattle(started._id);
    return res.json({ success: true, battle: await viewFor(started, req.user._id) });
  } catch (e) {
    console.error("startGroupBattle:", e.message);
    return fail(res, 500, "Could not start the battle.");
  }
};

// GET /api/battles/:id/stream — Server-Sent Events. Read with fetch() so the token stays in
// the Authorization header (never in the URL). Pushes the same view as GET /:id whenever
// it changes: at once for changes made in this process, otherwise within STREAM_TICK_MS.
// Each tick is also the player's heartbeat for the reconnect grace period.
const openStreams = new Map(); // userId → number of open streams
export const streamBattle = async (req, res) => {
  const first = await loadParticipantBattle(req, res);
  if (!first) return;
  const uid = String(req.user._id);
  if ((openStreams.get(uid) || 0) >= 3) return fail(res, 429, "Too many open battle connections.");
  openStreams.set(uid, (openStreams.get(uid) || 0) + 1);
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  const id = String(first._id);
  let lastKey = "";
  let closed = false;
  let busy = false;
  let again = false;
  let lastBeat = 0;
  const push = async () => {
    if (closed) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      let b = await Battle.findById(id);
      if (!b) return end();
      if ((b.status === "active" || b.status === "waiting") && Date.now() - lastBeat >= 5000) {
        lastBeat = Date.now();
        await Battle.updateOne({ _id: id, "players.userId": req.user._id }, { $set: { "players.$.lastSeenAt": new Date() } });
        b = await Battle.findById(id);
      }
      b = await refresh(b);
      const view = await viewFor(b, req.user._id);
      const { serverNow, ...stable } = view; // eslint-disable-line no-unused-vars
      const key = JSON.stringify(stable);
      if (key !== lastKey) {
        lastKey = key;
        res.write(`data: ${JSON.stringify({ battle: view })}\n\n`);
      } else {
        res.write(": ping\n\n");
      }
      if (view.status === "finished" || view.status === "cancelled") end();
    } catch (e) {
      console.error("streamBattle:", e.message);
      end();
    } finally {
      busy = false;
      if (again && !closed) {
        again = false;
        push();
      }
    }
  };
  const onEvent = () => push();
  battleEvents.on(id, onEvent);
  // BATTLE_STREAM_TICK_MS can lengthen the cross-instance fallback tick (tests use it to
  // prove that in-process changes are pushed, not picked up by the tick).
  const timer = setInterval(push, Number(process.env.BATTLE_STREAM_TICK_MS) || STREAM_TICK_MS);
  const maxLife = setTimeout(end, STREAM_MAX_LIFE_MS);
  function end() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    clearTimeout(maxLife);
    battleEvents.off(id, onEvent);
    const n = (openStreams.get(uid) || 1) - 1;
    if (n > 0) openStreams.set(uid, n);
    else openStreams.delete(uid);
    res.end();
  }
  req.on("close", end);
  push();
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
    const idx = await getTopicIndex();
    // Count only questions the pickers can actually serve.
    const ids = (await Question.find(BATTLE_POOL).distinct("_id")).filter((id) => !idx.get(String(id))?.issues?.length);
    const perChapter = await tallyChapters(ids);
    const perTopic = {};
    ids.forEach((id) => {
      const r = idx.get(String(id));
      if (!r?.chapterId) return;
      const k = r.chapterId + "|" + r.topic;
      perTopic[k] = (perTopic[k] || 0) + 1;
    });
    const chapters = ALL_CHAPTERS.map((c) => ({
      name: c.chapterName,
      count: perChapter[c.chapterId] || 0,
      topics: chapterTopicNames(c.chapterId)
        .filter((t) => t !== UNCATEGORISED)
        .map((t) => ({ name: t, count: perTopic[c.chapterId + "|" + t] || 0 }))
        .filter((t) => t.count > 0),
    })).filter((c) => c.count > 0);
    const classes = (await Question.distinct("className", BATTLE_POOL)).filter(Boolean).sort();
    return res.json({
      success: true,
      classes,
      subjects: [{ name: "ICT", count: ids.length, chapters }],
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
