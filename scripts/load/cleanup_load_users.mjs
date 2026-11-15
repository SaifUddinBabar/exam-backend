// Removes the load-test accounts, their attempts/submissions and LOADTEST exams from a
// LOCAL or STAGING database. Refuses the production database.
//   node --env-file=.env.localtest scripts/load/cleanup_load_users.mjs
import mongoose from "mongoose";
import { assertSafeDatabase } from "../../config/db.js";
assertSafeDatabase(process.env.MONGO_URI, { NODE_ENV: "development" });
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const ids = (await db.collection("users").find({ email: { $regex: "^loadtest\." } }).project({ _id: 1 }).toArray()).map((u) => u._id);
const exams = (await db.collection("exams").find({ examCode: { $regex: "^LOADTEST-" } }).project({ _id: 1 }).toArray()).map((e) => e._id);
const r = {
  attempts: (await db.collection("examattempts").deleteMany({ $or: [{ studentId: { $in: ids } }, { examId: { $in: exams } }] })).deletedCount,
  submissions: (await db.collection("submissions").deleteMany({ $or: [{ studentId: { $in: ids } }, { examId: { $in: exams } }] })).deletedCount,
  battles: (await db.collection("battles").deleteMany({ "players.userId": { $in: ids } })).deletedCount,
  stats: (await db.collection("playerstats").deleteMany({ userId: { $in: ids } })).deletedCount,
  exams: (await db.collection("exams").deleteMany({ _id: { $in: exams } })).deletedCount,
  users: (await db.collection("users").deleteMany({ _id: { $in: ids } })).deletedCount,
};
console.log(db.databaseName, r);
await mongoose.disconnect();
