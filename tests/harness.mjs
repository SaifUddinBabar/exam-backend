// Test harness. Uses an isolated database and loads the read-only production
// snapshot (.local-snapshot/) into it. Production data is never written.
//
// Database selection:
//   TEST_MONGO_URI  – explicit test database URI, or
//   otherwise an in-memory MongoDB (mongodb-memory-server) when it can start, or
//   otherwise a throwaway database "examino_local_test" on the MONGO_URI cluster.
// The harness refuses to run against the production database name (exam_db).
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { EJSON } from "bson";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const TEST_DB = "examino_ci_test"; // separate from the local dev database (examino_local_test)
let mongod;

function withDb(uri, db) {
  const u = new URL(uri);
  u.pathname = `/${db}`;
  return u.toString();
}

async function pickUri() {
  if (process.env.TEST_MONGO_URI) return process.env.TEST_MONGO_URI;
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    mongod = await MongoMemoryServer.create();
    return mongod.getUri(TEST_DB);
  } catch {
    if (!process.env.MONGO_URI) throw new Error("No test database available");
    return withDb(process.env.MONGO_URI, TEST_DB);
  }
}

export async function startApp({ snapshot = true } = {}) {
  const uri = await pickUri();
  const dbName = new URL(uri).pathname.replace("/", "");
  if (!dbName || dbName === "exam_db") throw new Error(`Refusing to run tests against database "${dbName}"`);
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI = uri;
  process.env.JWT_ACCESS_SECRET = "test-secret-" + Math.random().toString(36).slice(2);
  process.env.DISABLE_RATE_LIMIT = "1";
  const { default: app } = await import("../server.js");
  if (mongoose.connection.readyState !== 1) await mongoose.connection.asPromise();
  if (mongoose.connection.db.databaseName !== dbName) throw new Error("Connected to an unexpected database");
  await mongoose.connection.db.dropDatabase();
  if (snapshot) await loadSnapshot();
  await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
  return app;
}

export async function loadSnapshot() {
  const dir = path.resolve(".local-snapshot");
  if (!fs.existsSync(dir)) return;
  const db = mongoose.connection.db;
  for (const f of fs.readdirSync(dir)) {
    const docs = EJSON.parse(fs.readFileSync(path.join(dir, f), "utf8"), { relaxed: false });
    if (docs.length) await db.collection(f.replace(/\.json$/, "")).insertMany(docs);
  }
}

export async function stopApp() {
  if (mongoose.connection.db && mongoose.connection.db.databaseName === TEST_DB) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export const tokenFor = (user) => jwt.sign({ id: String(user._id) }, process.env.JWT_ACCESS_SECRET, { expiresIn: "1h" });

let n = 0;
export async function makeUser(role = "student", extra = {}) {
  const User = mongoose.model("User");
  n += 1;
  const u = await User.create({ name: `Test ${role} ${n}`, email: `t${Date.now()}_${n}@test.local`, role, phone: `0170000${String(n).padStart(4, "0")}`, ...extra });
  return { user: u, token: tokenFor(u), auth: { Authorization: `Bearer ${tokenFor(u)}` } };
}
