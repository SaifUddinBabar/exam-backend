// Prepares an isolated local test database (default "examino_local_test") on the
// MONGO_URI cluster: loads the read-only production snapshot and adds test accounts.
// Refuses to touch the production database. Test credentials are written to
// .local-snapshot/test-accounts.json (gitignored).
//
//   node scripts/dev/seed_local_test_db.mjs
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { EJSON } from "bson";
import dotenv from "dotenv";

dotenv.config();
const DB = process.env.LOCAL_TEST_DB || "examino_local_test";
if (DB === "exam_db") throw new Error("Refusing to seed the production database");
const u = new URL(process.env.MONGO_URI);
u.pathname = `/${DB}`;
await mongoose.connect(u.toString());
const db = mongoose.connection.db;
if (db.databaseName !== DB) throw new Error("Unexpected database");
await db.dropDatabase();

const dir = path.resolve(".local-snapshot");
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "test-accounts.json")) {
  const docs = EJSON.parse(fs.readFileSync(path.join(dir, f), "utf8"), { relaxed: false });
  if (docs.length) await db.collection(f.replace(/\.json$/, "")).insertMany(docs);
}

const accounts = [];
const now = new Date();
for (const [role, name, email, globalRole = "user"] of [
  ["tutor", "Local Test Teacher", "teacher.local@test.examino"],
  ["student", "Rahim Local", "rahim.local@test.examino"],
  ["student", "Karim Local", "karim.local@test.examino"],
  ["student", "Nusrat Local", "nusrat.local@test.examino"],
  ["student", "Local Super Admin", "admin.local@test.examino", "super_admin"],
  ["org_admin", "Local Centre Admin", "centre.local@test.examino"],
]) {
  const password = crypto.randomBytes(6).toString("base64url");
  await db.collection("users").insertOne({
    name,
    email,
    role,
    globalRole,
    phone: "017" + String(crypto.randomInt(10000000, 99999999)),
    passwordHash: await bcrypt.hash(password, 10),
    isActive: true,
    isEmailVerified: true,
    rollNumber: "",
    metadata: { level: "HSC", group: "Science", designation: "", institution: "" },
    createdAt: now,
    updatedAt: now,
  });
  accounts.push({ role: globalRole === "super_admin" ? "super_admin" : role, name, email, password });
}
// A local coaching centre owned by the centre admin, with one test student as member.
const users = db.collection("users");
const centreAdmin = await users.findOne({ email: "centre.local@test.examino" });
const rahim = await users.findOne({ email: "rahim.local@test.examino" });
const org = await db.collection("organizations").insertOne({ name: "Local Test Coaching", slug: "local-test-coaching", code: "LOCAL1", ownerId: centreAdmin._id, status: "active", plan: "free", location: "Dhaka", createdAt: now, updatedAt: now });
await db.collection("organizationmemberships").insertMany([
  { organizationId: org.insertedId, userId: centreAdmin._id, role: "org_admin", status: "active", batchIds: [], studentRoll: "", createdAt: now, updatedAt: now },
  { organizationId: org.insertedId, userId: rahim._id, role: "student", status: "active", batchIds: [], studentRoll: "", createdAt: now, updatedAt: now },
]);
fs.writeFileSync(path.join(dir, "test-accounts.json"), JSON.stringify({ database: DB, accounts }, null, 2));
console.log(`Seeded ${DB}; ${accounts.length} test accounts written to .local-snapshot/test-accounts.json`);
await mongoose.disconnect();
