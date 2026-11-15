// Battle reliability: rating-based matchmaking, merging waiting rooms, the reconnect grace
// period, and the Server-Sent Events stream that replaces most polling.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";
import { ratingBand } from "../controllers/battleController.js";

let app;
const F = { subject: "ICT", difficulty: "mixed" };
const Battle = () => mongoose.model("Battle");
const setRating = (u, rating) => mongoose.model("PlayerStats").updateOne({ userId: u.user._id }, { $set: { rating } }, { upsert: true });
const find = (u) => request(app).post("/api/battles/find").set(u.auth).send(F);
const ago = (s) => new Date(Date.now() - s * 1000);

before(async () => {
  app = await startApp();
});
after(stopApp);

describe("rating-based matchmaking", () => {
  test("the band starts at ±150, widens with waiting time and opens after 40 s", () => {
    assert.equal(ratingBand(0), 150);
    assert.equal(ratingBand(20), 350);
    assert.equal(ratingBand(40), Infinity);
  });
  test("a far-apart player gets their own room; a close player joins the first room", async () => {
    const [a, far, near] = await Promise.all([1, 2, 3].map(() => makeUser("student")));
    await setRating(a, 1000);
    await setRating(far, 1600);
    await setRating(near, 1080);
    const ra = await find(a);
    assert.equal(ra.status, 201);
    const rf = await find(far);
    assert.equal(rf.body.waiting, true, "1600 vs 1000 is outside the band → waits in a new room");
    assert.notEqual(String(rf.body.battle._id), String(ra.body.battle._id));
    const rn = await find(near);
    assert.equal(rn.body.matched, true);
    assert.equal(String(rn.body.battle._id), String(ra.body.battle._id));
    // clean up the far player's room
    await request(app).post(`/api/battles/${rf.body.battle._id}/leave`).set(far.auth);
  });
  test("after waiting long enough, any rating is accepted", async () => {
    const [a, far] = await Promise.all([1, 2].map(() => makeUser("student")));
    await setRating(a, 900);
    await setRating(far, 1700);
    const ra = await find(a);
    await Battle().collection.updateOne({ _id: new mongoose.Types.ObjectId(ra.body.battle._id) }, { $set: { createdAt: ago(41) } });
    const rf = await find(far);
    assert.equal(rf.body.matched, true);
    assert.equal(String(rf.body.battle._id), String(ra.body.battle._id));
  });
  test("two waiting rooms merge once their bands overlap; the newer one points to the match", async () => {
    const [a, b] = await Promise.all([1, 2].map(() => makeUser("student")));
    await setRating(a, 1000);
    await setRating(b, 1500);
    const ra = await find(a);
    const rb = await find(b);
    assert.equal(rb.body.waiting, true);
    await Battle().collection.updateOne({ _id: new mongoose.Types.ObjectId(ra.body.battle._id) }, { $set: { createdAt: ago(42) } });
    await Battle().collection.updateOne({ _id: new mongoose.Types.ObjectId(rb.body.battle._id) }, { $set: { createdAt: ago(41) } });
    const vb = await request(app).get(`/api/battles/${rb.body.battle._id}`).set(b.auth);
    assert.equal(vb.body.battle.status, "cancelled");
    assert.equal(String(vb.body.battle.mergedInto), String(ra.body.battle._id));
    const va = await request(app).get(`/api/battles/${ra.body.battle._id}`).set(b.auth);
    assert.equal(va.status, 200, "b is now a player in a's room");
    assert.equal(va.body.battle.status, "active");
    assert.equal(va.body.battle.players.length, 2);
  });
});

async function activeDuel() {
  const [x, y] = await Promise.all([1, 2].map(() => makeUser("student")));
  const r = await request(app).post("/api/battles/friend").set(x.auth).send(F);
  await request(app).post("/api/battles/join").set(y.auth).send({ roomCode: r.body.battle.roomCode });
  const id = r.body.battle._id;
  await Battle().updateOne({ _id: id }, { $set: { startedAt: ago(5) } });
  return { x, y, id };
}
const seen = (id, u, secondsAgo) => Battle().updateOne({ _id: id, "players.userId": u.user._id }, { $set: { "players.$.lastSeenAt": ago(secondsAgo) } });

