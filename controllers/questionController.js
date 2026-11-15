import mongoose from "mongoose";
import QuestionRevision from "../models/QuestionRevision.js";
import QuestionReport from "../models/QuestionReport.js";
import { isStaff, isSuperAdmin } from "../utils/access.js";
import Question from "../models/Question.js";
import { applyTopicFilter, getChapterQueryRegex } from "./practiceController.js";

// =====================================================
// CHAPTER 2 — APPROVED 13 TOPICS ONLY
// =====================================================
const CHAPTER_2_TOPICS = [
  "কমিউনিকেশন সিস্টেম (Communication System)",
  "ডেটা কমিউনিকেশন (Data Communication)",
  "ডেটা কমিউনিকেশনের উপাদান (Data Communication Components: Source, Transmitter, Media, Receiver, Destination)",
  "ডেটা ট্রান্সমিশন মোড (Data Transmission Mode: Serial/Parallel, Simplex/Half Duplex/Full Duplex)",
  "ব্যান্ডউইথ (Bandwidth)",
  "কমিউনিকেশন মিডিয়া: তারযুক্ত (Wired Media – Twisted Pair, Coaxial, Fiber Optic)",
  "কমিউনিকেশন মিডিয়া: তারবিহীন (Wireless Media – Radio Wave, Microwave, Satellite, Bluetooth, Infrared, Wi-Fi, WiMAX)",
  "মোবাইল কমিউনিকেশন সিস্টেম (Mobile Communication System)",
  "মোবাইল ফোনের বিভিন্ন প্রজন্ম (Generations of Mobile Phone: 1G–5G)",
  "কম্পিউটার নেটওয়ার্ক (Computer Network) ও নেটওয়ার্কের প্রকারভেদ (PAN, LAN, MAN, WAN)",
  "নেটওয়ার্ক টপোলজি (Network Topology: Bus, Ring, Star, Tree, Mesh, Hybrid)",
  "নেটওয়ার্কিং ডিভাইস (Networking Devices: Modem, Hub, Switch, Router, Gateway, Repeater)",
  "ক্লাউড কম্পিউটিং (Cloud Computing)"
];

// =====================================================
// CREATE QUESTION (Protected - Tutor / Admin)
// =====================================================
export const createQuestion = async (req, res) => {
  try {
    const {
      question,
      options,
      correctAnswer,
      chapter,
      subject,
      topic,
      questionType,
      boardName,
      boardYear,
      difficulty,
      explanation,
      isPublic,
      questionBn,
      questionEn,
      optionsBn,
      optionsEn,
      explanationBn,
      explanationEn,
      version
    } = req.body;

    const mainQuestion = (question || questionBn || questionEn || "").trim();
    if (!mainQuestion || !options || !correctAnswer || !chapter || !subject) {
      return res.status(400).json({
        success: false,
        message: "Question, 4 options, correct answer, chapter, and subject are required."
      });
    }

    // Parse options if sent as string or JSON
    let parsedOptions = options;
    if (typeof options === "string") {
      try {
        parsedOptions = JSON.parse(options);
      } catch {
        parsedOptions = options.split(",").map(o => o.trim());
      }
    }

    if (!Array.isArray(parsedOptions) || parsedOptions.length !== 4) {
      return res.status(400).json({
        success: false,
        message: "Exactly 4 options are required."
      });
    }

    // Parse bilingual options if provided
    let parsedBn = [];
    if (optionsBn) {
      try { parsedBn = typeof optionsBn === "string" ? JSON.parse(optionsBn) : optionsBn; } catch { parsedBn = optionsBn.split(",").map(o => o.trim()); }
    }
    let parsedEn = [];
    if (optionsEn) {
      try { parsedEn = typeof optionsEn === "string" ? JSON.parse(optionsEn) : optionsEn; } catch { parsedEn = optionsEn.split(",").map(o => o.trim()); }
    }

    // Chapter 2 rule: Only allow approved 13 topics
    if (
      chapter === "Communication Systems" &&
      topic &&
      !CHAPTER_2_TOPICS.includes(topic)
    ) {
      return res.status(400).json({
        success: false,
        message: "Chapter 2-এর জন্য এই topic অনুমোদিত নয়।"
      });
    }

    const image = req.file ? req.file.filename : null;
    const organizationId = req.tenant?.orgId || null;
    const tutorId = req.user?._id?.toString() || "";

    const newQuestion = await Question.create({
      question: mainQuestion,
      options: parsedOptions,
      correctAnswer: correctAnswer.trim(),
      explanation: explanation ? explanation.trim() : "",
      chapter: chapter.trim(),
      subject: subject.trim(),
      topic: topic ? topic.trim() : "",
      questionType: questionType || "normal",
      boardName: boardName || "",
      boardYear: boardYear || "",
      difficulty: ["easy", "medium", "hard", "unclassified"].includes(difficulty) ? difficulty : "unclassified",
      image: image || "",
      tutorId,
      organizationId,
      isPublic: isPublic !== undefined ? Boolean(isPublic) : !organizationId,
      questionBn: questionBn ? questionBn.trim() : (version === "bangla" ? mainQuestion : ""),
      questionEn: questionEn ? questionEn.trim() : (version === "english" ? mainQuestion : ""),
      optionsBn: parsedBn.length === 4 ? parsedBn : [],
      optionsEn: parsedEn.length === 4 ? parsedEn : [],
      explanationBn: explanationBn ? explanationBn.trim() : "",
      explanationEn: explanationEn ? explanationEn.trim() : "",
      version: version || null
    });

    return res.status(201).json(newQuestion);
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(" ") });
    }
    console.error("createQuestion error:", err.message);
    return res.status(500).json({ success: false, message: "Could not save the question." });
  }
};

