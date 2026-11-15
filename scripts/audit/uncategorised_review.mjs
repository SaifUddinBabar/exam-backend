// READ-ONLY: lists every question the topic resolver leaves Uncategorised, so a teacher can
// assign a topic or confirm it is off-subject. Nothing is written to any database.
//   node scripts/audit/uncategorised_review.mjs
// Output: ../reports/phase2/uncategorised_review.json
import fs from "fs";
import path from "path";
import { EJSON } from "bson";
import { ALL_CHAPTERS, UNCATEGORISED, resolveQuestionTopic } from "../../utils/syllabusTopics.js";

const qs = EJSON.parse(fs.readFileSync(".local-snapshot/questions.json", "utf8"), { relaxed: false });
const text = (q) => [q.question, ...(q.options || [])].filter(Boolean).join(" ");

// Which other chapters' topic terms appear in the question? (hint only, never applied)
function otherChapterHints(q, ownChapterId) {
  const t = text(q);
  const hits = [];
  for (const ch of ALL_CHAPTERS) {
    if (ch.chapterId === ownChapterId) continue;
    for (const tp of ch.topics) {
      if ((tp.rx && tp.rx.test(t)) || (tp.rxCs && tp.rxCs.test(t))) hits.push(`${ch.chapterId}: ${tp.name}`);
    }
  }
  return hits;
}

const rows = [];
for (const q of qs) {
  const r = resolveQuestionTopic(q);
  if (!r.chapterId || r.topic !== UNCATEGORISED) continue;
  const hints = otherChapterHints(q, r.chapterId);
  rows.push({
    _id: String(q._id),
    chapterId: r.chapterId,
    storedChapter: q.chapter,
    storedTopic: q.topic || "",
    question: (q.question || "").replace(/\s+/g, " ").slice(0, 220),
    options: q.options || [],
    review: hints.length ? "matches another chapter's topic — may be filed under the wrong chapter" : "no ICT topic term found — may be off-subject or need a new topic",
    hints,
  });
}
const byChapter = {};
for (const r of rows) {
  const c = (byChapter[r.chapterId] ||= { total: 0, otherChapter: 0, noIctTerm: 0 });
  c.total++;
  r.hints.length ? c.otherChapter++ : c.noIctTerm++;
}
const out = path.resolve("../reports/phase2/uncategorised_review.json");
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, note: "Proposals only. Nothing has been changed. A teacher must approve any topic or chapter change.", summary: byChapter, questions: rows }, null, 2));
console.log(JSON.stringify(byChapter, null, 1));
console.log(`${rows.length} questions → ${out}`);
