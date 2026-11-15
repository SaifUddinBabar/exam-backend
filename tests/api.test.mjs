// End-to-end API tests against an in-memory MongoDB loaded with the
// read-only production snapshot. Run: npm test
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";

let app;
let teacher, teacher2, s1, s2, s3;
before(async () => {
  app = await startApp();
  teacher = await makeUser("tutor");
  teacher2 = await makeUser("tutor");
  s1 = await makeUser("student");
  s2 = await makeUser("student");
  s3 = await makeUser("student");
});
after(stopApp);

const Q = () => mongoose.model("Question");
async function someQuestionIds(n, extra = {}) {
  return (await Q().find({ ...extra }).limit(n).select("_id").lean()).map((q) => String(q._id));
}

describe("question bank privacy", () => {
  test("anonymous cannot read the bank", async () => {
    for (const url of ["/api/questions", "/api/practice/question-bank", "/api/ict", "/api/ict/random", "/api/questions/auto-generate?subject=ICT&chapter=x&total=5"]) {
      const r = await request(app).get(url);
      assert.equal(r.status, 401, url);
    }
  });
  test("students cannot read the bank", async () => {
    for (const url of ["/api/questions", "/api/practice/question-bank", "/api/ict", "/api/ict/random"]) {
      const r = await request(app).get(url).set(s1.auth);
      assert.equal(r.status, 403, url);
    }
  });
  test("students can see topic names and counts but no question text", async () => {
    const r = await request(app).get("/api/practice/metadata").set(s1.auth);
    assert.equal(r.status, 200);
    assert.ok(r.body.subjects.length > 0);
    assert.ok(!JSON.stringify(r.body).includes("correctAnswer"));
  });
  test("teacher can browse with pagination, language and difficulty filters", async () => {
    const all = await request(app).get("/api/practice/question-bank?limit=10&page=1").set(teacher.auth);
    assert.equal(all.status, 200);
    assert.equal(all.body.questions.length, 10);
    assert.ok(all.body.total >= 2700);
    const p2 = await request(app).get("/api/practice/question-bank?limit=10&page=2").set(teacher.auth);
    assert.notEqual(p2.body.questions[0]._id, all.body.questions[0]._id);
    const en = await request(app).get("/api/practice/question-bank?limit=50&version=english").set(teacher.auth);
    assert.ok(en.body.questions.every((q) => !/[ঀ-৿]/.test(q.question) && !(q.options || []).some((o) => /[ঀ-৿]/.test(o))), "english view contains Bengali");
    const bn = await request(app).get("/api/practice/question-bank?limit=50&version=bangla").set(teacher.auth);
    assert.ok(bn.body.total > en.body.total);
    const hard = await request(app).get("/api/practice/question-bank?limit=50&difficulty=hard").set(teacher.auth);
    assert.ok(hard.body.questions.every((q) => q.difficulty === "hard"));
  });
  test("topic counts equal the number of questions the topic filter returns", async () => {
    const meta = await request(app).get("/api/practice/metadata").set(teacher.auth);
    const chapter = meta.body.subjects[0].chapters.find((c) => c.topics.length > 1);
    const counts = await request(app).get(`/api/practice/topic-counts?chapter=${encodeURIComponent(chapter.name)}`).set(teacher.auth);
    assert.equal(counts.status, 200);
    const [topic, n] = Object.entries(counts.body.topicCounts)[0];
    const list = await request(app).get(`/api/practice/question-bank?limit=1&chapter=${encodeURIComponent(chapter.name)}&topic=${encodeURIComponent(topic)}`).set(teacher.auth);
    assert.equal(list.body.total, n);
    assert.ok(counts.body.stats.total > 0);
  });
});