// =====================================================
// UPDATE QUESTION
// Who may edit: the author, an org admin of the question's organization, a
// super admin, or (for shared platform questions that have no author) any
// teacher. Every edit stores the previous version in QuestionRevision first,
// so original Bengali/English content is never lost.
// =====================================================
const EDITABLE_TEXT = ["question", "chapter", "subject", "topic", "explanation", "questionBn", "questionEn", "explanationBn", "explanationEn", "className", "boardName", "boardYear"];

function parseOptionList(v) {
  if (v === undefined) return undefined;
  let parsed = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      parsed = v.split(",").map((o) => o.trim());
    }
  }
  return Array.isArray(parsed) ? parsed.map((o) => String(o ?? "").trim()) : null;
}

export function canEditQuestion(user, q, tenant) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (q.tutorId && String(q.tutorId) === String(user._id)) return true;
  if (tenant?.role === "org_admin" && q.organizationId && String(q.organizationId) === String(tenant.orgId)) return true;
  return !q.tutorId && !q.organizationId && isStaff(user);
}

export const updateQuestion = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid question id." });
    const doc = await Question.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Question not found" });
    if (!canEditQuestion(req.user, doc, req.tenant)) {
      return res.status(403).json({ success: false, message: "Not authorized to update this question" });
    }
    const before = doc.toObject();
    const b = req.body || {};
    const changed = [];
    const set = (k, v) => {
      if (JSON.stringify(doc[k]) !== JSON.stringify(v)) {
        doc[k] = v;
        changed.push(k);
      }
    };

    EDITABLE_TEXT.forEach((k) => {
      if (b[k] !== undefined) set(k, String(b[k]).trim());
    });
    if (b.difficulty !== undefined) {
      if (!["easy", "medium", "hard", "unclassified"].includes(b.difficulty)) return res.status(400).json({ success: false, message: "Invalid difficulty." });
      set("difficulty", b.difficulty);
    }
    if (b.questionType !== undefined) set("questionType", b.questionType === "board" ? "board" : "normal");
    if (b.isPublic !== undefined) set("isPublic", b.isPublic === true || b.isPublic === "true");
    for (const k of ["options", "optionsBn", "optionsEn"]) {
      const list = parseOptionList(b[k]);
      if (list === undefined) continue;
      const okLength = k === "options" ? list && list.length === 4 : list && (list.length === 0 || list.length === 4);
      if (!okLength) return res.status(400).json({ success: false, message: `${k} must contain exactly 4 options.` });
      if (list.length && list.some((o) => !o)) return res.status(400).json({ success: false, message: "Options cannot be empty." });
      set(k, list);
    }
    if (b.correctAnswer !== undefined) set("correctAnswer", String(b.correctAnswer).trim());
    if (req.file) set("image", req.file.filename);
    if (b.removeImage === "true" || b.removeImage === true) set("image", "");

    if (!doc.options.includes(doc.correctAnswer)) {
      return res.status(400).json({ success: false, message: "Correct answer must match one of the options." });
    }
    if (!changed.length) return res.json({ success: true, question: doc, changed: [] });

    await doc.validate();
    await QuestionRevision.create({ questionId: doc._id, editedBy: req.user._id, before, changedFields: changed });
    await doc.save();
    return res.json({ success: true, question: doc, changed });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(" ") });
    console.error("updateQuestion error:", err.message);
    return res.status(500).json({ success: false, message: "Could not update the question." });
  }
};

