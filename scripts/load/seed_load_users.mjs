// Seeds a LOCAL or STAGING database for load testing: N students, one teacher and one
// exam assigned to all students. Writes signed tokens to .local-snapshot/load-tokens.json
// (gitignored), so the runner never hits the rate-limited login endpoint.
// Refuses the production database (config/db.js guard), whatever NODE_ENV says.
//
//   node --env-file=.env.localtest scripts/load/seed_load_users.mjs --students 200 --questions 25
//   node --env-file=.env.staging   scripts/load/seed_load_users.mjs --students 2000
import fs from "fs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { assertSafeDatabase } from "../../config/db.js";
import Exam from "../../models/Exam.js";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const STUDENTS = Math.min(20000, parseInt(arg("students", "200")));
const QUESTIONS = Math.min(100, parseInt(arg("questions", "25")));
const PREFIX = "loadtest";

assertSafeDatabase(process.env.MONGO_URI, { NODE_ENV: "development" });
const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
if (!secret) throw new Error("Set JWT_ACCESS_SECRET (or JWT_SECRET) to the target server's secret.");
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
console.log("database:", db.databaseName);

// Only this script's own accounts and exams are replaced.
const users = db.collection("users");
await users.deleteMany({ email: { $regex: `^${PREFIX}\\.` } });
await Exam.deleteMany({ examCode: { $regex: "^LOADTEST-" } });

const now = new Date();
const tId = (await users.insertOne({ name: "Load Test Teacher", email: `${PREFIX}.teacher@load.test`, role: "tutor", globalRole: "user", isActive: true, createdAt: now, updatedAt: now })).insertedId;
const docs = Array.from({ length: STUDENTS }, (_, i) => ({ name: `Load Student ${i + 1}`, email: `${PREFIX}.s${i + 1}@load.test`, phone: `0199${String(i).padStart(7, "0")}`, role: "student", globalRole: "user", isActive: true, createdAt: now, updatedAt: now }));
const ids = Object.values((await users.insertMany(docs)).insertedIds);

const qs = await db.collection("questions").aggregate([{ $match: { hidden: { $ne: true }, organizationId: null } }, { $sample: { size: QUESTIONS } }, { $project: { _id: 1 } }]).toArray();
const examCode = `LOADTEST-${Date.now().toString(36).toUpperCase()}`;
await Exam.create({ title: "Load test exam", examCode, questions: qs.map((q) => q._id), duration: 60, authorId: tId, assignment: { mode: "all", batchIds: [], studentIds: [] }, allowRetake: true, maxAttempts: 1000 });

const sign = (id) => jwt.sign({ id: String(id) }, secret, { expiresIn: "6h" });
fs.mkdirSync(".local-snapshot", { recursive: true });
fs.writeFileSync(".local-snapshot/load-tokens.json", JSON.stringify({ database: db.databaseName, examCode, teacher: sign(tId), students: ids.map(sign) }));
console.log(`seeded ${STUDENTS} students and exam ${examCode} (${qs.length} questions) → .local-snapshot/load-tokens.json`);
await mongoose.disconnect();
