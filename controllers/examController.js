import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import Question from "../models/Question.js";
import ExamAttempt from "../models/ExamAttempt.js";
import Batch from "../models/Batch.js";
import User from "../models/User.js";
import {
  isStaff,
  isSuperAdmin,
  canStudentAccessExam,
  canStaffManageExam,
  studentExamFilter,
  toId,
} from "../utils/access.js";
import { awardXp, XP_RULES } from "../services/gamification.js";

const SUBMIT_GRACE_MS = 60 * 1000; // network grace after the server deadline
const STUDENT_QUESTION_FIELDS = "subject chapter topic difficulty question options image questionBn questionEn optionsBn optionsEn version questionType boardName boardYear";

const generateCode = () => Math.random().toString(36).substring(2, 7).toUpperCase();

const findExamByCode = (code) => Exam.findOne({ examCode: String(code || "").toUpperCase() });

/** Window state of an exam at `now`. */
export function examWindow(exam, now = new Date()) {
  if (exam.startTime && now < new Date(exam.startTime)) return "upcoming";
  if (exam.endTime && now > new Date(exam.endTime)) return "closed";
  return "active";
}

/** Whether correct answers / explanations may be shown to a student now. */
export function solutionsReleased(exam, now = new Date()) {
  if (exam.solutionReleaseTime) return now >= new Date(exam.solutionReleaseTime);
  if (exam.endTime) return now >= new Date(exam.endTime);
  return true; // untimed practice exams: show immediately after submission
}

function attemptLimit(exam) {
  if (exam.examType === "scheduled" || exam.allowRetake === false) return 1;
  return exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : Infinity;
}

async function orderedQuestions(exam, fields) {
  const ids = (exam.questions || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const q = Question.find({ _id: { $in: ids } });
  if (fields) q.select(fields);
  const rows = await q.lean();
  const map = new Map(rows.map((r) => [String(r._id), r]));
  return (exam.questions || []).map((id) => map.get(String(id))).filter(Boolean);
}

async function validateAssignment(assignment, user) {
  if (!assignment || !assignment.mode) return { mode: "all", batchIds: [], studentIds: [] };
  const mode = assignment.mode;
  if (!["all", "batches", "students"].includes(mode)) throw Object.assign(new Error("Invalid assignment mode."), { status: 400 });
  if (mode === "all") return { mode, batchIds: [], studentIds: [] };
  if (mode === "batches") {
    const ids = (assignment.batchIds || []).map(toId).filter(Boolean);
    if (!ids.length) throw Object.assign(new Error("Select at least one batch."), { status: 400 });
    const filter = { _id: { $in: ids }, status: { $ne: "archived" } };
    if (!isSuperAdmin(user)) filter.ownerId = user._id;
    const owned = await Batch.countDocuments(filter);
    if (owned !== ids.length) throw Object.assign(new Error("You can only assign exams to your own active batches."), { status: 403 });
    return { mode, batchIds: ids, studentIds: [] };
  }
  const ids = (assignment.studentIds || []).map(toId).filter(Boolean);
  if (!ids.length) throw Object.assign(new Error("Select at least one student."), { status: 400 });
  const found = await User.countDocuments({ _id: { $in: ids }, role: "student" });
  if (found !== ids.length) throw Object.assign(new Error("Some selected students do not exist."), { status: 400 });
  return { mode, batchIds: [], studentIds: ids };
}

function parseDate(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error("Invalid date."), { status: 400 });
  return d;
}

