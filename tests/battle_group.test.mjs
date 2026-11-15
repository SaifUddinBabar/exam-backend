// Group battles and the daily tournament.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";

let app, host, p2, p3, p4, outsider, teacher;
before(async () => {
  app = await startApp();
  [host, p2, p3, p4, outsider] = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser("student")));
  teacher = await makeUser("tutor");
});
after(stopApp);

const correctIdx = async (battleId, i) => {
  const b = await mongoose.model("Battle").findById(battleId).lean();
  const q = await mongoose.model("Question").findById(b.questionIds[i]).lean();
  return q.options.indexOf(q.correctAnswer);
};

describe("group battle", () => {
  let id, code;
  test("host creates a room; up to maxPlayers join; extra players are refused", async () => {
    const r = await request(app).post("/api/battles/friend").set(host.auth).send({ group: true, maxPlayers: 3, subject: "ICT" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.battle.mode, "group");
    id = r.body.battle._id;
    code = r.body.battle.roomCode;
    assert.equal((await request(app).post("/api/battles/join").set(p2.auth).send({ roomCode: code })).body.battle.status, "waiting");
    assert.equal((await request(app).post("/api/battles/join").set(p3.auth).send({ roomCode: code })).body.battle.players.length, 3);
    assert.equal((await request(app).post("/api/battles/join").set(p4.auth).send({ roomCode: code })).status, 409, "room is full");
    assert.equal((await request(app).get(`/api/battles/${id}`).set(outsider.auth)).status, 403);
  });
  test("only the host can start; questions appear only after start", async () => {
    const before = await request(app).get(`/api/battles/${id}`).set(p2.auth);
    assert.equal(before.body.battle.questions, undefined);
    assert.equal((await request(app).post(`/api/battles/${id}/start`).set(p2.auth)).status, 403);
    const s = await request(app).post(`/api/battles/${id}/start`).set(host.auth);
    assert.equal(s.status, 200);
    assert.equal(s.body.battle.status, "active");
  });
  test("a player who leaves ranks last; results are ranked by score; XP by placement", async () => {
    await mongoose.model("Battle").updateOne({ _id: id }, { $set: { startedAt: new Date(Date.now() - 1000) } });
    const n = (await mongoose.model("Battle").findById(id)).questionIds.length;
    const leave = await request(app).post(`/api/battles/${id}/leave`).set(p3.auth);
    assert.equal(leave.status, 200);
    for (let i = 0; i < n; i++) {
      const c = await correctIdx(id, i);
      await request(app).post(`/api/battles/${id}/answer`).set(host.auth).send({ index: i, optionIndex: c });
      await request(app).post(`/api/battles/${id}/answer`).set(p2.auth).send({ index: i, optionIndex: i % 2 ? c : (c + 1) % 4 });
    }
    assert.equal((await request(app).post(`/api/battles/${id}/answer`).set(p3.auth).send({ index: 0, optionIndex: 0 })).status, 409, "a player who left can't answer");
    const end = await request(app).get(`/api/battles/${id}`).set(host.auth);
    assert.equal(end.body.battle.status, "finished");
    assert.equal(end.body.battle.result.placement, 1);
    const ranks = Object.fromEntries(end.body.battle.players.map((p) => [p.left ? "left" : p.isMe ? "host" : "p2", p.placement]));
    assert.deepEqual(ranks, { host: 1, p2: 2, left: 3 });
    const xp = await mongoose.model("PlayerStats").find({ userId: { $in: [host.user._id, p2.user._id, p3.user._id] } }).lean();
    const byUser = Object.fromEntries(xp.map((s) => [String(s.userId), s.xp]));
    assert.ok(byUser[host.user._id] > byUser[p2.user._id]);
    assert.equal(byUser[p3.user._id] || 0, 0, "the player who left answered nothing and earns nothing");
    const rating = await mongoose.model("PlayerStats").findOne({ userId: host.user._id }).lean();
    assert.equal(rating.rating, 1000, "group battles are unranked");
  });
  test("when everyone else leaves, the last player gets a settled result (never a half-written one)", async () => {
    const r = await request(app).post("/api/battles/friend").set(outsider.auth).send({ group: true, maxPlayers: 3, subject: "ICT" });
    const gid = r.body.battle._id;
    await request(app).post("/api/battles/join").set(p4.auth).send({ roomCode: r.body.battle.roomCode });
    await request(app).post(`/api/battles/${gid}/start`).set(outsider.auth);
    // Simulate a reader arriving between finalize's claim and its second write.
    await mongoose.model("Battle").updateOne({ _id: gid }, { $set: { status: "finished", finishedAt: new Date(), settledAt: null } });
    const mid = await request(app).get(`/api/battles/${gid}`).set(outsider.auth);
    assert.equal(mid.body.battle.status, "active", "an unsettled battle is not reported as finished");
    assert.equal(mid.body.battle.result, null);
    await mongoose.model("Battle").updateOne({ _id: gid }, { $set: { status: "active", finishedAt: null, startedAt: new Date(Date.now() - 1000) } });
    const left = await request(app).post(`/api/battles/${gid}/leave`).set(p4.auth);
    assert.equal(left.status, 200);
    const end = await request(app).get(`/api/battles/${gid}`).set(outsider.auth);
    assert.equal(end.body.battle.status, "finished");
    assert.equal(end.body.battle.result.placement, 1);
    assert.ok(end.body.battle.players.every((p) => Number.isInteger(p.placement)));
  });
});

describe("daily tournament", () => {
  test("one attempt per student, same questions for everyone, answers hidden until the day ends", async () => {
    const a = await request(app).post("/api/tournament/today/start").set(p2.auth);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await request(app).post("/api/tournament/today/start").set(p4.auth);
    assert.deepEqual(a.body.questions.map((q) => q.question), b.body.questions.map((q) => q.question));
    assert.ok(a.body.questions.every((q) => q.correctIndex === undefined));
    const t = await mongoose.model("DailyTournament").findOne({ day: a.body.day }).lean();
    for (let i = 0; i < t.questionIds.length; i++) {
      const q = await mongoose.model("Question").findById(t.questionIds[i]).lean();
      const r = await request(app).post("/api/tournament/today/answer").set(p2.auth).send({ index: i, optionIndex: q.options.indexOf(q.correctAnswer), score: 9999 });
      assert.equal(r.status, 200);
      assert.equal(r.body.correct, undefined, "correctness is not revealed during the day");
    }
    assert.equal((await request(app).post("/api/tournament/today/answer").set(p2.auth).send({ index: 0, optionIndex: 1 })).status, 409);
    const again = await request(app).post("/api/tournament/today/start").set(p2.auth);
    assert.ok(again.body.me.finishedAt, "restarting resumes the same finished attempt");
    assert.equal(again.body.questions, undefined, "no questions after finishing (answers stay hidden)");
    assert.equal(again.body.myRank, 1);
    assert.ok(again.body.me.score >= t.questionIds.length * 10);
    assert.equal(again.body.leaderboard[0].isMe, true);
  });
  test("teachers cannot enter; the clock is enforced", async () => {
    assert.equal((await request(app).post("/api/tournament/today/start").set(teacher.auth)).status, 403);
    await mongoose.model("TournamentEntry").updateOne({ userId: p4.user._id }, { $set: { endsAt: new Date(Date.now() - 60e3) } });
    assert.equal((await request(app).post("/api/tournament/today/answer").set(p4.auth).send({ index: 0, optionIndex: 0 })).status, 409);
  });
});