describe("question create / edit / report", () => {
  let created;
  test("rejects malformed questions", async () => {
    const r = await request(app).post("/api/questions").set(teacher.auth).field("question", "What is 2+2 in binary?").field("options", JSON.stringify(["10", "11", "100"])).field("correctAnswer", "10").field("subject", "ICT").field("chapter", "Test");
    assert.equal(r.status, 400);
    const r2 = await request(app).post("/api/questions").set(teacher.auth).field("question", "What is 2+2 in binary?").field("options", JSON.stringify(["10", "11", "100", "1"])).field("correctAnswer", "999").field("subject", "ICT").field("chapter", "Test");
    assert.equal(r2.status, 400);
  });
  test("creates a valid bilingual question; difficulty defaults to unclassified", async () => {
    const r = await request(app)
      .post("/api/questions")
      .set(teacher.auth)
      .field("question", "২ + ২ এর বাইনারি মান কত?")
      .field("options", JSON.stringify(["১০", "১০০", "১১", "১"]))
      .field("correctAnswer", "১০০")
      .field("questionEn", "What is 2 + 2 in binary?")
      .field("optionsEn", JSON.stringify(["10", "100", "11", "1"]))
      .field("subject", "ICT")
      .field("chapter", "Test Chapter");
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.difficulty, "unclassified");
    created = r.body;
  });
  test("rejects images that are not images", async () => {
    const r = await request(app).post("/api/questions").set(teacher.auth).attach("image", Buffer.from("<script>alert(1)</script>"), { filename: "x.html", contentType: "text/html" }).field("question", "Question with bad file?").field("options", JSON.stringify(["a1", "b1", "c1", "d1"])).field("correctAnswer", "a1").field("subject", "ICT").field("chapter", "T");
    assert.equal(r.status, 400);
  });
  test("edit keeps a revision of the original", async () => {
    const r = await request(app).put(`/api/questions/${created._id}`).set(teacher.auth).field("difficulty", "easy").field("correctAnswer", "১০০");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.changed, ["difficulty"]);
    const rev = await request(app).get(`/api/questions/${created._id}/revisions`).set(teacher.auth);
    assert.equal(rev.body.revisions.length, 1);
    assert.equal(rev.body.revisions[0].before.difficulty, "unclassified");
  });
  test("another teacher cannot edit someone else's question; platform questions are editable", async () => {
    const r = await request(app).put(`/api/questions/${created._id}`).set(teacher2.auth).field("difficulty", "hard");
    assert.equal(r.status, 403);
    const [pid] = await someQuestionIds(1, { tutorId: "" });
    const ok = await request(app).put(`/api/questions/${pid}`).set(teacher2.auth).field("difficulty", "hard");
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });
  test("edit rejects a correct answer that is not an option", async () => {
    const r = await request(app).put(`/api/questions/${created._id}`).set(teacher.auth).field("correctAnswer", "nope");
    assert.equal(r.status, 400);
  });
  test("anyone signed in can report; teacher sees and resolves it", async () => {
    const r = await request(app).post(`/api/questions/${created._id}/report`).set(s1.auth).send({ reason: "wrong_answer", note: "Looks wrong" });
    assert.equal(r.status, 201);
    const again = await request(app).post(`/api/questions/${created._id}/report`).set(s1.auth).send({ reason: "wrong_answer" });
    assert.equal(again.body.alreadyReported, true);
    const list = await request(app).get("/api/questions/reports").set(teacher.auth);
    const mine = list.body.reports.find((x) => String(x.questionId._id) === String(created._id));
    assert.ok(mine);
    const res = await request(app).put(`/api/questions/reports/${mine._id}`).set(teacher.auth).send({ status: "resolved" });
    assert.equal(res.status, 200);
    const studentList = await request(app).get("/api/questions/reports").set(s1.auth);
    assert.equal(studentList.status, 403);
  });
});