// ============================================================
// CREATE EXAM (teacher / admin)
// ============================================================
export const createExam = async (req, res) => {
  try {
    const { title, description, questions, duration, negativeMarkPerWrong, examType, allowRetake, maxAttempts, subject } = req.body;

    if (!title || !String(title).trim() || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: "Title and at least one question are required." });
    }
    const qIds = [...new Set(questions.map((q) => String(q?._id || q)))];
    if (!qIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ success: false, message: "Invalid question id in the list." });
    }
    const existing = await Question.countDocuments({ _id: { $in: qIds } });
    if (existing !== qIds.length) {
      return res.status(400).json({ success: false, message: "Some selected questions no longer exist." });
    }
    const dur = Number(duration) || 30;
    if (dur < 1 || dur > 600) return res.status(400).json({ success: false, message: "Duration must be 1–600 minutes." });

    const startTime = parseDate(req.body.startTime) ?? null;
    const endTime = parseDate(req.body.endTime) ?? null;
    if (startTime && endTime && endTime <= startTime) {
      return res.status(400).json({ success: false, message: "End time must be after start time." });
    }
    const assignment = await validateAssignment(req.body.assignment, req.user);

    let examCode = generateCode();
    while (await Exam.exists({ examCode })) examCode = generateCode();

    const exam = await Exam.create({
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      questions: qIds,
      duration: dur,
      negativeMarkPerWrong: Math.max(0, Number(negativeMarkPerWrong) || 0),
      examType: ["practice", "scheduled", "coaching"].includes(examType) ? examType : startTime || endTime ? "scheduled" : "practice",
      allowRetake: Boolean(allowRetake),
      maxAttempts: Math.max(1, Number(maxAttempts) || 1),
      startTime,
      endTime,
      solutionReleaseTime: parseDate(req.body.solutionReleaseTime) ?? null,
      subject: subject ? String(subject).trim() : "",
      examCode,
      organizationId: req.tenant?.orgId || null,
      authorId: req.user._id,
      isPublished: req.body.isPublished !== false,
      assignment,
    });

    return res.status(201).json(exam);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Create Exam Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to create exam." });
  }
};

// ============================================================
// UPDATE EXAM SETTINGS / ASSIGNMENT (owner)
// ============================================================
export const updateExam = async (req, res) => {
  try {
    const exam = await findExamByCode(req.params.code);
    if (!exam || exam.archivedAt) return res.status(404).json({ success: false, message: "Exam not found." });
    if (!canStaffManageExam(req.user, exam, req.tenant)) return res.status(403).json({ success: false, message: "You can only edit your own exams." });

    const b = req.body;
    if (b.title !== undefined) exam.title = String(b.title).trim() || exam.title;
    if (b.description !== undefined) exam.description = String(b.description).trim();
    if (b.duration !== undefined) {
      const d = Number(b.duration);
      if (!(d >= 1 && d <= 600)) return res.status(400).json({ success: false, message: "Duration must be 1–600 minutes." });
      exam.duration = d;
    }
    if (b.negativeMarkPerWrong !== undefined) exam.negativeMarkPerWrong = Math.max(0, Number(b.negativeMarkPerWrong) || 0);
    if (b.startTime !== undefined) exam.startTime = parseDate(b.startTime);
    if (b.endTime !== undefined) exam.endTime = parseDate(b.endTime);
    if (b.solutionReleaseTime !== undefined) exam.solutionReleaseTime = parseDate(b.solutionReleaseTime);
    if (b.isPublished !== undefined) exam.isPublished = Boolean(b.isPublished);
    if (b.allowRetake !== undefined) exam.allowRetake = Boolean(b.allowRetake);
    if (b.maxAttempts !== undefined) exam.maxAttempts = Math.max(1, Number(b.maxAttempts) || 1);
    if (b.assignment !== undefined) exam.assignment = await validateAssignment(b.assignment, req.user);
    if (exam.startTime && exam.endTime && exam.endTime <= exam.startTime) {
      return res.status(400).json({ success: false, message: "End time must be after start time." });
    }
    await exam.save();
    return res.json({ success: true, exam });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Update Exam Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update exam." });
  }
};

