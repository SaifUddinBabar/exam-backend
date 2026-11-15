// Verifies the approval-gated migration: dry run changes nothing, apply changes only
// approved rows and writes a backup, rollback restores the exact original documents.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "fs";
import path from "path";
import os from "os";
import mongoose from "mongoose";
import { startApp, stopApp } from "./harness.mjs";

let ids;
before(async () => {
  await startApp();
  ids = (await mongoose.connection.db.collection("questions").find({}).limit(3).toArray()).map((d) => d._id);
});
after(stopApp);

const run = (args) => execFileSync(process.execPath, ["scripts/migrations/apply_approved.mjs", ...args], { env: { ...process.env }, encoding: "utf8" });

test("dry run, apply and rollback", async () => {
  const Q = mongoose.connection.db.collection("questions");
  const original = await Q.find({ _id: { $in: ids } }).sort({ _id: 1 }).toArray();
  const approval = path.join(os.tmpdir(), `approval-${Date.now()}.json`);
  fs.writeFileSync(
    approval,
    JSON.stringify({
      moveSubject: [{ id: String(ids[0]), subject: "Physics", chapter: "Physics — Test" }],
      setTopic: [{ id: String(ids[1]), topic: "ব্যান্ডউইথ (Bandwidth)" }],
      hideDuplicate: [{ id: String(ids[2]), duplicateOf: String(ids[1]) }],
    })
  );

  const dry = run(["--approval", approval]);
  assert.match(dry, /DRY RUN/);
  assert.deepEqual(await Q.find({ _id: { $in: ids } }).sort({ _id: 1 }).toArray(), original);

  const applied = run(["--approval", approval, "--apply"]);
  const backup = applied.match(/Backup written: (\S+)/)[1];
  const after1 = await Q.find({ _id: { $in: ids } }).sort({ _id: 1 }).toArray();
  const byId = new Map(after1.map((d) => [String(d._id), d]));
  assert.equal(byId.get(String(ids[0])).subject, "Physics");
  assert.equal(byId.get(String(ids[1])).topic, "ব্যান্ডউইথ (Bandwidth)");
  assert.equal(byId.get(String(ids[2])).hidden, true);
  assert.equal(byId.get(String(ids[0])).question, original.find((d) => String(d._id) === String(ids[0])).question, "question text must never change");

  run(["--rollback", backup, "--apply"]);
  assert.deepEqual(await Q.find({ _id: { $in: ids } }).sort({ _id: 1 }).toArray(), original);
  fs.unlinkSync(backup);
});

test("refuses approvals with unknown ids", async () => {
  const approval = path.join(os.tmpdir(), `approval-bad-${Date.now()}.json`);
  fs.writeFileSync(approval, JSON.stringify({ setTopic: [{ id: "000000000000000000000000", topic: "x" }] }));
  assert.throws(() => run(["--approval", approval, "--apply"]));
});
