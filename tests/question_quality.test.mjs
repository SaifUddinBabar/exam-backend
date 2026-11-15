// Timed play (battles, daily tournament) must never serve a question that cannot be
// answered on its own. The check is read-time only; the questions themselves are untouched.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";
import { playabilityIssues } from "../utils/questionQuality.js";
import { pickQuestions } from "../controllers/battleController.js";
import { invalidateTopicIndex, unplayableIds } from "../services/topicIndex.js";

const Q = (question, extra = {}) => ({ question, options: ["a", "b", "c", "d"], correctAnswer: "a", ...extra });

describe("playability rules (unit)", () => {
  test("flags questions that point at a missing passage, figure or earlier question", () => {
    assert.deepEqual(playabilityIssues(Q("উদ্দীপকে বর্ণিত নেটওয়ার্কে ডেটা ট্রান্সমিশন মোড কোনটি?")), ["needs_stimulus"]);
    assert.ok(playabilityIssues(Q("নিচের চিত্রটি কোন মোডের?")).includes("needs_figure"));
    assert.ok(playabilityIssues(Q("A road network as shown in the figure connect four cities.")).includes("needs_figure"));
    assert.deepEqual(playabilityIssues(Q("এই নেটওয়ার্কে মোট তারের সংখ্যা—")), ["refers_to_previous"]);
    assert.ok(playabilityIssues(Q("উচ্চ ভবনের উক্ত বেস স্টেশন কোন ধরনের মিডিয়া ব্যবহার করে?")).includes("refers_to_previous"));
  });
  test("keeps questions that carry their own passage or image", () => {
    const chained = "নিচের উদ্দীপকটি পড়ো এবং পরবর্তী দুটি প্রশ্নের উত্তর দাও:\nমনিমালার কলেজে ৩ তলা। তাদের কম্পিউটার শিক্ষক সিদ্ধান্ত নিয়েছেন সব কম্পিউটার একই নেটওয়ার্কে আনবেন।\n\nকলেজটির নেটওয়ার্ক গড়ে উঠতে পারে—";
    assert.deepEqual(playabilityIssues(Q(chained)), []);
    // decomposed nukta spelling (ড + ়) must behave the same as the precomposed one
    assert.deepEqual(playabilityIssues(Q(chained.normalize("NFD"))), []);
    assert.deepEqual(playabilityIssues(Q("উদ্দীপক: পৃথিবী একটি গ্রামে পরিণত হয়েছে। (প্রশ্ন: উদ্দীপকে যে বিষয়ে বলা হয়েছে)")), []);
    assert.deepEqual(playabilityIssues(Q("উদ্দীপকে উল্লিখিত নেটওয়ার্ক হবে কোনটি? (একটি রুমে থাকা ল্যাপটপগুলো নেটওয়ার্কের আওতায় আনার পরিকল্পনা)")), []);
    assert.deepEqual(playabilityIssues(Q("নিচের চিত্রটি কোন মোডের?", { image: ["uploads/x.png"] })), []);
  });
  test("does not flag ordinary words that only look like references", () => {
    for (const t of ["প্রবাহচিত্রের কোন প্রতীকটি প্রসেস এর জন্য ব্যবহৃত হয়?", "হার্ডওয়্যার ও সফটওয়্যারের সমন্বয়ে চিত্রায়নকে কী বলে?", "ওয়েব পেজে চিত্র সংযোজনের ট্যাগ হলো-", "Which figure of speech is used here?"]) {
      assert.deepEqual(playabilityIssues(Q(t)), [], t);
    }
  });
  test("flags malformed options and corrupted text", () => {
    assert.ok(playabilityIssues(Q("WWW-এর পূর্ণরূপ কোনটি?", { options: ["x", "x", "y", "z"], correctAnswer: "x" })).includes("duplicate_options"));
    assert.ok(playabilityIssues(Q("ok?", { correctAnswer: "zz" })).includes("answer_not_in_options"));
    assert.ok(playabilityIssues(Q("1010101 ��াইনারি সংখ্যা")).includes("garbled_text"));
  });
});

describe("timed play uses playable questions only (snapshot)", () => {
  let app, student, bad;
  before(async () => {
    app = await startApp();
    student = await makeUser("student");
    invalidateTopicIndex();
    bad = new Set((await unplayableIds()).map(String));
  });
  after(stopApp);

  test("the snapshot has flagged questions to exclude", () => {
    assert.ok(bad.size >= 40, `expected the known passage-dependent questions, got ${bad.size}`);
  });
  test("battle picks never contain a flagged question (chapter 2, where most of them are)", async () => {
    const ch2 = "অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং";
    for (let i = 0; i < 40; i++) {
      const ids = await pickQuestions({ className: "", subject: "", chapter: ch2, topic: "", difficulty: "mixed" }, 10);
      assert.equal(ids.length, 10);
      for (const id of ids) assert.ok(!bad.has(String(id)), `flagged question ${id} was picked`);
    }
  });
  test("a tournament set that holds a flagged question is re-picked while nobody has started", async () => {
    const { dhakaDay } = await import("../services/gamification.js");
    const day = dhakaDay();
    const badIds = [...bad].slice(0, 10).map((id) => new mongoose.Types.ObjectId(id));
    await mongoose.model("DailyTournament").deleteMany({ day });
    await mongoose.model("DailyTournament").create({ day, questionIds: badIds });
    const r = await request(app).get("/api/tournament/today").set(student.auth);
    assert.equal(r.status, 200);
    const t = await mongoose.model("DailyTournament").findOne({ day }).lean();
    assert.equal(t.questionIds.length, 10);
    assert.ok(t.questionIds.every((id) => !bad.has(String(id))));
    // Once someone has started, the set is frozen (fairness), even if it were imperfect.
    await request(app).post("/api/tournament/today/start").set(student.auth);
    const frozen = (await mongoose.model("DailyTournament").findOne({ day }).lean()).questionIds.map(String);
    await request(app).get("/api/tournament/today").set(student.auth);
    assert.deepEqual((await mongoose.model("DailyTournament").findOne({ day }).lean()).questionIds.map(String), frozen);
  });
  test("questions are never modified by the check", async () => {
    const sample = [...bad].slice(0, 5);
    const docs = await mongoose.model("Question").find({ _id: { $in: sample } }).lean();
    assert.equal(docs.length, sample.length);
    assert.ok(docs.every((d) => !d.hidden));
  });
});