// ============================================================
// GET EXAM DETAILS (student: metadata only; questions come from /start)
// ============================================================
export const getExam = async (req, res) => {
  try {
    const exam = await findExamByCode(req.params.code);
    if (!exam || exam.archivedAt) return res.status(404).json({ success: false, message: "Exam not found." });

    const staff = isStaff(req.user);
    if (!staff && !(await canStudentAccessExam(req.user, exam))) {
      return res.status(403).json({ success: false, message: "This exam is not assigned to you." });
    }

    const questions = await orderedQuestions(exam, "subject chapter topic");
    const syllabus = {};
    questions.forEach((q) => {
      const key = q.chapter || "General";
      syllabus[key] = (syllabus[key] || 0) + 1;
    });

    const author = exam.authorId ? await User.findById(exam.authorId).select("name").lean() : null;
    const now = new Date();
    let myAttempts = 0;
    let inProgress = null;
    if (!staff) {
      myAttempts = await Submission.countDocuments({ examId: exam._id, studentId: req.user._id });
      const a = await ExamAttempt.findOne({ examId: exam._id, studentId: req.user._id, status: "in_progress" }).lean();
      if (a) inProgress = { startedAt: a.startedAt, deadlineAt: a.deadlineAt };
    }
    const limit = attemptLimit(exam);

    return res.json({
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      examCode: exam.examCode,
      subject: exam.subject || questions[0]?.subject || "",
      duration: exam.duration,
      examType: exam.examType,
      negativeMarkPerWrong: exam.negativeMarkPerWrong,
      allowRetake: exam.allowRetake,
      maxAttempts: Number.isFinite(limit) ? limit : null,
      startTime: exam.startTime,
      endTime: exam.endTime,
      solutionReleaseTime: exam.solutionReleaseTime,
      totalQuestions: questions.length,
      syllabus: Object.entries(syllabus).map(([chapter, count]) => ({ chapter, count })),
      authorName: author?.name || "",
      window: examWindow(exam, now),
      myAttempts,
      attemptsLeft: Number.isFinite(limit) ? Math.max(0, limit - myAttempts) : null,
      inProgress,
      serverNow: now,
    });
  } catch (err) {
    console.error("Get Exam Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load exam." });
  }
};