describe("reconnect grace period", () => {
  test("a dropped opponent is shown as reconnecting with a deadline, and the battle continues", async () => {
    const { x, y, id } = await activeDuel();
    await seen(id, y, 20);
    const v = await request(app).get(`/api/battles/${id}`).set(x.auth);
    assert.equal(v.body.battle.status, "active");
    assert.equal(v.body.battle.opponent.connected, false);
    assert.ok(new Date(v.body.battle.opponent.graceEndsAt) > new Date());
    // coming back within the grace period restores the connection
    const back = await request(app).get(`/api/battles/${id}`).set(y.auth);
    assert.equal(back.body.battle.status, "active");
    const v2 = await request(app).get(`/api/battles/${id}`).set(x.auth);
    assert.equal(v2.body.battle.opponent.connected, true);
  });
  test("after the grace period the absent player forfeits (1v1)", async () => {
    const { x, y, id } = await activeDuel();
    await seen(id, y, 50);
    const v = await request(app).get(`/api/battles/${id}`).set(x.auth);
    assert.equal(v.body.battle.status, "finished");
    assert.equal(v.body.battle.result.winner, "me");
    assert.equal(v.body.battle.result.reason, "disconnect");
    assert.equal(v.body.battle.me.xpEarned, 0, "no win XP without a single correct answer (anti-farming)");
  });
  test("nobody forfeits when both players dropped (the clock ends it) or when the absent player had finished", async () => {
    const a = await activeDuel();
    await seen(a.id, a.x, 50);
    await seen(a.id, a.y, 50);
    await request(app).get(`/api/battles/${a.id}`).set(a.x.auth); // x returns: x was stale during this read
    assert.equal((await Battle().findById(a.id)).status, "active");

    const b = await activeDuel();
    const doc = await Battle().findById(b.id);
    for (let i = 0; i < doc.questionIds.length; i++) await request(app).post(`/api/battles/${b.id}/answer`).set(b.y.auth).send({ index: i, optionIndex: 0 });
    await seen(b.id, b.y, 50);
    const v = await request(app).get(`/api/battles/${b.id}`).set(b.x.auth);
    assert.equal(v.body.battle.status, "active", "y finished all answers, so y is not forfeited");
  });
  test("group: an absent player is removed after the grace period and ranks last", async () => {
    const [h, p2, p3] = await Promise.all([1, 2, 3].map(() => makeUser("student")));
    const r = await request(app).post("/api/battles/friend").set(h.auth).send({ ...F, group: true, maxPlayers: 3 });
    const id = r.body.battle._id;
    await request(app).post("/api/battles/join").set(p2.auth).send({ roomCode: r.body.battle.roomCode });
    await request(app).post("/api/battles/join").set(p3.auth).send({ roomCode: r.body.battle.roomCode });
    await request(app).post(`/api/battles/${id}/start`).set(h.auth);
    await Battle().updateOne({ _id: id }, { $set: { startedAt: ago(5) } });
    await seen(id, p3, 50);
    const v = await request(app).get(`/api/battles/${id}`).set(h.auth);
    assert.equal(v.body.battle.status, "active");
    assert.equal(v.body.battle.players.find((p) => !p.isMe && p.left)?.left, true);
  });
});

// Reads SSE "data:" events from a real HTTP connection (supertest buffers until the end).
function openStream(server, path, auth) {
  const events = [];
  let resolveWait = null;
  const req = http.get({ host: "127.0.0.1", port: server.address().port, path, headers: auth }, (res) => {
    let buf = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (line) {
          events.push(JSON.parse(line.slice(6)).battle);
          if (resolveWait) resolveWait();
        }
      }
    });
  });
  const next = (pred, ms = 4000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("no matching event")), ms);
      const check = () => {
        const hit = events.find(pred);
        if (hit) {
          clearTimeout(t);
          resolveWait = null;
          resolve(hit);
        } else resolveWait = check;
      };
      check();
    });
  return { next, close: () => req.destroy(), events, req };
}

describe("battle stream (SSE)", () => {
  let server;
  before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
  });
  after(() => server.close());

  test("sends the current state, pushes changes at once, and refuses outsiders", async () => {
    const { x, y, id } = await activeDuel();
    // With the fallback tick at 60 s, an update arriving within seconds can only be the push.
    process.env.BATTLE_STREAM_TICK_MS = "60000";
    const s = openStream(server, `/api/battles/${id}/stream`, x.auth);
    try {
      const first = await s.next((b) => b.status === "active");
      assert.equal(first.opponent.answered, 0);
      await request(app).post(`/api/battles/${id}/answer`).set(y.auth).send({ index: 0, optionIndex: 1 });
      const upd = await s.next((b) => b.opponent.answered === 1, 10_000);
      assert.equal(upd.questions[0].correctIndex, undefined, "x has not answered q1, so its answer stays hidden");
    } finally {
      delete process.env.BATTLE_STREAM_TICK_MS;
      s.close();
    }
    const outsider = await makeUser("student");
    assert.equal((await request(app).get(`/api/battles/${id}/stream`).set(outsider.auth)).status, 403);
  });
  test("the stream is a heartbeat and ends after the final result", async () => {
    const { x, y, id } = await activeDuel();
    await seen(id, x, 25);
    const s = openStream(server, `/api/battles/${id}/stream`, x.auth);
    await s.next((b) => b.status === "active");
    const me = (await Battle().findById(id)).players.find((p) => String(p.userId) === String(x.user._id));
    assert.ok(Date.now() - new Date(me.lastSeenAt).getTime() < 3000, "opening the stream refreshes lastSeenAt");
    await request(app).post(`/api/battles/${id}/leave`).set(y.auth);
    const end = await s.next((b) => b.status === "finished");
    assert.equal(end.result.winner, "me");
    s.close();
  });
});
