// Topic engine tests on the read-only production snapshot (isolated test database).
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";
import { ALL_CHAPTERS, UNCATEGORISED, resolveQuestionTopic } from "../utils/syllabusTopics.js";

let app, teacher;
before(async () => {
  app = await startApp();
  teacher = await makeUser("tutor");
});
after(stopApp);

const get = (url) => request(app).get(url).set(teacher.auth);
const enc = encodeURIComponent;

async function allQuestions(chapter, topic) {
  const out = [];
  for (let page = 1; page < 100; page++) {
    const r = await get(`/api/practice/question-bank?limit=50&page=${page}&chapter=${enc(chapter)}&topic=${enc(topic)}`);
    assert.equal(r.status, 200);
    out.push(...r.body.questions);
    if (page >= r.body.totalPages) break;
  }
  return out;
}

describe("topic engine", () => {
  test("every question resolves to exactly one topic (unit, whole snapshot)", async () => {
    const qs = await mongoose.connection.db.collection("questions").find({}).toArray();
    for (const q of qs) {
      const r = resolveQuestionTopic(q);
      assert.equal(typeof r.topic, "string");
      assert.ok(r.chapterId, `question ${q._id} has no standard chapter (${q.chapter})`);
    }
  });

  test("topic counts reconcile with chapter totals for every chapter — no double counting", async () => {
    for (const ch of ALL_CHAPTERS) {
      const c = await get(`/api/practice/topic-counts?chapter=${enc(ch.chapterName)}`);
      assert.equal(c.status, 200);
      const sum = Object.values(c.body.topicCounts).reduce((a, b) => a + b, 0) + c.body.noTopicCount;
      assert.ok(c.body.stats.total > 0, `${ch.chapterName}: no questions matched the chapter`);
      assert.equal(sum, c.body.stats.total, `${ch.chapterName}: topic counts double-count questions`);
    }
  });

  test("each topic filter returns exactly its count, and topics are disjoint (chapters 3 and 6)", async () => {
    for (const name of [ALL_CHAPTERS[2].chapterName, ALL_CHAPTERS[5].chapterName]) {
      const c = await get(`/api/practice/topic-counts?chapter=${enc(name)}`);
      const seen = new Set();
      for (const [topic, n] of [...Object.entries(c.body.topicCounts), ["__none__", c.body.noTopicCount]]) {
        const qs = await allQuestions(name, topic);
        assert.equal(qs.length, n, `${topic}: filter returned ${qs.length}, count says ${n}`);
        for (const q of qs) {
          assert.ok(!seen.has(q._id), `question ${q._id} appears in more than one topic`);
          seen.add(q._id);
        }
      }
      assert.equal(seen.size, c.body.stats.total);
      assert.ok(seen.size > 40, `${name}: suspiciously few questions (${seen.size})`);
    }
  });

  test("board question counts come from the boardName field", async () => {
    const c = await get(`/api/practice/topic-counts?chapter=${enc("Board Questions")}`);
    const db = mongoose.connection.db.collection("questions");
    const dhaka = await db.countDocuments({ chapter: "Board Questions", boardName: "Dhaka", hidden: { $ne: true }, $or: [{ isPublic: true }, { organizationId: null }] });
    assert.ok(dhaka > 0);
    assert.equal(c.body.topicCounts["ঢাকা বোর্ড (Dhaka)"], dhaka);
  });

  test("Logic Gates does not absorb number-conversion questions", async () => {
    const qs = await allQuestions(ALL_CHAPTERS[2].chapterName, "লজিক গেইট (AND, OR, NOT, NAND, NOR, XOR, XNOR)");
    assert.ok(qs.length > 0);
    const gateWord = /গেইট|গেট|gate|AND|OR|NOT|NAND|NOR|XOR|অ্যান্ড|ন্যান্ড|ইনভার্টার|inverter/;
    const bad = qs.filter((q) => !gateWord.test(`${q.question} ${(q.options || []).join(" ")}`));
    assert.deepEqual(bad.map((q) => q.question), [], "logic-gate topic contains questions without any gate term");
  });

  test("Bandwidth does not absorb unrelated media questions", async () => {
    const qs = await allQuestions(ALL_CHAPTERS[1].chapterName, "ডেটা কমিউনিকেশন ও ব্যান্ডউইথ (Bandwidth)");
    const db = mongoose.connection.db.collection("questions");
    const bandwidthTerm = /ব্যান্ডউইথ|bandwidth|bps|ব্যান্ড|band|ট্রান্সমিটার|রিসিভার|transmitter|receiver/i;
    for (const q of qs) {
      const stored = (await db.findOne({ _id: new mongoose.Types.ObjectId(q._id) })).topic;
      const r = resolveQuestionTopic({ ...q, topic: stored });
      if (r.method === "keyword") assert.match(`${q.question} ${q.options.join(" ")}`, bandwidthTerm, `keyword-classified without a bandwidth term: ${q.question}`);
    }
  });

  test("SQL and Key Field contain academically relevant questions", async () => {
    const sql = await allQuestions(ALL_CHAPTERS[5].chapterName, "এসকিউএল ও কুয়েরি (SQL)");
    assert.ok(sql.length >= 20);
    sql.forEach((q) => assert.match(`${q.question} ${q.options.join(" ")}`, /sql|এসকিউএল|query|কুয়েরি|কুয়েরি|select|insert|update|delete|where/i, q.question));
    const key = await allQuestions(ALL_CHAPTERS[5].chapterName, "কী ফিল্ড (Primary, Foreign, Composite)");
    assert.ok(key.length >= 1);
    key.forEach((q) => assert.match(`${q.question} ${q.options.join(" ")}`, /কী|কি ফিল্ড|key|ক্যান্ডিডেট/i, q.question));
  });

  test("Uncategorised is selectable and editing a question refreshes the index", async () => {
    const ch6 = ALL_CHAPTERS[5].chapterName;
    const before = await get(`/api/practice/topic-counts?chapter=${enc(ch6)}`);
    const unc = await allQuestions(ch6, "__none__");
    assert.equal(unc.length, before.body.noTopicCount);
    if (unc.length) {
      const r = await request(app).put(`/api/questions/${unc[0]._id}`).set(teacher.auth).field("topic", "এসকিউএল (SQL)");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const after = await get(`/api/practice/topic-counts?chapter=${enc(ch6)}`);
      assert.equal(after.body.noTopicCount, before.body.noTopicCount - 1);
      assert.equal(after.body.topicCounts["এসকিউএল ও কুয়েরি (SQL)"], before.body.topicCounts["এসকিউএল ও কুয়েরি (SQL)"] + 1);
    }
    assert.equal(UNCATEGORISED.length > 0, true);
  });
});