// ============================================================
// START / RESUME AN EXAM ATTEMPT (server-authoritative timer)
// ============================================================
export const startExam = async (req, res) => {
  try {
    const exam = await findExamByCode(req.params.code);
    if (!exam || exam.archivedAt) return res.status(404).json({ success: false, message: "Exam not found." });
    if (!(await canStudentAccessExam(req.user, exam))) {
      return res.status(403).json({ success: false, message: "This exam is not assigned to you." });
    }

    const now = new Date();
    let attempt = await ExamAttempt.findOne({ examId: exam._id, studentId: req.user._id, status: "in_progress" });

    if (!attempt) {
      const window = examWindow(exam, now);
      if (window === "upcoming") return res.status(403).json({ success: false, message: "This exam has not started yet." });
      if (window === "closed") return res.status(403).json({ success: false, message: "This exam is closed." });
      const used = await Submission.countDocuments({ examId: exam._id, studentId: req.user._id });
      if (used >= attemptLimit(exam)) {
        return res.status(409).json({ success: false, message: "You have already used all attempts for this exam." });
      }
      let deadline = new Date(now.getTime() + exam.duration * 60 * 1000);
      if (exam.endTime && new Date(exam.endTime) < deadline) deadline = new Date(exam.endTime);
      try {
        attempt = await ExamAttempt.create({
          examId: exam._id,
          examCode: exam.examCode,
          studentId: req.user._id,
          attemptNumber: used + 1,
          startedAt: now,
          deadlineAt: deadline,
          answers: {},
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
        attempt = await ExamAttempt.findOne({ examId: exam._id, studentId: req.user._id, status: "in_progress" });
        if (!attempt) return res.status(409).json({ success: false, message: "This attempt was already submitted." });
      }
    }

    const questions = await orderedQuestions(exam, STUDENT_QUESTION_FIELDS);
    return res.json({
      success: true,
      exam: {
        title: exam.title,
        examCode: exam.examCode,
        duration: exam.duration,
        negativeMarkPerWrong: exam.negativeMarkPerWrong,
        totalQuestions: questions.length,
      },
      attempt: {
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
        answers: attempt.answers || {},
        savedAt: attempt.savedAt,
      },
      questions,
      serverNow: new Date(),
    });
  } catch (err) {
    console.error("Start Exam Error:", err.message);
    return res.status(500).json({ success: false, message: "Could not start the exam." });
  }
};

function cleanAnswers(raw, questions) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  for (const [qid, ans] of Object.entries(raw)) {
    const q = byId.get(qid);
    if (!q || typeof ans !== "string" || !ans) continue;
    const allowed = new Set([...(q.options || []), ...(q.optionsBn || []), ...(q.optionsEn || [])]);
    if (allowed.has(ans)) out[qid] = ans;
  }
  return out;
}

// ============================================================
// AUTOSAVE ANSWERS
// ============================================================
export const saveAnswers = async (req, res) => {
  try {
    const exam = await findExamByCode(req.params.code);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });
    const attempt = await ExamAttempt.findOne({ examId: exam._id, studentId: req.user._id, status: "in_progress" });
    if (!attempt) return res.status(404).json({ success: false, message: "No running attempt. Start the exam first." });
    const now = new Date();
    if (now.getTime() > attempt.deadlineAt.getTime() + SUBMIT_GRACE_MS) {
      return res.status(410).json({ success: false, message: "Time is over. Please submit.", deadlineAt: attempt.deadlineAt });
    }
    const questions = await orderedQuestions(exam, "options optionsBn optionsEn");
    attempt.answers = cleanAnswers(req.body.answers, questions);
    attempt.markModified("answers");
    attempt.savedAt = now;
    await attempt.save();
    return res.json({ success: true, savedAt: now, saved: Object.keys(attempt.answers).length, deadlineAt: attempt.deadlineAt, serverNow: now });
  } catch (err) {
    console.error("Save Answers Error:", err.message);
    return res.status(500).json({ success: false, message: "Could not save answers." });
  }
};

function grade(questions, answers, negative) {
  let correctCount = 0;
  let wrongCount = 0;
  questions.forEach((q) => {
    const a = answers[String(q._id)];
    if (!a) return;
    const correctSet = new Set([q.correctAnswer]);
    // Bilingual questions: the same option position in the other language is also correct.
    const idx = (q.options || []).indexOf(q.correctAnswer);
    if (idx >= 0) {
      if (q.optionsBn?.[idx]) correctSet.add(q.optionsBn[idx]);
      if (q.optionsEn?.[idx]) correctSet.add(q.optionsEn[idx]);
    }
    if (correctSet.has(a)) correctCount += 1;
    else wrongCount += 1;
  });
  const raw = correctCount - wrongCount * (negative || 0);
  return {
    correctCount,
    wrongCount,
    unattemptedCount: questions.length - correctCount - wrongCount,
    score: Math.max(0, parseFloat(raw.toFixed(2))),
  };
}

