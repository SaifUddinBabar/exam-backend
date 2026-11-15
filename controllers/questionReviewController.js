// Teacher review queue (read-only). Lists questions the topic resolver leaves
// Uncategorised, and questions that cannot be used in timed play (missing passage,
// figure, duplicate options…), with suggestions. Nothing here changes a question:
// teachers act through the normal edit endpoint (PUT /api/questions/:id, which keeps a
// revision) or by filing a report.
import Question from "../models/Question.js";
import QuestionReport from "../models/QuestionReport.js";
import { getTopicIndex } from "../services/topicIndex.js";
import { ALL_CHAPTERS, UNCATEGORISED, chapterTopicNames, topicHints } from "../utils/syllabusTopics.js";
import { ISSUE_LABELS } from "../utils/questionQuality.js";

const VISIBLE = { hidden: { $ne: true }, $or: [{ isPublic: true }, { organizationId: null }] };
const STANDARD = ALL_CHAPTERS.filter((c) => c.chapterId !== "board");

// GET /api/questions/review?kind=uncategorised|unplayable&chapter=ch1&page=1&limit=20
export const reviewQueue = async (req, res) => {
  try {
    const kind = req.query.kind === "unplayable" ? "unplayable" : "uncategorised";
    const chapterId = STANDARD.some((c) => c.chapterId === req.query.chapter) ? req.query.chapter : "";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const idx = await getTopicIndex();
    const visibleIds = new Set((await Question.find(VISIBLE).distinct("_id")).map(String));
    const counts = Object.fromEntries(STANDARD.map((c) => [c.chapterId, { uncategorised: 0, unplayable: 0 }]));
    const matching = [];
    for (const [id, r] of idx) {
      if (!visibleIds.has(id) || !counts[r.chapterId]) continue;
      const unc = r.topic === UNCATEGORISED;
      const unp = Boolean(r.issues?.length);
      if (unc) counts[r.chapterId].uncategorised++;
      if (unp) counts[r.chapterId].unplayable++;
      if ((kind === "uncategorised" ? unc : unp) && (!chapterId || r.chapterId === chapterId)) matching.push(id);
    }
    matching.sort(); // stable order (ObjectId = creation order)
    const pageIds = matching.slice((page - 1) * limit, page * limit);
    const docs = await Question.find({ _id: { $in: pageIds } })
      .select("question options correctAnswer chapter topic difficulty image questionType boardName")
      .lean();
    const open = new Set((await QuestionReport.find({ questionId: { $in: pageIds }, status: "open" }).distinct("questionId")).map(String));
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const items = pageIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((q) => {
        const r = idx.get(String(q._id));
        const ch = STANDARD.find((c) => c.chapterId === r.chapterId);
        return {
          ...q,
          resolved: { chapterId: r.chapterId, chapterName: ch?.chapterName, topic: r.topic, method: r.method },
          issues: (r.issues || []).map((code) => ({ code, label: ISSUE_LABELS[code] || code })),
          hints: topicHints(q),
          hasOpenReport: open.has(String(q._id)),
        };
      });
    return res.json({
      success: true,
      kind,
      chapter: chapterId || null,
      counts,
      chapters: STANDARD.map((c) => ({ chapterId: c.chapterId, chapterName: c.chapterName, shortName: c.shortName, topics: chapterTopicNames(c.chapterId).filter((t) => t !== UNCATEGORISED) })),
      total: matching.length,
      page,
      totalPages: Math.max(1, Math.ceil(matching.length / limit)),
      items,
    });
  } catch (e) {
    console.error("reviewQueue:", e.message);
    return res.status(500).json({ success: false, message: "Could not load the review queue." });
  }
};
