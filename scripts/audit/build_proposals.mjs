// Builds ../reports/phase2/proposed_changes.json from the audit reports, in the format
// scripts/migrations/apply_approved.mjs accepts. NOTHING is applied by this script.
// To approve: copy the rows you agree with into approved.json, then dry-run the migration.
import fs from "fs";
import path from "path";

const dir = path.resolve("../reports/phase2");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const dups = read("duplicates_audit.json");
const topics = read("topics_audit.json");
const cross = read("cross_subject_audit.json");
const diff = read("difficulty_audit.json");

const hideDuplicate = [];
for (const g of dups.groups) {
  for (const d of g.duplicates) {
    // Only exact / formatting-only copies in the same chapter, never referenced by exams or submissions.
    const safe = (d.kind === "exact" || d.kind === "formatting-only") && d.chapter === g.originalCandidate.chapter && !d.references.exams.length && !d.references.submissions;
    if (safe) hideDuplicate.push({ id: d.id, duplicateOf: g.originalCandidate.id, kind: d.kind });
  }
}

const setTopic = topics.rows.filter((r) => r.confidence === "High" && r.suggestedTopic).map((r) => ({ id: r.id, topic: r.suggestedTopic, from: r.currentTopic, reason: r.reason }));

// Cross-subject: the target chapter must be chosen by the teacher, so chapter is left blank.
const moveSubject = cross.currentFindings
  .filter((c) => c.confidence === "High")
  .map((c) => ({ id: c.id, subject: c.suggestedSubject.split(" / ")[0], chapter: "", note: `FILL IN CHAPTER. ${c.reason}`, question: c.question.slice(0, 120) }));

const setDifficulty = diff.proposedToUnclassified.map((id) => ({ id, difficulty: "unclassified" }));

const out = {
  readme:
    "Proposals only. Review each list, delete rows you disagree with, fill in blank chapters, then save as approved.json and run: node scripts/migrations/apply_approved.mjs --approval ../reports/phase2/approved.json (dry run) and add --apply only after checking the output. Every apply writes a backup that --rollback can restore.",
  counts: { hideDuplicate: hideDuplicate.length, setTopic: setTopic.length, moveSubject: moveSubject.length, setDifficulty: setDifficulty.length },
  hideDuplicate,
  setTopic,
  moveSubject,
  setDifficulty,
  dropLegacyBatchIndex: true,
};
fs.writeFileSync(path.join(dir, "proposed_changes.json"), JSON.stringify(out, null, 2));
console.log(out.counts);