// ============================================================
// SUBMIT EXAM (graded on the server)
// ============================================================
export const submitExam = async (req, res) => {
  try {
    const { examCode } = req.body;
    const idempotencyKey = req.headers["idempotency-key"] || req.body.idempotencyKey || null;
    if (!examCode) return res.status(400).json({ success: false, message: "Exam code is required." });
    if (isStaff(req.user)) return res.status(403).json({ success: false, message: "Teacher accounts cannot submit exams." });

    if (idempotencyKey) {
      const dup = await Submission.findOne({ idempotencyKey, studentId: req.user._id });
      if (dup) return res.json({ success: true, submissionId: dup._id, score: dup.score, attemptNumber: dup.attemptNumber, isDuplicateHandled: true });
    }

    const exam = await findExamByCode(examCode);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });
    if (!(await canStudentAccessExam(req.user, exam))) {
      return res.status(403).json({ success: false, message: "This exam is not assigned to you." });
    }

    const now = new Date();
    const attempt = await ExamAttempt.findOne({ examId: exam._id, studentId: req.user._id, status: "in_progress" });
    if (!attempt) {
      const already = await Submission.exists({ examId: exam._id, studentId: req.user._id });
      return res.status(already ? 409 : 400).json({
        success: false,
        message: already ? "You have already submitted this exam." : "Start the exam before submitting.",
      });
    }

    const questions = await orderedQuestions(exam);
    // Answers sent with the submit request are accepted only while time remains (plus a
    // short network grace). After that, the last autosaved answers are graded.
    const inTime = now.getTime() <= attempt.deadlineAt.getTime() + SUBMIT_GRACE_MS;
    const answers = inTime && req.body.answers ? cleanAnswers(req.body.answers, questions) : cleanAnswers(attempt.answers, questions);
    const result = grade(questions, answers, exam.negativeMarkPerWrong);

    // Claim the attempt atomically so two concurrent submits cannot both grade it.
    const claimed = await ExamAttempt.findOneAndUpdate(
      { _id: attempt._id, status: "in_progress" },
      { $set: { status: "submitted", submittedAt: now, answers } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ success: false, message: "You have already submitted this exam." });

    let submission;
    try {
      submission = await Submission.create({
        examCode: exam.examCode,
        examId: exam._id,
        organizationId: exam.organizationId || null,
        studentId: req.user._id,
        name: req.user.name,
        // The legacy unique index {examId, roll, attemptNumber} requires a unique value per
        // student; class roll numbers repeat across batches, so the account id is stored.
        roll: String(req.user._id),
        score: result.score,
        totalQuestions: questions.length,
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
        attemptNumber: attempt.attemptNumber,
        idempotencyKey: idempotencyKey || undefined,
        answers,
      });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ success: false, message: "You have already submitted this exam." });
      await ExamAttempt.updateOne({ _id: attempt._id }, { $set: { status: "in_progress", submittedAt: null } });
      throw e;
    }
    await ExamAttempt.updateOne({ _id: attempt._id }, { $set: { submissionId: submission._id } });

    let xpEarned = 0;
    if (attempt.attemptNumber === 1) {
      const isFirstExam = (await Submission.countDocuments({ studentId: req.user._id })) === 1;
      const { xp } = await awardXp(req.user._id, result.correctCount * XP_RULES.examPerCorrect, { achievements: isFirstExam ? ["first_exam"] : [] });
      xpEarned = xp;
    }

    const released = solutionsReleased(exam, now);
    return res.json({
      success: true,
      submissionId: submission._id,
      examTitle: exam.title,
      ...result,
      totalQuestions: questions.length,
      attemptNumber: attempt.attemptNumber,
      submittedAt: now,
      lateAutosaveUsed: !inTime,
      xpEarned,
      solutionsReleased: released,
      solutionReleaseTime: exam.solutionReleaseTime || exam.endTime || null,
    });
  } catch (error) {
    console.error("Submit Exam Error:", error.message);
    return res.status(500).json({ success: false, message: "Submission failed. Your answers are saved — please try again." });
  }
};

