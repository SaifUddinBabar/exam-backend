// READ-ONLY query-plan audit for the hottest queries. Runs only against a local/test
// database (refuses exam_db via config/db.js). Usage:
//   node --env-file=.env.localtest scripts/audit/perf_explain.mjs
// Output: ../reports/phase10/query_plans.json
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { assertSafeDatabase } from "../../config/db.js";
import { ALL_CHAPTERS } from "../../utils/syllabusTopics.js";

assertSafeDatabase(process.env.MONGO_URI, { ...process.env, NODE_ENV: "development", ALLOW_PRODUCTION_DB: "" });
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const oid = new mongoose.Types.ObjectId();
const now = new Date();

// [name, collection, filter, sort, why]
const QUERIES = [
  ["bank: chapter listing", "questions", { hidden: { $ne: true }, $or: [{ isPublic: true }, { organizationId: null }], chapter: { $in: ALL_CHAPTERS[1].storedChapterNames } }, { createdAt: -1, _id: -1 }, "Question Bank page"],
  ["battle: waiting random rooms", "battles", { status: "waiting", mode: "random", matchKey: "|ict||||mixed", expiresAt: { $gt: now } }, { createdAt: 1 }, "every random find + merge check"],
  ["battle: my open battles", "battles", { "players.userId": oid, status: { $in: ["waiting", "active"] } }, null, "every battle create/join"],
  ["battle: by id", "battles", { _id: oid }, null, "stream tick (every 3 s per player)"],
  ["battle: history", "battles", { "players.userId": oid, status: "finished" }, { finishedAt: -1 }, "battle lobby"],
  ["league: global leaderboard", "playerstats", {}, { rating: -1 }, "league page"],
  ["league: weekly leaderboard", "playerstats", { weekKey: "2026-W46" }, { weeklyXp: -1 }, "league page"],
  ["tournament: leaderboard", "tournamententries", { day: "2026-11-15", finishedAt: { $ne: null } }, { score: -1, timeMs: 1, finishedAt: 1 }, "tournament page"],
  ["exam: attempt lookup", "examattempts", { examId: oid, studentId: oid }, null, "exam start/autosave (burst)"],
  ["exam: ranking", "submissions", { examCode: "EXAM-X" }, { score: -1, createdAt: 1 }, "result/ranking page"],
  ["exam: student submissions", "submissions", { examId: oid, studentId: oid }, null, "result page"],
  ["batches: my memberships", "batchmemberships", { studentId: oid, status: "active" }, null, "dashboard, exam visibility"],
  ["notices: batch audience", "notices", { "audience.batchIds": { $in: [oid] } }, { publishAt: -1 }, "dashboard"],
  ["exams: assigned to batches", "exams", { "assignment.mode": "batches", "assignment.batchIds": { $in: [oid] } }, null, "student exam list"],
  ["users: login by email", "users", { email: "x@y.z" }, null, "login"],
  ["users: login by phone", "users", { phone: "01700000000" }, null, "login"],
];

const stages = (p) => {
  const out = [];
  const walk = (s) => {
    if (!s) return;
    out.push(s.stage + (s.indexName ? `(${s.indexName})` : ""));
    walk(s.inputStage);
    (s.inputStages || []).forEach(walk);
  };
  walk(p);
  return out;
};

const rows = [];
for (const [name, col, filter, sort, why] of QUERIES) {
  let cur = db.collection(col).find(filter);
  if (sort) cur = cur.sort(sort);
  const ex = await cur.limit(50).explain("executionStats");
  const plan = stages(ex.queryPlanner.winningPlan);
  const s = ex.executionStats;
  const collscan = plan.some((x) => x.startsWith("COLLSCAN"));
  const inMemorySort = plan.some((x) => x === "SORT");
  rows.push({ name, collection: col, why, plan: plan.join(" ← "), collscan, inMemorySort, docsExamined: s.totalDocsExamined, keysExamined: s.totalKeysExamined, returned: s.nReturned, ms: s.executionTimeMillis });
}
const out = path.resolve("../reports/phase10/query_plans.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), database: db.databaseName, readOnly: true, rows }, null, 2));
for (const r of rows) console.log(`${r.collscan ? "COLLSCAN" : "index   "} ${r.inMemorySort ? "mem-sort" : "        "} ${String(r.docsExamined).padStart(5)} docs  ${r.name}  [${r.plan}]`);
await mongoose.disconnect();