describe("batches, notices, exam assignment, exam flow", () => {
  let batchA, batchB, exam, examAll;
  test("teacher creates batches; duplicate names rejected", async () => {
    const a = await request(app).post("/api/batches").set(teacher.auth).send({ name: "HSC 2027 — Science — Batch A", classLevel: "HSC", academicYear: "2027", subject: "ICT" });
    assert.equal(a.status, 201);
    batchA = a.body.batch;
    assert.match(batchA.code, /^[A-Z0-9]{6}$/);
    const b = await request(app).post("/api/batches").set(teacher.auth).send({ name: "HSC 2027 — Science — Batch B" });
    batchB = b.body.batch;
    const dup = await request(app).post("/api/batches").set(teacher.auth).send({ name: "HSC 2027 — Science — Batch A" });
    assert.equal(dup.status, 409);
    const sameNameOtherTeacher = await request(app).post("/api/batches").set(teacher2.auth).send({ name: "HSC 2027 — Science — Batch A" });
    assert.equal(sameNameOtherTeacher.status, 201);
    const studentTry = await request(app).post("/api/batches").set(s1.auth).send({ name: "x" });
    assert.equal(studentTry.status, 403);
  });
  test("add students (no duplicates), search, move, remove, join by code", async () => {
    const add = await request(app).post(`/api/batches/${batchA._id}/students`).set(teacher.auth).send({ studentIds: [s1.user._id, s2.user._id, s1.user._id] });
    assert.equal(add.body.added, 2);
    const again = await request(app).post(`/api/batches/${batchA._id}/students`).set(teacher.auth).send({ studentIds: [s1.user._id] });
    assert.equal(again.body.added, 0);
    const search = await request(app).get(`/api/batches/students/search?q=${encodeURIComponent(s2.user.phone)}`).set(teacher.auth);
    assert.equal(search.body.students.length, 1);
    assert.equal(search.body.students[0].batches[0].name, batchA.name);
    const move = await request(app).post(`/api/batches/${batchA._id}/move`).set(teacher.auth).send({ studentIds: [s2.user._id], toBatchId: batchB._id });
    assert.equal(move.body.moved, 1);
    const listA = await request(app).get(`/api/batches/${batchA._id}/students`).set(teacher.auth);
    assert.deepEqual(listA.body.students.map((s) => String(s._id)), [String(s1.user._id)]);
    const foreign = await request(app).get(`/api/batches/${batchA._id}/students`).set(teacher2.auth);
    assert.equal(foreign.status, 403);
    const join = await request(app).post("/api/batches/join").set(s3.auth).send({ code: batchA.code });
    assert.equal(join.status, 200);
    const rm = await request(app).delete(`/api/batches/${batchA._id}/students/${s3.user._id}`).set(teacher.auth);
    assert.equal(rm.status, 200);
    const mine = await request(app).get("/api/batches/mine").set(s1.auth);
    assert.equal(mine.body.batches[0].name, batchA.name);
  });
  test("teacher cannot assign an exam to another teacher's batch", async () => {
    const other = await request(app).get("/api/batches").set(teacher2.auth);
    const qs = await someQuestionIds(5);
    const r = await request(app).post("/api/exams/create").set(teacher.auth).send({ title: "X", questions: qs, duration: 10, assignment: { mode: "batches", batchIds: [other.body.batches[0]._id] } });
    assert.equal(r.status, 403);
  });
  test("exam assigned to Batch A is invisible to Batch B", async () => {
    const qs = await someQuestionIds(5);
    const r = await request(app).post("/api/exams/create").set(teacher.auth).send({ title: "Batch A test", questions: qs, duration: 10, negativeMarkPerWrong: 0.25, assignment: { mode: "batches", batchIds: [batchA._id] } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    exam = r.body;
    const forA = await request(app).get("/api/exams/student/available").set(s1.auth);
    assert.ok(forA.body.some((e) => e.examCode === exam.examCode));
    const forB = await request(app).get("/api/exams/student/available").set(s2.auth);
    assert.ok(!forB.body.some((e) => e.examCode === exam.examCode));
    assert.equal((await request(app).get(`/api/exams/${exam.examCode}`).set(s2.auth)).status, 403);
    assert.equal((await request(app).post(`/api/exams/${exam.examCode}/start`).set(s2.auth)).status, 403);
    assert.equal((await request(app).post("/api/exams/submit").set(s2.auth).send({ examCode: exam.examCode, answers: {} })).status, 403);
    assert.equal((await request(app).get(`/api/exams/${exam.examCode}`)).status, 401);
    const r2 = await request(app).post("/api/exams/create").set(teacher.auth).send({ title: "For everyone", questions: qs, duration: 5, assignment: { mode: "all" } });
    examAll = r2.body;
    const forB2 = await request(app).get("/api/exams/student/available").set(s2.auth);
    assert.ok(forB2.body.some((e) => e.examCode === examAll.examCode));
  });
  test("exam details expose no question text or answers", async () => {
    const d = await request(app).get(`/api/exams/${exam.examCode}`).set(s1.auth);
    assert.equal(d.status, 200);
    assert.equal(d.body.totalQuestions, 5);
    assert.ok(!("questions" in d.body));
  });
  test("full exam journey: start, server timer, autosave, resume, submit once, result", async () => {
    const start = await request(app).post(`/api/exams/${exam.examCode}/start`).set(s1.auth);
    assert.equal(start.status, 200, JSON.stringify(start.body));
    const { questions, attempt } = start.body;
    assert.equal(questions.length, 5);
    assert.ok(questions.every((q) => q.correctAnswer === undefined && q.explanation === undefined));
    const dur = new Date(attempt.deadlineAt) - new Date(attempt.startedAt);
    assert.equal(dur, 10 * 60 * 1000);

    const real = await Q().find({ _id: { $in: questions.map((q) => q._id) } }).lean();
    const byId = new Map(real.map((q) => [String(q._id), q]));
    const answers = {};
    answers[questions[0]._id] = byId.get(String(questions[0]._id)).correctAnswer; // correct
    answers[questions[1]._id] = byId.get(String(questions[1]._id)).options.find((o) => o !== byId.get(String(questions[1]._id)).correctAnswer); // wrong
    answers["000000000000000000000000"] = "injected"; // not in exam → dropped
    const save = await request(app).put(`/api/exams/${exam.examCode}/answers`).set(s1.auth).send({ answers });
    assert.equal(save.status, 200);
    assert.equal(save.body.saved, 2);

    const resume = await request(app).post(`/api/exams/${exam.examCode}/start`).set(s1.auth);
    assert.equal(resume.body.attempt.deadlineAt, attempt.deadlineAt, "resume must not reset the timer");
    assert.equal(Object.keys(resume.body.attempt.answers).length, 2);

    const sub = await request(app).post("/api/exams/submit").set(s1.auth).send({ examCode: exam.examCode, answers, score: 999 });
    assert.equal(sub.status, 200, JSON.stringify(sub.body));
    assert.equal(sub.body.correctCount, 1);
    assert.equal(sub.body.wrongCount, 1);
    assert.equal(sub.body.score, 0.75);
    assert.equal(sub.body.xpEarned, 2);

    const dup = await request(app).post("/api/exams/submit").set(s1.auth).send({ examCode: exam.examCode, answers });
    assert.equal(dup.status, 409);
    const restart = await request(app).post(`/api/exams/${exam.examCode}/start`).set(s1.auth);
    assert.equal(restart.status, 409);

    const result = await request(app).get(`/api/exams/${exam.examCode}/my-result`).set(s1.auth);
    assert.equal(result.status, 200);
    assert.equal(result.body.review.length, 5);
    assert.equal(result.body.rank.position, 1);
    const ranking = await request(app).get(`/api/exams/ranking/${exam.examCode}`).set(s1.auth);
    assert.equal(ranking.body.length, 1);
    assert.equal(ranking.body[0].roll, undefined, "students must not see rolls");
  });
  test("an expired attempt grades only autosaved answers", async () => {
    const start = await request(app).post(`/api/exams/${examAll.examCode}/start`).set(s2.auth);
    assert.equal(start.status, 200);
    await mongoose.model("ExamAttempt").updateOne({ examCode: examAll.examCode, studentId: s2.user._id }, { $set: { deadlineAt: new Date(Date.now() - 5 * 60 * 1000) } });
    const q0 = start.body.questions[0];
    const real = await Q().findById(q0._id).lean();
    const late = await request(app).put(`/api/exams/${examAll.examCode}/answers`).set(s2.auth).send({ answers: { [q0._id]: real.correctAnswer } });
    assert.equal(late.status, 410);
    const sub = await request(app).post("/api/exams/submit").set(s2.auth).send({ examCode: examAll.examCode, answers: { [q0._id]: real.correctAnswer } });
    assert.equal(sub.status, 200);
    assert.equal(sub.body.correctCount, 0);
    assert.equal(sub.body.lateAutosaveUsed, true);
  });
  test("scheduled exams respect the window and hide solutions until it closes", async () => {
    const qs = await someQuestionIds(3);
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    const up = await request(app).post("/api/exams/create").set(teacher.auth).send({ title: "Later", questions: qs, duration: 10, startTime: soon, endTime: new Date(soon.getTime() + 3600e3), assignment: { mode: "all" } });
    const st = await request(app).post(`/api/exams/${up.body.examCode}/start`).set(s3.auth);
    assert.equal(st.status, 403);
    const list = await request(app).get("/api/exams/student/available").set(s3.auth);
    assert.equal(list.body.find((e) => e.examCode === up.body.examCode).status, "upcoming");

    const live = await request(app).post("/api/exams/create").set(teacher.auth).send({ title: "Live", questions: qs, duration: 10, startTime: new Date(Date.now() - 60e3), endTime: new Date(Date.now() + 3600e3), assignment: { mode: "all" } });
    await request(app).post(`/api/exams/${live.body.examCode}/start`).set(s3.auth);
    const sub = await request(app).post("/api/exams/submit").set(s3.auth).send({ examCode: live.body.examCode, answers: {} });
    assert.equal(sub.body.solutionsReleased, false);
    const res = await request(app).get(`/api/exams/${live.body.examCode}/my-result`).set(s3.auth);
    assert.equal(res.body.review, null);
  });
  test("teachers cannot touch other teachers' exams; delete archives and keeps results", async () => {
    assert.equal((await request(app).get(`/api/exams/${exam.examCode}/admin`).set(teacher2.auth)).status, 403);
    assert.equal((await request(app).delete(`/api/exams/${exam.examCode}`).set(teacher2.auth)).status, 403);
    assert.equal((await request(app).put(`/api/exams/${exam.examCode}`).set(teacher2.auth).send({ duration: 999 })).status, 403);
    const del = await request(app).delete(`/api/exams/${exam.examCode}`).set(teacher.auth);
    assert.equal(del.status, 200);
    assert.equal(await mongoose.model("Submission").countDocuments({ examCode: exam.examCode }), 1);
    const list = await request(app).get("/api/exams/list").set(teacher.auth);
    assert.ok(!list.body.some((e) => e.examCode === exam.examCode));
    const t2list = await request(app).get("/api/exams/list").set(teacher2.auth);
    assert.ok(!t2list.body.some((e) => String(e.authorId) === String(teacher.user._id)));
  });
  test("notices reach only their audience; read/unread tracked", async () => {
    const n = await request(app).post("/api/notices").set(teacher.auth).field("title", "Batch A class moved").field("body", "Sunday 5pm").field("batchIds", JSON.stringify([batchA._id])).field("priority", "important");
    assert.equal(n.status, 201, JSON.stringify(n.body));
    const direct = await request(app).post("/api/notices").set(teacher.auth).send({ title: "Only for s3", studentIds: [String(s3.user._id)] });
    assert.equal(direct.status, 201);
    const a = await request(app).get("/api/notices").set(s1.auth);
    assert.deepEqual(a.body.notices.map((x) => x.title), ["Batch A class moved"]);
    assert.equal(a.body.unread, 1);
    const b = await request(app).get("/api/notices").set(s2.auth);
    assert.equal(b.body.notices.length, 0);
    const c = await request(app).get("/api/notices").set(s3.auth);
    assert.deepEqual(c.body.notices.map((x) => x.title), ["Only for s3"]);
    assert.equal((await request(app).post(`/api/notices/${n.body.notice._id}/read`).set(s2.auth)).status, 404);
    await request(app).post(`/api/notices/${n.body.notice._id}/read`).set(s1.auth);
    const a2 = await request(app).get("/api/notices").set(s1.auth);
    assert.equal(a2.body.unread, 0);
    const expired = await request(app).post("/api/notices").set(teacher.auth).send({ title: "Old", audienceAll: true, publishAt: new Date(Date.now() - 7200e3), expiresAt: new Date(Date.now() - 3600e3) });
    assert.equal(expired.status, 201);
    const a3 = await request(app).get("/api/notices").set(s1.auth);
    assert.ok(!a3.body.notices.some((x) => x.title === "Old"));
    const otherTeacher = await request(app).post("/api/notices").set(teacher2.auth).send({ title: "x", batchIds: [batchA._id] });
    assert.equal(otherTeacher.status, 403);
    const manage = await request(app).get("/api/notices/manage").set(teacher.auth);
    assert.equal(manage.body.notices.find((x) => x.title === "Batch A class moved").readCount, 1);
  });
  test("student dashboard shows only authorised data", async () => {
    const d = await request(app).get("/api/student/dashboard").set(s2.auth);
    assert.equal(d.status, 200, JSON.stringify(d.body));
    assert.equal(d.body.batches[0].name, batchB.name);
    assert.equal(d.body.notices.length, 0);
    assert.ok(d.body.exams.every((e) => e.examCode !== exam.examCode));
  });
});

describe("battles and league", () => {
  let battle;
  test("random matchmaking pairs two students with an identical question set", async () => {
    const meta = await request(app).get("/api/battles/topics").set(s1.auth);
    assert.equal(meta.status, 200);
    assert.ok(!JSON.stringify(meta.body).includes("correctAnswer"));
    const filters = { subject: "ICT", difficulty: "mixed" };
    const a = await request(app).post("/api/battles/find").set(s1.auth).send(filters);
    assert.equal(a.body.battle.status, "waiting");
    assert.equal(a.body.battle.questions, undefined, "questions must not be sent before the battle starts");
    const b = await request(app).post("/api/battles/find").set(s2.auth).send(filters);
    assert.equal(b.body.battle.status, "active");
    assert.equal(String(b.body.battle._id), String(a.body.battle._id));
    battle = b.body.battle;
    const viewA = await request(app).get(`/api/battles/${battle._id}`).set(s1.auth);
    assert.deepEqual(viewA.body.battle.questions.map((q) => q.question), battle.questions.map((q) => q.question));
    assert.ok(viewA.body.battle.questions.every((q) => q.correctIndex === undefined));
    assert.equal((await request(app).get(`/api/battles/${battle._id}`).set(s3.auth)).status, 403);
    assert.equal((await request(app).post("/api/battles/find").set(teacher.auth).send(filters)).status, 403);
  });
  test("server grades answers, blocks re-answers and finishes the match", async () => {
    await mongoose.model("Battle").updateOne({ _id: battle._id }, { $set: { startedAt: new Date(Date.now() - 1000) } });
    const qs = await mongoose.model("Battle").findById(battle._id).lean();
    const real = await Q().find({ _id: { $in: qs.questionIds } }).lean();
    const map = new Map(real.map((q) => [String(q._id), q]));
    const correctIdx = (i) => map.get(String(qs.questionIds[i])).options.indexOf(map.get(String(qs.questionIds[i])).correctAnswer);
    for (let i = 0; i < qs.questionIds.length; i++) {
      const r1 = await request(app).post(`/api/battles/${battle._id}/answer`).set(s1.auth).send({ index: i, optionIndex: correctIdx(i), score: 1000 });
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(r1.body.correct, true);
      const r2 = await request(app).post(`/api/battles/${battle._id}/answer`).set(s2.auth).send({ index: i, optionIndex: (correctIdx(i) + 1) % 4 });
      assert.equal(r2.body.correct, false);
    }
    const again = await request(app).post(`/api/battles/${battle._id}/answer`).set(s1.auth).send({ index: 0, optionIndex: 0 });
    assert.equal(again.status, 409);
    const end = await request(app).get(`/api/battles/${battle._id}`).set(s1.auth);
    assert.equal(end.body.battle.status, "finished");
    assert.equal(end.body.battle.result.winner, "me");
    assert.ok(end.body.battle.me.ratingAfter > 1000);
    assert.equal(end.body.battle.me.score >= 100, true);
    const loser = await request(app).get(`/api/battles/${battle._id}`).set(s2.auth);
    assert.equal(loser.body.battle.result.winner, "opponent");
    assert.ok(loser.body.battle.me.ratingAfter < 1000);
  });
  test("friend room by code; leaving forfeits", async () => {
    const room = await request(app).post("/api/battles/friend").set(s1.auth).send({ subject: "ICT" });
    assert.equal(room.status, 201);
    const code = room.body.battle.roomCode;
    assert.match(code, /^[A-F0-9]{6}$/);
    const join = await request(app).post("/api/battles/join").set(s3.auth).send({ roomCode: code });
    assert.equal(join.body.battle.status, "active");
    const leave = await request(app).post(`/api/battles/${join.body.battle._id}/leave`).set(s3.auth);
    assert.equal(leave.body.battle.result.winner, "opponent");
    assert.equal(leave.body.battle.result.reason, "forfeit");
  });
  test("abandoned battle finalises after the server clock passes", async () => {
    const a = await request(app).post("/api/battles/find").set(s1.auth).send({ subject: "ICT", difficulty: "easy" });
    const b = await request(app).post("/api/battles/find").set(s2.auth).send({ subject: "ICT", difficulty: "easy" });
    await mongoose.model("Battle").updateOne({ _id: b.body.battle._id }, { $set: { endsAt: new Date(Date.now() - 10e3) } });
    const r = await request(app).get(`/api/battles/${a.body.battle._id}`).set(s1.auth);
    assert.equal(r.body.battle.status, "finished");
    assert.equal(r.body.battle.result.winner, "draw");
  });
  test("leaderboards and stats come from server events only", async () => {
    const g = await request(app).get("/api/league/leaderboard?scope=global").set(s1.auth);
    assert.equal(g.body.entries[0].isMe, true);
    assert.equal(g.body.me.rank, 1);
    const w = await request(app).get("/api/league/leaderboard?scope=weekly").set(s1.auth);
    assert.ok(w.body.entries.length >= 2);
    const f = await request(app).get("/api/league/leaderboard?scope=friends").set(s1.auth);
    assert.ok(f.body.entries.length >= 2);
    const me = await request(app).get("/api/league/me").set(s1.auth);
    assert.ok(me.body.stats.achievements.some((x) => x.code === "first_win"));
    assert.equal(me.body.stats.league.key, "bronze");
    const rules = await request(app).get("/api/league/rules").set(s1.auth);
    assert.equal(rules.body.leagues.length, 6);
  });
});

describe("practice XP and exam settings", () => {
  test("XP only for test-mode practice, once per session, with a daily cap", async () => {
    const u = await makeUser("student");
    const play = async (mode) => {
      const g = await request(app).post("/api/practice/generate").set(u.auth).send({ subject: "ICT", questionCount: 50, mode });
      assert.equal(g.status, 201, JSON.stringify(g.body));
      const ids = g.body.questions.map((q) => q._id);
      const real = await Q().find({ _id: { $in: ids } }).lean();
      const answers = Object.fromEntries(real.map((q) => [String(q._id), q.correctAnswer]));
      const s1 = await request(app).post("/api/practice/submit").set(u.auth).send({ sessionId: g.body.sessionId, answers });
      const s2 = await request(app).post("/api/practice/submit").set(u.auth).send({ sessionId: g.body.sessionId, answers });
      return [s1.body.xpEarned, s2.body.xpEarned];
    };
    assert.deepEqual(await play("practice"), [0, 0], "practice mode reveals answers, so no XP");
    assert.deepEqual(await play("test"), [50, 0], "capped at 50 per session and only once");
    await play("test");
    const [third] = await play("test");
    assert.equal(third, 50);
    const [fourth] = await play("test");
    assert.equal(fourth, 0, "daily cap of 150 reached");
  });
  test("owner can reschedule and re-target an exam", async () => {
    const qs = await someQuestionIds(3);
    const e = await request(app).post("/api/exams/create").set(teacher.auth).send({ title: "Editable", questions: qs, duration: 10 });
    const end = new Date(Date.now() + 86400e3).toISOString();
    const r = await request(app).put(`/api/exams/${e.body.examCode}`).set(teacher.auth).send({ endTime: end, isPublished: false, assignment: { mode: "students", studentIds: [String(s3.user._id)] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.exam.isPublished, false);
    const list = await request(app).get("/api/exams/student/available").set(s3.auth);
    assert.ok(!list.body.some((x) => x.examCode === e.body.examCode), "unpublished exam must be hidden");
    await request(app).put(`/api/exams/${e.body.examCode}`).set(teacher.auth).send({ isPublished: true });
    assert.ok((await request(app).get("/api/exams/student/available").set(s3.auth)).body.some((x) => x.examCode === e.body.examCode));
    assert.ok(!(await request(app).get("/api/exams/student/available").set(s1.auth)).body.some((x) => x.examCode === e.body.examCode));
    const bad = await request(app).put(`/api/exams/${e.body.examCode}`).set(teacher.auth).send({ startTime: end, endTime: new Date().toISOString() });
    assert.equal(bad.status, 400);
  });
});

describe("auth hardening", () => {
  test("passcode + email without password no longer issues a token", async () => {
    const r = await request(app).post("/api/auth/teacher-verify").send({ teacherPasscode: process.env.TEACHER_PASSCODE || "006985", email: s1.user.email });
    assert.equal(r.status, 400);
    assert.equal(r.body.token, undefined);
    const u = await mongoose.model("User").findById(s1.user._id);
    assert.equal(u.role, "student");
  });
  test("wrong passcode rejected", async () => {
    const r = await request(app).post("/api/auth/teacher-verify").send({ teacherPasscode: "000000" });
    assert.equal(r.status, 401);
  });
  test("removing a student deactivates instead of deleting results", async () => {
    const victim = await makeUser("student");
    const r = await request(app).delete(`/api/auth/teacher/students/${victim.user._id}`).set(teacher.auth);
    assert.equal(r.status, 200);
    const u = await mongoose.model("User").findById(victim.user._id);
    assert.equal(u.isActive, false);
    assert.equal((await request(app).get("/api/auth/me").set(victim.auth)).status, 403);
  });
});