// ============================================================
// STUDENT RESULT FOR ONE EXAM (with review when released)
// ============================================================
export const getMyResult = async (req, res) => {
  try {
    const exam = await findExamByCode(req.params.code);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });
    const subs = await Submission.find({ examId: exam._id, studentId: req.user._id }).sort({ attemptNumber: -1 }).lean();
    if (!subs.length) return res.status(404).json({ success: false, message: "No submission found for this exam." });
    const latest = subs[0];
    const released = solutionsReleased(exam);

    const rankAgg = await Submission.aggregate([
      { $match: { examId: exam._id, attemptNumber: 1 } },
      { $group: { _id: null, total: { $sum: 1 }, higher: { $sum: { $cond: [{ $gt: ["$score", subs[subs.length - 1].score] }, 1, 0] } } } },
    ]);

    let review = null;
    if (released) {
      const questions = await orderedQuestions(exam);
      review = questions.map((q) => ({
        _id: q._id,
        question: q.question,
        questionBn: q.questionBn,
        questionEn: q.questionEn,
        options: q.options,
        optionsBn: q.optionsBn,
        optionsEn: q.optionsEn,
        image: q.image,
        chapter: q.chapter,
        topic: q.topic,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        explanationBn: q.explanationBn,
        explanationEn: q.explanationEn,
        yourAnswer: latest.answers?.[String(q._id)] || null,
      }));
    }

    return res.json({
      success: true,
      exam: { title: exam.title, examCode: exam.examCode, duration: exam.duration, negativeMarkPerWrong: exam.negativeMarkPerWrong, totalQuestions: exam.questions.length },
      attempts: subs.map((s) => ({
        attemptNumber: s.attemptNumber,
        score: s.score,
        correctCount: s.correctCount,
        wrongCount: s.wrongCount,
        totalQuestions: s.totalQuestions,
        submittedAt: s.createdAt,
      })),
      rank: rankAgg[0] ? { position: rankAgg[0].higher + 1, of: rankAgg[0].total } : null,
      solutionsReleased: released,
      solutionReleaseTime: exam.solutionReleaseTime || exam.endTime || null,
      review,
    });
  } catch (err) {
    console.error("Get My Result Error:", err.message);
    return res.status(500).json({ success: false, message: "Could not load your result." });
  }
};

// ============================================================
// GET EXAM DETAILS FOR TEACHER / ADMIN (includes answers)
// ============================================================
export const getExamAdmin = async (req, res) => {
  try {
    const exam = await findExamByCode(req.params.code);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });
    if (!canStaffManageExam(req.user, exam, req.tenant)) {
      return res.status(403).json({ success: false, message: "Forbidden: You are not authorized to access this exam's administrative details." });
    }
    const questions = await orderedQuestions(exam);
    return res.json({ ...exam.toObject(), questions });
  } catch (err) {
    console.error("Get Exam Admin Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load exam." });
  }
};

// ============================================================
// LEADERBOARD FOR ONE EXAM (first attempts only)
// ============================================================
export const getRanking = async (req, res) => {
  try {
    const exam = await findExamByCode(req.params.code);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });
    const staff = isStaff(req.user);
    if (staff ? !canStaffManageExam(req.user, exam, req.tenant) && !isSuperAdmin(req.user) : !(await canStudentAccessExam(req.user, exam))) {
      return res.status(403).json({ success: false, message: "You do not have access to this exam's ranking." });
    }
    const data = await Submission.find({ examId: exam._id, attemptNumber: 1 })
      .select(staff ? "name roll score totalQuestions createdAt studentId" : "name score totalQuestions createdAt studentId")
      .sort({ score: -1, createdAt: 1 })
      .limit(500)
      .lean();
    let rollMap = new Map();
    if (staff) {
      const users = await User.find({ _id: { $in: data.map((d) => d.studentId).filter(Boolean) } }).select("rollNumber phone").lean();
      rollMap = new Map(users.map((u) => [String(u._id), u.rollNumber || u.phone || ""]));
    }
    return res.json(
      data.map((d) => ({
        ...d,
        roll: staff ? rollMap.get(String(d.studentId)) || (mongoose.Types.ObjectId.isValid(d.roll) ? "" : d.roll) : undefined,
        isMe: String(d.studentId) === String(req.user._id),
        studentId: staff ? d.studentId : undefined,
      }))
    );
  } catch (error) {
    console.error("Ranking Error:", error.message);
    return res.status(500).json({ success: false, message: "Ranking retrieval failed." });
  }
};

