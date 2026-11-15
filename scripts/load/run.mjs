// Load-test runner for LOCAL or STAGING only. Refuses the production API host.
// Needs tokens from scripts/load/seed_load_users.mjs (same database as the target server).
//
//   node scripts/load/run.mjs --base http://localhost:5001 --scenario exam --users 100 --ramp 20
//   node scripts/load/run.mjs --base https://examino-api-staging.onrender.com --scenario mixed --users 2000 --ramp 120
//
// Scenarios
//   exam   – each virtual student: exam details → start → autosave every --save s (×--saves) → submit
//   browse – dashboard, available exams, league, notices, battle topics (one round per user)
//   battle – students pair up through random matchmaking, read the SSE stream, answer 10 questions
//   mixed  – 70 % exam, 20 % browse, 10 % battle
// Output: p50/p95/p99 latency and error rate per endpoint; JSON in ../reports/phase10/
import fs from "fs";
import path from "path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = String(arg("base", "http://localhost:5001")).replace(/\/$/, "");
const SCENARIO = arg("scenario", "exam");
const USERS = parseInt(arg("users", "50"));
const RAMP_S = parseFloat(arg("ramp", "10"));
const SAVE_S = parseFloat(arg("save", "10"));
const SAVES = parseInt(arg("saves", "6"));

// Production protection: only localhost or a host that says "staging".
const host = new URL(BASE).hostname;
const PRODUCTION_HOSTS = ["exam-backend-2-o8e6.onrender.com"];
if (PRODUCTION_HOSTS.includes(host) || !(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /staging/i.test(host))) {
  console.error(`Refusing to load-test ${host}. Use localhost or a staging host (its name must contain "staging").`);
  process.exit(2);
}

const T = JSON.parse(fs.readFileSync(".local-snapshot/load-tokens.json", "utf8"));
if (T.students.length < USERS) throw new Error(`Only ${T.students.length} seeded students; seed more or lower --users.`);
const stats = new Map(); // endpoint → { ms: [], errors: 0, codes: {} }
const rec = (name, ms, status) => {
  const s = stats.get(name) || { ms: [], errors: 0, codes: {} };
  s.ms.push(ms);
  s.codes[status] = (s.codes[status] || 0) + 1;
  if (!(status >= 200 && status < 300)) s.errors++;
  stats.set(name, s);
};
async function call(name, token, method, p, body) {
  const t0 = performance.now();
  let status = 0;
  let data = null;
  try {
    const r = await fetch(BASE + p, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    status = r.status;
    data = await r.json().catch(() => null);
  } catch {
    status = 0;
  }
  rec(name, performance.now() - t0, status);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (s) => s * 1000 * (0.8 + Math.random() * 0.4);

async function examUser(tok) {
  const code = T.examCode;
  await call("GET /exams/:code", tok, "GET", `/api/exams/${code}`);
  const st = await call("POST /exams/:code/start", tok, "POST", `/api/exams/${code}/start`);
  const qs = st?.questions || [];
  const answers = {};
  for (let i = 0; i < SAVES; i++) {
    await sleep(jitter(SAVE_S));
    const q = qs[Math.floor(Math.random() * Math.max(1, qs.length))];
    if (q) answers[q._id] = (q.options || [])[Math.floor(Math.random() * 4)];
    await call("PUT /exams/:code/answers", tok, "PUT", `/api/exams/${code}/answers`, { answers });
  }
  await call("POST /exams/submit", tok, "POST", "/api/exams/submit", { examCode: code, answers, idempotencyKey: `${tok.slice(-12)}-${Date.now()}` });
}
async function browseUser(tok) {
  for (const [n, p] of [
    ["GET /student/dashboard", "/api/student/dashboard"],
    ["GET /exams/student/available", "/api/exams/student/available"],
    ["GET /league/me", "/api/league/me"],
    ["GET /notices", "/api/notices"],
    ["GET /battles/topics", "/api/battles/topics"],
  ]) {
    await call(n, tok, "GET", p);
    await sleep(jitter(1));
  }
}
async function battleUser(tok) {
  const f = await call("POST /battles/find", tok, "POST", "/api/battles/find", { subject: "ICT", difficulty: "mixed" });
  const id = f?.battle?._id;
  if (!id) return;
  // Read the stream until the battle is active (or 70 s), like the app does.
  const ctrl = new AbortController();
  const t0 = performance.now();
  let battle = null;
  try {
    const r = await fetch(`${BASE}/api/battles/${id}/stream`, { headers: { Authorization: `Bearer ${tok}` }, signal: ctrl.signal });
    rec("GET /battles/:id/stream (open)", performance.now() - t0, r.status);
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    const stop = setTimeout(() => ctrl.abort(), 70_000);
    let buf = "";
    while (!battle) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      for (const block of buf.split("\n\n").slice(0, -1)) {
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        const b = line && JSON.parse(line.slice(6)).battle;
        if (b?.status === "active" || b?.status === "cancelled") battle = b;
      }
      buf = buf.slice(buf.lastIndexOf("\n\n") + 2);
    }
    clearTimeout(stop);
  } catch {
    /* aborted or failed */
  }
  if (battle?.status !== "active") {
    await call("POST /battles/:id/leave", tok, "POST", `/api/battles/${id}/leave`);
    return;
  }
  await sleep(Math.max(0, new Date(battle.startedAt) - new Date(battle.serverNow)) + 200);
  for (let i = 0; i < battle.totalQuestions; i++) {
    await sleep(jitter(2));
    await call("POST /battles/:id/answer", tok, "POST", `/api/battles/${id}/answer`, { index: i, optionIndex: Math.floor(Math.random() * 4) });
  }
  ctrl.abort();
}

const pick = (i) => {
  if (SCENARIO !== "mixed") return { exam: examUser, browse: browseUser, battle: battleUser }[SCENARIO];
  const r = i % 10;
  return r < 7 ? examUser : r < 9 ? browseUser : battleUser;
};
const startedAt = Date.now();
console.log(`${SCENARIO}: ${USERS} virtual users over ${RAMP_S}s against ${BASE}`);
await Promise.all(
  Array.from({ length: USERS }, async (_, i) => {
    await sleep((RAMP_S * 1000 * i) / USERS);
    await pick(i)(T.students[i]);
  })
);
const wall = (Date.now() - startedAt) / 1000;
const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);
const rows = [...stats].map(([name, s]) => {
  const ms = [...s.ms].sort((a, b) => a - b);
  return { endpoint: name, requests: ms.length, rps: +(ms.length / wall).toFixed(2), p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), p99: Math.round(pct(ms, 99)), max: Math.round(ms.at(-1) || 0), errorRate: +((s.errors / ms.length) * 100).toFixed(2), codes: s.codes };
});
const total = rows.reduce((a, r) => a + r.requests, 0);
console.table(rows.map(({ codes, ...r }) => r)); // eslint-disable-line no-unused-vars
console.log(`total ${total} requests in ${wall.toFixed(1)} s (${(total / wall).toFixed(1)} req/s)`);
const out = path.resolve(`../reports/phase10/load_${SCENARIO}_${USERS}u_${host.replace(/[^a-z0-9]/gi, "_")}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ base: BASE, scenario: SCENARIO, users: USERS, rampSeconds: RAMP_S, saveEverySeconds: SAVE_S, saves: SAVES, wallSeconds: wall, generatedAt: new Date().toISOString(), rows }, null, 2));
console.log("→", out);
