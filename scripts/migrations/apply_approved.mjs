// Approval-gated, reversible data migration for Phase 2 proposals.
//
// Nothing changes unless:
//   1. you pass --apply (default is a dry run that only prints what would change), and
//   2. the change is listed in an approval file you edited by hand.
//
// Usage
//   node scripts/migrations/apply_approved.mjs --approval ../reports/phase2/approved.json            (dry run)
//   node scripts/migrations/apply_approved.mjs --approval ../reports/phase2/approved.json --apply    (writes)
//   node scripts/migrations/apply_approved.mjs --rollback backups/migration-<stamp>.json --apply     (undo)
//
// approved.json format (only include rows you approved):
// {
//   "moveSubject":   [{ "id": "...", "subject": "Physics", "chapter": "..." , "topic": "" }],
//   "setTopic":      [{ "id": "...", "topic": "ব্যান্ডউইথ (Bandwidth)" }],
//   "hideDuplicate": [{ "id": "...", "duplicateOf": "..." }],
//   "setDifficulty": [{ "id": "...", "difficulty": "unclassified" }],
//   "dropLegacyBatchIndex": true
// }
// Before writing, every affected document is saved to backups/migration-<stamp>.json,
// which is also the rollback file.
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { EJSON } from "bson";
import "../../config/env.js";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null);
const APPLY = flag("--apply");
const approvalPath = val("--approval");
const rollbackPath = val("--rollback");
const ALLOWED_DIFFICULTY = ["easy", "medium", "hard", "unclassified"];

if (!approvalPath && !rollbackPath) {
  console.error("Pass --approval <file> or --rollback <file>.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const Q = db.collection("questions");
console.log(`Database: ${db.databaseName}  Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

if (rollbackPath) {
  const backup = EJSON.parse(fs.readFileSync(rollbackPath, "utf8"), { relaxed: false });
  console.log(`Rollback restores ${backup.documents.length} question documents from ${rollbackPath}`);
  if (APPLY) {
    for (const doc of backup.documents) await Q.replaceOne({ _id: doc._id }, doc);
    console.log("Rollback applied.");
  }
  await mongoose.disconnect();
  process.exit(0);
}

const approval = JSON.parse(fs.readFileSync(approvalPath, "utf8"));
const oid = (s) => new mongoose.Types.ObjectId(String(s));
const ops = [];
for (const r of approval.moveSubject || []) {
  if (!r.subject || !r.chapter) throw new Error(`moveSubject ${r.id}: subject and chapter required`);
  ops.push({ id: r.id, set: { subject: r.subject, chapter: r.chapter, ...(r.topic !== undefined ? { topic: r.topic } : {}) } });
}
for (const r of approval.setTopic || []) {
  if (!r.topic) throw new Error(`setTopic ${r.id}: topic required`);
  ops.push({ id: r.id, set: { topic: r.topic } });
}
for (const r of approval.hideDuplicate || []) {
  if (!r.duplicateOf) throw new Error(`hideDuplicate ${r.id}: duplicateOf required`);
  ops.push({ id: r.id, set: { hidden: true, hiddenReason: "duplicate", duplicateOf: oid(r.duplicateOf) } });
}
for (const r of approval.setDifficulty || []) {
  if (!ALLOWED_DIFFICULTY.includes(r.difficulty)) throw new Error(`setDifficulty ${r.id}: invalid difficulty`);
  ops.push({ id: r.id, set: { difficulty: r.difficulty } });
}

const ids = [...new Set(ops.map((o) => o.id))].map(oid);
const docs = await Q.find({ _id: { $in: ids } }).toArray();
const found = new Set(docs.map((d) => String(d._id)));
const missing = ops.filter((o) => !found.has(String(o.id)));
if (missing.length) {
  console.error(`Aborting: ${missing.length} approved ids not found:`, missing.slice(0, 5).map((m) => m.id));
  process.exit(1);
}
// Duplicate targets must exist and must not themselves be hidden.
for (const r of approval.hideDuplicate || []) {
  const t = await Q.findOne({ _id: oid(r.duplicateOf) });
  if (!t || t.hidden) throw new Error(`hideDuplicate ${r.id}: original ${r.duplicateOf} missing or hidden`);
}

const byId = new Map(docs.map((d) => [String(d._id), d]));
let changes = 0;
for (const o of ops) {
  const d = byId.get(String(o.id));
  const diff = Object.entries(o.set).filter(([k, v]) => String(d[k] ?? "") !== String(v ?? ""));
  if (!diff.length) continue;
  changes += 1;
  console.log(`${o.id}: ${diff.map(([k, v]) => `${k}: ${JSON.stringify(d[k] ?? null)} -> ${JSON.stringify(v)}`).join("; ")}`);
}
console.log(`${changes} question documents would change (${ops.length} approved operations).`);
if (approval.dropLegacyBatchIndex) {
  const idx = (await db.collection("batches").indexes()).map((i) => i.name);
  console.log(`Legacy batch index organizationId_1_name_1 present: ${idx.includes("organizationId_1_name_1")} (batches: ${await db.collection("batches").countDocuments()})`);
}

if (APPLY) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync("backups", { recursive: true });
  const backupFile = path.join("backups", `migration-${stamp}.json`);
  fs.writeFileSync(backupFile, EJSON.stringify({ createdAt: new Date(), approvalPath, documents: docs }, { relaxed: false }));
  console.log(`Backup written: ${backupFile} (use it with --rollback to undo)`);
  for (const o of ops) await Q.updateOne({ _id: oid(o.id) }, { $set: { ...o.set, updatedAt: new Date() } });
  if (approval.dropLegacyBatchIndex) {
    const idx = (await db.collection("batches").indexes()).map((i) => i.name);
    if (idx.includes("organizationId_1_name_1")) await db.collection("batches").dropIndex("organizationId_1_name_1");
  }
  console.log("Applied.");
}
await mongoose.disconnect();