// ============================================================
// STATS (staff only, scoped to the caller's own exams)
// ============================================================
export const getStats = async (req, res) => {
  try {
    const examFilter = isSuperAdmin(req.user) ? {} : { authorId: req.user._id };
    const examIds = await Exam.find(examFilter).distinct("_id");
    const [examCount, submissionCount, questionCount] = await Promise.all([
      Exam.countDocuments({ ...examFilter, archivedAt: null }),
      Submission.countDocuments({ examId: { $in: examIds } }),
      Question.countDocuments({}),
    ]);
    return res.json({ examCount, submissionCount, questionCount });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Stats retrieval failed." });
  }
};

// ============================================================
// LIST EXAMS FOR TEACHER / ADMIN
// ============================================================
export const getAllExams = async (req, res) => {
  try {
    const filter = { archivedAt: null };
    if (isSuperAdmin(req.user)) {
      if (req.tenant?.orgId) filter.organizationId = req.tenant.orgId;
    } else if (req.tenant?.orgId && req.tenant.role === "org_admin") {
      filter.$or = [{ authorId: req.user._id }, { organizationId: req.tenant.orgId }];
    } else if (isStaff(req.user)) {
      filter.authorId = req.user._id;
    } else {
      return res.status(403).json({ success: false, message: "Forbidden: Instructor access required." });
    }

    const exams = await Exam.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $lookup: { from: "submissions", localField: "_id", foreignField: "examId", as: "subs", pipeline: [{ $project: { _id: 1 } }] } },
      { $addFields: { submissionCount: { $size: "$subs" } } },
      { $project: { subs: 0 } },
    ]);
    return res.json(exams);
  } catch (error) {
    console.error("Get All Exams Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve exams." });
  }
};

// ============================================================
// ARCHIVE EXAM (soft delete — results are kept)
// ============================================================
export const deleteExam = async (req, res) => {
  try {
    const raw = req.params.examCode;
    const exam = await Exam.findOne({
      $or: [{ examCode: String(raw).toUpperCase() }, ...(mongoose.Types.ObjectId.isValid(raw) ? [{ _id: raw }] : [])],
    });
    if (!exam || exam.archivedAt) return res.status(404).json({ success: false, message: "Exam not found." });
    if (!canStaffManageExam(req.user, exam, req.tenant)) {
      return res.status(403).json({ success: false, message: "You are not authorized to delete this exam." });
    }
    exam.archivedAt = new Date();
    exam.isPublished = false;
    await exam.save();
    return res.json({ success: true, message: "Exam removed. Student results were kept." });
  } catch (error) {
    console.error("Delete Exam Error:", error.message);
    return res.status(500).json({ success: false, message: "Delete failed." });
  }
};

