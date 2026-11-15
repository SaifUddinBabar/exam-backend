// READ-ONLY: evaluates the topic resolver (utils/syllabusTopics.js) on the production
// snapshot: per-topic counts, how each question was classified (stored / keyword / board /
// uncategorised) and samples so academic correctness can be checked by a person.
//   node scripts/audit/topic_matcher_precision.mjs
import fs from "fs";
import path from "path";
import { EJSON } from "bson";
import { ALL_CHAPTERS, UNCATEGORISED, chapterTopicNames, resolveQuestionTopic } from "../../utils/syllabusTopics.js";

const qs = EJSON.parse(fs.readFileSync(".local-snapshot/questions.json", "utf8"), { relaxed: false });
const resolved = qs.map((q) => ({ q, r: resolveQuestionTopic(q) }));
const report = [];
for (const ch of ALL_CHAPTERS) {
  const inCh = resolved.filter((x) => x.r.chapterId === ch.chapterId);
  const methods = {};
  inCh.forEach((x) => (methods[x.r.method] = (methods[x.r.method] || 0) + 1));
  const topics = chapterTopicNames(ch.chapterId).map((t) => {
    const hits = inCh.filter((x) => x.r.topic === t);
    return {
      topic: t,
      count: hits.length,
      byMethod: hits.reduce((a, x) => ((a[x.r.method] = (a[x.r.method] || 0) + 1), a), {}),
      sample: hits.slice(0, 8).map((x) => `[${x.r.method}] ${(x.q.question || "").replace(/\s+/g, " ").slice(0, 100)}`),
    };
  });
  report.push({ chapter: ch.chapterName, questions: inCh.length, sumOfTopicCounts: topics.reduce((a, t) => a + t.count, 0), methods, topics });
}
const unmapped = resolved.filter((x) => !x.r.chapterId).length;
const out = path.resolve("../reports/phase1/topic_matcher_precision.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ engine: "one-topic-per-question resolver", generatedAt: new Date().toISOString(), totalQuestions: qs.length, unmappedChapter: unmapped, chapters: report }, null, 2));
console.log(`total ${qs.length}, questions with a non-standard chapter: ${unmapped}`);
for (const r of report) {
  console.log(`\n${r.chapter}: ${r.questions} questions = sum of topics ${r.sumOfTopicCounts}  methods ${JSON.stringify(r.methods)}`);
  r.topics.forEach((t) => console.log(`   ${String(t.count).padStart(4)}  ${t.topic}`));
}
