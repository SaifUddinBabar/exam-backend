// Teacher review queue (read-only) and the production-database guard.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";
import { assertSafeDatabase } from "../config/db.js";

describe("production database guard", () => {
  test("a non-production process refuses exam_db; production and local/test databases are allowed", () => {
    assert.throws(() => assertSafeDatabase("mongodb+srv://u:p@h.example/exam_db?retryWrites=true", { NODE_ENV: "development" }), /Refusing/);
    assert.throws(() => assertSafeDatabase("mongodb+srv://u:p@h.example/exam_db", {}), /Refusing/);
    assert.doesNotThrow(() => assertSafeDatabase("mongodb+srv://u:p@h.example/exam_db", { NODE_ENV: "production" }));
    assert.doesNotThrow(() => assertSafeDatabase("mongodb+srv://u:p@h.example/examino_local_test", { NODE_ENV: "development" }));
    assert.doesNotThrow(() => assertSafeDatabase("mongodb://127.0.0.1:27017/examino_ci_test", { NODE_ENV: "test" }));
  });
});

describe("teacher review queue", () => {
  let app, teacher, student;
  before(async () => {
    app = await startApp();
    teacher = await makeUser("tutor");
    student = await makeUser("student");
  });
  after(stopApp);

  test("staff only", async () => {
    assert.equal((await request(app).get("/api/questions/review").set(student.auth)).status, 403);
    assert.equal((await request(app).get("/api/questions/review")).status, 401);
  });
  test("uncategorised counts agree with the topic-count endpoint for every chapter", async () => {
    const r = await request(app).get("/api/questions/review?kind=uncategorised").set(teacher.auth);
    assert.equal(r.status, 200);
    let sum = 0;
    for (const c of r.body.chapters) {
      const tc = await request(app).get(`/api/practice/topic-counts?chapter=${encodeURIComponent(c.chapterName)}`).set(teacher.auth);
      assert.equal(r.body.counts[c.chapterId].uncategorised, tc.body.noTopicCount, c.chapterId);
      sum += tc.body.noTopicCount;
    }
    assert.equal(r.body.total, sum);
    assert.ok(sum > 100, "the snapshot has many uncategorised questions");
  });
  test("items carry suggestions only; listing changes nothing", async () => {
    const before = await mongoose.model("Question").countDocuments({ topic: { $exists: true } });
    const r = await request(app).get("/api/questions/review?kind=uncategorised&chapter=ch3&limit=50").set(teacher.auth);
    assert.equal(r.body.items.length, 50);
    assert.ok(r.body.items.every((i) => i.resolved.chapterId === "ch3" && i.resolved.topic.includes("Uncategorised")));
    assert.ok(r.body.items.some((i) => i.hints.length > 0), "some questions have suggestions");
    assert.equal(await mongoose.model("Question").countDocuments({ topic: { $exists: true } }), before);
    const page2 = await request(app).get("/api/questions/review?kind=uncategorised&chapter=ch3&limit=50&page=2").set(teacher.auth);
    const ids1 = new Set(r.body.items.map((i) => i._id));
    assert.ok(page2.body.items.every((i) => !ids1.has(i._id)), "pages do not overlap");
  });
  test("a teacher's topic choice is respected and the question leaves the queue", async () => {
    const r = await request(app).get("/api/questions/review?kind=uncategorised&chapter=ch2&limit=1").set(teacher.auth);
    const q = r.body.items[0];
    const topic = r.body.chapters.find((c) => c.chapterId === "ch2").topics[0];
    const u = await request(app).put(`/api/questions/${q._id}`).set(teacher.auth).send({ topic });
    assert.equal(u.status, 200, JSON.stringify(u.body));
    const after = await request(app).get("/api/questions/review?kind=uncategorised&chapter=ch2&limit=50").set(teacher.auth);
    assert.equal(after.body.total, r.body.total - 1);
    const rev = await request(app).get(`/api/questions/${q._id}/revisions`).set(teacher.auth);
    assert.equal(rev.body.revisions[0].before.topic ?? "", q.topic ?? "", "the original topic is kept in the revision history");
  });
  test("unplayable view lists questions with readable reasons", async () => {
    const r = await request(app).get("/api/questions/review?kind=unplayable&limit=50").set(teacher.auth);
    assert.ok(r.body.total >= 40);
    assert.ok(r.body.items.every((i) => i.issues.length && i.issues.every((x) => x.label && x.code)));
  });
});
