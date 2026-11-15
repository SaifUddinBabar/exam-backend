// In-memory topic index: questionId → { chapterId, topic, method }.
// Built from the questions collection with utils/syllabusTopics.js (read-only — nothing is
// written to MongoDB). Rebuilt on demand after questions change, and at most every 10 minutes.
//
// Scale note: fine up to tens of thousands of questions (a few MB). For a much larger bank,
// persist the resolved topic as a field through an approved, reversible migration.
import mongoose from "mongoose";
import Question from "../models/Question.js";
import { resolveQuestionTopic } from "../utils/syllabusTopics.js";
import { playabilityIssues } from "../utils/questionQuality.js";

const TTL_MS = 10 * 60 * 1000;
let index = null; // Map<string, {chapterId, topic, method, issues}>
let builtAt = 0;
let building = null;

export function invalidateTopicIndex() {
  builtAt = 0;
}

async function build() {
  const rows = await Question.find({}).select("chapter topic question options correctAnswer image boardName").lean();
  const m = new Map();
  for (const q of rows) m.set(String(q._id), { ...resolveQuestionTopic(q), issues: playabilityIssues(q) });
  index = m;
  builtAt = Date.now();
  return m;
}

export async function getTopicIndex() {
  if (index && Date.now() - builtAt < TTL_MS) return index;
  if (!building) building = build().finally(() => (building = null));
  return building;
}

/** ObjectIds of questions resolved to `topic` (optionally within `chapterId`) — usable in find() and aggregate(). */
export async function idsForTopics(topics, chapterId) {
  const idx = await getTopicIndex();
  const wanted = new Set(topics);
  const out = [];
  for (const [id, r] of idx) {
    if (chapterId && r.chapterId !== chapterId) continue;
    if (wanted.has(r.topic)) out.push(new mongoose.Types.ObjectId(id));
  }
  return out;
}

/** Tally resolved topics for a list of question ids. */
export async function tallyTopics(ids) {
  const idx = await getTopicIndex();
  const counts = {};
  for (const id of ids) {
    const r = idx.get(String(id));
    const t = r ? r.topic : null;
    if (!t) continue;
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

/** Tally standard chapters for a list of question ids. */
export async function tallyChapters(ids) {
  const idx = await getTopicIndex();
  const counts = {};
  for (const id of ids) {
    const r = idx.get(String(id));
    const c = r?.chapterId || "other";
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/** ObjectIds of questions that cannot stand alone in timed play (see utils/questionQuality.js). */
export async function unplayableIds() {
  const idx = await getTopicIndex();
  const out = [];
  for (const [id, r] of idx) if (r.issues?.length) out.push(new mongoose.Types.ObjectId(id));
  return out;
}

/** True when the question can be used in battles and tournaments. */
export async function isPlayableId(id) {
  const r = (await getTopicIndex()).get(String(id));
  return Boolean(r) && !r.issues?.length;
}