// GET /api/questions/:id/revisions
export const getQuestionRevisions = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid question id." });
    const rows = await QuestionRevision.find({ questionId: req.params.id }).sort({ createdAt: -1 }).limit(50).populate("editedBy", "name").lean();
    return res.json({ success: true, revisions: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Could not load revisions." });
  }
};

// =====================================================
// REPORT A PROBLEMATIC QUESTION
// =====================================================
const REPORT_REASONS = ["wrong_answer", "typo", "wrong_subject", "wrong_topic", "image_missing", "duplicate", "language", "other"];

export const reportQuestion = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid question id." });
    const reason = String(req.body?.reason || "");
    if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ success: false, message: "Choose a reason." });
    if (!(await Question.exists({ _id: req.params.id }))) return res.status(404).json({ success: false, message: "Question not found" });
    const open = await QuestionReport.findOne({ questionId: req.params.id, reportedBy: req.user._id, status: "open" });
    if (open) return res.json({ success: true, alreadyReported: true, report: open });
    const report = await QuestionReport.create({ questionId: req.params.id, reportedBy: req.user._id, reason, note: String(req.body?.note || "").slice(0, 1000) });
    return res.status(201).json({ success: true, report });
  } catch (err) {
    console.error("reportQuestion error:", err.message);
    return res.status(500).json({ success: false, message: "Could not send the report." });
  }
};

// GET /api/questions/reports?status=open
export const listReports = async (req, res) => {
  try {
    const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : "open";
    const rows = await QuestionReport.find({ status })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("questionId", "question chapter topic subject tutorId organizationId")
      .populate("reportedBy", "name role")
      .lean();
    const visible = rows.filter((r) => r.questionId && canEditQuestion(req.user, r.questionId, req.tenant));
    return res.json({ success: true, reports: visible });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Could not load reports." });
  }
};

// PUT /api/questions/reports/:reportId { status }
export const resolveReport = async (req, res) => {
  try {
    const status = req.body?.status;
    if (!["resolved", "dismissed", "open"].includes(status)) return res.status(400).json({ success: false, message: "Invalid status." });
    if (!mongoose.Types.ObjectId.isValid(req.params.reportId)) return res.status(400).json({ success: false, message: "Invalid report id." });
    const r = await QuestionReport.findById(req.params.reportId).populate("questionId", "tutorId organizationId");
    if (!r || !r.questionId) return res.status(404).json({ success: false, message: "Report not found." });
    if (!canEditQuestion(req.user, r.questionId, req.tenant)) return res.status(403).json({ success: false, message: "Not authorized." });
    r.status = status;
    r.resolvedBy = status === "open" ? null : req.user._id;
    r.resolvedAt = status === "open" ? null : new Date();
    await r.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Could not update the report." });
  }
};