// ============================================================
// STUDENT: EXAMS ASSIGNED TO ME (upcoming / active / completed)
// ============================================================
export const getStudentAvailableExams = async (req, res) => {
  try {
    const filter = isStaff(req.user)
      ? { isPublished: { $ne: false }, archivedAt: null, $or: [{ authorId: req.user._id }, { "assignment.mode": "all" }, { "assignment.mode": { $exists: false } }, { assignment: null }] }
      : await studentExamFilter(req.user);
    const exams = await Exam.find(filter)
      .select("title description examCode duration examType allowRetake maxAttempts negativeMarkPerWrong startTime endTime createdAt questions subject authorId")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const examIds = exams.map((e) => e._id);
    const [subs, running] = await Promise.all([
      Submission.find({ studentId: req.user._id, examId: { $in: examIds } }).select("examId score totalQuestions attemptNumber createdAt").lean(),
      ExamAttempt.find({ studentId: req.user._id, examId: { $in: examIds }, status: "in_progress" }).select("examId deadlineAt").lean(),
    ]);
    const subMap = new Map();
    subs.forEach((s) => {
      const k = String(s.examId);
      if (!subMap.has(k)) subMap.set(k, []);
      subMap.get(k).push(s);
    });
    const runMap = new Map(running.map((r) => [String(r.examId), r]));
    const authorIds = [...new Set(exams.map((e) => String(e.authorId)).filter((x) => x && x !== "null"))];
    const authors = await User.find({ _id: { $in: authorIds } }).select("name").lean();
    const authorMap = new Map(authors.map((a) => [String(a._id), a.name]));
    const now = new Date();

    return res.json(
      exams.map((e) => {
        const mine = subMap.get(String(e._id)) || [];
        const limit = attemptLimit(e);
        const window = examWindow(e, now);
        const best = mine.reduce((m, s) => (m === null || s.score > m.score ? s : m), null);
        let status = window;
        if (runMap.has(String(e._id))) status = "in_progress";
        else if (mine.length && (mine.length >= limit || window === "closed")) status = "completed";
        else if (!mine.length && window === "closed") status = "missed";
        return {
          _id: e._id,
          title: e.title,
          description: e.description,
          examCode: e.examCode,
          subject: e.subject || "",
          duration: e.duration,
          examType: e.examType,
          allowRetake: e.allowRetake,
          maxAttempts: Number.isFinite(limit) ? limit : null,
          negativeMarkPerWrong: e.negativeMarkPerWrong,
          startTime: e.startTime,
          endTime: e.endTime,
          totalQuestions: e.questions ? e.questions.length : 0,
          createdAt: e.createdAt,
          authorName: authorMap.get(String(e.authorId)) || "",
          status,
          myAttempts: mine.length,
          bestScore: best ? best.score : null,
          lastSubmittedAt: mine.length ? mine.map((s) => s.createdAt).sort().pop() : null,
          deadlineAt: runMap.get(String(e._id))?.deadlineAt || null,
        };
      })
    );
  } catch (error) {
    console.error("Get Student Available Exams Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve available exams." });
  }
};

// ============================================================
// STUDENT WEAK TOPICS
// ============================================================
export const getStudentWeakTopics = async (req, res) => {
  try {
    const submissions = await Submission.find({ studentId: req.user._id }).sort({ createdAt: -1 }).limit(15).lean();
    if (!submissions.length) return res.json({ success: true, weakTopics: [], totalMistakes: 0, message: "No exam submissions found yet." });

    const qIds = [...new Set(submissions.flatMap((s) => Object.keys(s.answers || {})))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    const questions = await Question.find({ _id: { $in: qIds } }).select("subject chapter topic correctAnswer").lean();
    const qMap = new Map(questions.map((q) => [String(q._id), q]));
    const topicStats = {};
    submissions.forEach((sub) => {
      for (const [qId, ans] of Object.entries(sub.answers || {})) {
        const q = qMap.get(qId);
        if (!q) continue;
        const key = q.topic || q.chapter || "General";
        topicStats[key] ||= { topic: key, chapter: q.chapter || "", subject: q.subject || "", totalAttempted: 0, wrongCount: 0, correctCount: 0 };
        topicStats[key].totalAttempted += 1;
        if (ans === q.correctAnswer) topicStats[key].correctCount += 1;
        else topicStats[key].wrongCount += 1;
      }
    });
    const weakTopics = Object.values(topicStats)
      .map((t) => ({ ...t, accuracy: t.totalAttempted ? Math.round((t.correctCount / t.totalAttempted) * 100) : 0 }))
      .filter((t) => t.wrongCount > 0 || t.accuracy < 70)
      .sort((a, b) => b.wrongCount - a.wrongCount);
    return res.json({ success: true, weakTopics, totalMistakes: weakTopics.reduce((a, t) => a + t.wrongCount, 0) });
  } catch (error) {
    console.error("Get Weak Topics Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to analyze weak topics." });
  }
};

// ============================================================
// STUDENT SUBMISSION HISTORY
// ============================================================
export const getStudentHistory = async (req, res) => {
  try {
    const submissions = await Submission.find({ studentId: req.user._id })
      .select("-answers -idempotencyKey")
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("examId", "title examCode duration examType negativeMarkPerWrong");
    return res.json(submissions);
  } catch (error) {
    console.error("Get Student History Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve history." });
  }
};
