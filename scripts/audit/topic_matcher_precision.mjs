// READ-ONLY: evaluates the syllabus keyword topic matcher (utils/syllabusTopics.js)
// against the production snapshot. Reports counts, overlap between topics and
// samples of returned questions so their academic correctness can be checked.
//   node scripts/audit/topic_matcher_precision.mjs
import fs from "fs";
import path from "path";
import { EJSON } from "bson";
import { SYLLABUS_DATA, buildChapterRegex, buildTopicQuery } from "../../utils/syllabusTopics.js";

const qs = EJSON.parse(fs.readFileSync(".local-snapshot/questions.json", "utf8"), { relaxed: false });

// Minimal evaluator for the Mongo filter shapes buildTopicQuery produces.
const test = (rx, v) => (Array.isArray(v) ? v.some((x) => rx.test(String(x ?? ""))) : rx.test(String(v ?? "")));
function matches(q, f) {
  if (f.$or) return f.$or.some((c) => matches(q, c));
  for (const [k, cond] of Object.entries(f)) {
    if (cond instanceof RegExp) {
      if (!test(cond, q[k])) return false;
    } else if (cond && typeof cond === "object" && "$in" in cond) {
      if (!cond.$in.includes(q[k] ?? null)) return false;
    } else if (cond && typeof cond === "object" && "$exists" in cond) {
      if ((q[k] !== undefined) !== cond.$exists) return false;
    } else if (q[k] !== cond) return false;
  }
  return true;
}

const report = [];
for (const ch of SYLLABUS_DATA) {
  const chRx = buildChapterRegex(ch.chapterName);
  const inChapter = qs.filter((q) => chRx.test(q.chapter || ""));
  const perQ = new Map(inChapter.map((q) => [String(q._id), []]));
  const topics = ch.topics.map((t) => {
    const f = buildTopicQuery(ch.chapterName, t.name);
    const hits = inChapter.filter((q) => matches(q, f));
    hits.forEach((q) => perQ.get(String(q._id)).push(t.name));
    const viaExplanationOnly = hits.filter((q) => !t.rx.test(q.question || "") && !(q.options || []).some((o) => t.rx.test(o)) && !t.rx.test(q.topic || "")).length;
    return { topic: t.name, count: hits.length, viaExplanationOnly, sample: hits.slice(0, 6).map((q) => (q.question || "").replace(/\s+/g, " ").slice(0, 110)) };
  });
  const counts = [...perQ.values()].map((a) => a.length);
  report.push({
    chapter: ch.chapterName,
    questionsInChapter: inChapter.length,
    sumOfTopicCounts: topics.reduce((a, t) => a + t.count, 0),
    questionsInNoTopic: counts.filter((n) => n === 0).length,
    questionsInOneTopic: counts.filter((n) => n === 1).length,
    questionsInSeveralTopics: counts.filter((n) => n > 1).length,
    maxTopicsForOneQuestion: Math.max(0, ...counts),
    topics,
  });
}
const out = path.resolve("../reports/phase1/topic_matcher_precision.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
for (const r of report) {
  console.log(`\n${r.chapter}: ${r.questionsInChapter} questions, topic counts sum ${r.sumOfTopicCounts}; none ${r.questionsInNoTopic}, one ${r.questionsInOneTopic}, several ${r.questionsInSeveralTopics} (max ${r.maxTopicsForOneQuestion})`);
  r.topics.forEach((t) => console.log(`   ${String(t.count).padStart(4)}  (expl-only ${String(t.viaExplanationOnly).padStart(3)})  ${t.topic}`));
}