// =====================================================
// GET QUESTIONS (Tenant-Scoped & Filterable)
// =====================================================
export const getQuestions = async (req, res) => {
  try {
    const {
      chapter,
      subject,
      questionType,
      boardYear,
      boardName,
      topic,
      difficulty,
      limit
    } = req.query;

    let query = { hidden: { $ne: true } };

    // Tenancy Filter: Allow public questions OR questions belonging to the current tenant
    if (req.tenant?.orgId) {
      query.$or = [
        { organizationId: req.tenant.orgId },
        { isPublic: true },
        { organizationId: null }
      ];
    }

    if (subject) query.subject = subject;
    if (chapter) query.chapter = getChapterQueryRegex(chapter);
    if (topic && topic !== "All") {
      applyTopicFilter(query, topic);
    }

    if (difficulty) query.difficulty = difficulty;

    if (questionType === "board") {
      query.questionType = "board";
      if (boardName) query.boardName = boardName;
      if (boardYear) query.boardYear = boardYear;
    } else if (questionType === "normal") {
      query.questionType = "normal";
    }

    let questionsQuery = Question.find(query);
    if (limit) {
      questionsQuery = questionsQuery.limit(parseInt(limit));
    }

    const questions = await questionsQuery;
    return res.json(questions);
  } catch (err) {
    console.error("getQuestions error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// GET DISTINCT TOPICS FOR A CHAPTER
// =====================================================
export const getTopics = async (req, res) => {
  try {
    const { subject, chapter } = req.query;

    if (!subject || !chapter) {
      return res.status(400).json({
        success: false,
        message: "subject ও chapter প্রয়োজন"
      });
    }

    let topics;
    if (chapter === "Communication Systems") {
      const existingTopics = await Question.distinct("topic", {
        subject,
        chapter,
        questionType: "normal",
        topic: { $in: CHAPTER_2_TOPICS }
      });

      topics = CHAPTER_2_TOPICS.filter((topic) =>
        existingTopics.includes(topic)
      );
    } else {
      topics = await Question.distinct("topic", {
        subject,
        chapter,
        questionType: "normal",
        topic: { $ne: "" }
      });
    }

    return res.json(topics);
  } catch (err) {
    console.error("getTopics error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// AUTO GENERATE MODEL TEST (40% Easy, 40% Medium, 20% Hard)
// =====================================================
export const autoGenerateQuestions = async (req, res) => {
  try {
    const { subject, chapter, total } = req.query;

    if (!subject || !chapter || !total) {
      return res.status(400).json({
        success: false,
        message: "subject, chapter ও total প্রয়োজন"
      });
    }

    const totalCount = parseInt(total);
    if (!totalCount || totalCount <= 0) {
      return res.status(400).json({
        success: false,
        message: "সঠিক প্রশ্ন সংখ্যা দিন"
      });
    }

    const baseMatch = {
      subject,
      chapter,
      questionType: "normal"
    };

    if (chapter === "Communication Systems") {
      baseMatch.topic = { $in: CHAPTER_2_TOPICS };
    }

    const easyCount = Math.round(totalCount * 0.4);
    const mediumCount = Math.round(totalCount * 0.4);
    const hardCount = totalCount - easyCount - mediumCount;

    const pickRandom = async (difficulty, count, excludeIds = []) => {
      if (count <= 0) return [];
      return Question.aggregate([
        {
          $match: {
            ...baseMatch,
            difficulty,
            _id: { $nin: excludeIds }
          }
        },
        { $sample: { size: count } }
      ]);
    };

    const easyQs = await pickRandom("easy", easyCount);
    const mediumQs = await pickRandom("medium", mediumCount);
    const hardQs = await pickRandom("hard", hardCount);

    let result = [...easyQs, ...mediumQs, ...hardQs];

    const shortage = totalCount - result.length;
    if (shortage > 0) {
      const usedIds = result.map((q) => q._id);
      const fillQs = await Question.aggregate([
        {
          $match: {
            ...baseMatch,
            _id: { $nin: usedIds }
          }
        },
        { $sample: { size: shortage } }
      ]);
      result = [...result, ...fillQs];
    }

    return res.json({
      questions: result,
      breakdown: {
        requested: { easy: easyCount, medium: mediumCount, hard: hardCount },
        found: {
          easy: easyQs.length,
          medium: mediumQs.length,
          hard: hardQs.length
        },
        total: result.length
      }
    });
  } catch (err) {
    console.error("autoGenerateQuestions error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
