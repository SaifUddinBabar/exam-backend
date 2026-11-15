// Student dashboard summary: one request, only data the student is authorised to see.
import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import ExamAttempt from "../models/ExamAttempt.js";
import Notice from "../models/Notice.js";
import NoticeRead from "../models/NoticeRead.js";
import BatchMembership from "../models/BatchMembership.js";
import PracticeSession from "../models/PracticeSession.js";
import Battle from "../models/Battle.js";
import PlayerStats from "../models/PlayerStats.js";
import User from "../models/User.js";
import { studentExamFilter, studentNoticeFilter } from "../utils/access.js";
import { publicStats, getStats } from "../services/gamification.js";
import { examWindow } from "./examController.js";

export const dashboard = async (req, res) => {
  try {
    const uid = req.user._id;
    const now = new Date();
    const [examFilter, noticeFilter] = await Promise.all([studentExamFilter(req.user), studentNoticeFilter(req.user, now)]);

    const [memberships, exams, notices, stats, subs, practice, battles] = await Promise.all([
      BatchMembership.find({ studentId: uid, status: "active" }).populate("batchId", "name classLevel academicYear subject status ownerId").lean(),
      Exam.find(examFilter).select("title examCode duration startTime endTime examType questions subject allowRetake maxAttempts createdAt").sort({ createdAt: -1 }).limit(100).lean(),
      Notice.find(noticeFilter).sort({ publishAt: -1 }).limit(5).populate("authorId", "name").lean(),
      getStats(uid),
      Submission.find({ studentId: uid }).select("examId examCode score totalQuestions correctCount createdAt").sort({ createdAt: -1 }).limit(50).populate("examId", "title").lean(),
      PracticeSession.find({ studentId: uid, isCompleted: true }).select("title score totalQuestions correctCount createdAt").sort({ createdAt: -1 }).limit(10).lean(),
      Battle.find({ "players.userId": uid, status: "finished" }).select("players winnerId isDraw finishedAt filters").sort({ finishedAt: -1 }).limit(10).lean(),
    ]);

    const subsByExam = new Map();
    subs.forEach((s) => subsByExam.set(String(s.examId?._id || s.examId), (subsByExam.get(String(s.examId?._id || s.examId)) || 0) + 1));
    const running = new Set((await ExamAttempt.find({ studentId: uid, status: "in_progress" }).distinct("examId")).map(String));

    const examCards = exams
      .map((e) => {
        const w = examWindow(e, now);
        const done = subsByExam.get(String(e._id)) || 0;
        const limit = e.examType === "scheduled" || e.allowRetake === false ? 1 : e.maxAttempts || 1;
        let status = w;
        if (running.has(String(e._id))) status = "in_progress";
        else if (done >= limit || (done && w === "closed")) status = "completed";
        else if (w === "closed") status = "missed";
        return { examCode: e.examCode, title: e.title, subject: e.subject, duration: e.duration, startTime: e.startTime, endTime: e.endTime, totalQuestions: e.questions?.length || 0, status, createdAt: e.createdAt };
      })
      .filter((e) => ["in_progress", "active", "upcoming"].includes(e.status))
      .sort((a, b) => {
        // Priority 1: in_progress attempt first so student can resume
        if (a.status === "in_progress" && b.status !== "in_progress") return -1;
        if (b.status === "in_progress" && a.status !== "in_progress") return 1;
        // Priority 2: newest created exams first so newly published teacher exams are at the top!
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, 12);

    const reads = await NoticeRead.find({ userId: uid, noticeId: { $in: notices.map((n) => n._id) } }).distinct("noticeId");
    const readSet = new Set(reads.map(String));
    const unreadTotal = (await Notice.countDocuments(noticeFilter)) - (await NoticeRead.countDocuments({ userId: uid, noticeId: { $in: await Notice.find(noticeFilter).distinct("_id") } }));

    const ownerIds = memberships.map((m) => m.batchId?.ownerId).filter(Boolean);
    const owners = await User.find({ _id: { $in: ownerIds } }).select("name").lean();
    const oMap = new Map(owners.map((o) => [String(o._id), o.name]));

    const activity = [
      ...subs.slice(0, 10).map((s) => ({ type: "exam", title: s.examId?.title || s.examCode, detail: `${s.score}/${s.totalQuestions}`, at: s.createdAt, link: `/exams/${s.examCode}/result` })),
      ...practice.map((p) => ({ type: "practice", title: p.title, detail: `${p.correctCount}/${p.totalQuestions}`, at: p.createdAt, link: "/practice" })),
      ...battles.map((b) => {
        const me = b.players.find((p) => String(p.userId) === String(uid));
        const opp = b.players.find((p) => String(p.userId) !== String(uid));
        const result = b.isDraw ? "Draw" : String(b.winnerId) === String(uid) ? "Won" : "Lost";
        return { type: "battle", title: `${result} vs ${opp?.name || "opponent"}`, detail: `${me?.score ?? 0} – ${opp?.score ?? 0}`, at: b.finishedAt, link: `/battle/${b._id}` };
      }),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8);

    const examPcts = subs.filter((s) => s.totalQuestions).map((s) => Math.round((s.score / s.totalQuestions) * 100));
    const ahead = stats.battles > 0 ? await PlayerStats.countDocuments({ battles: { $gt: 0 }, rating: { $gt: stats.rating } }) : null;

    return res.json({
      success: true,
      user: { name: req.user.name },
      batches: memberships
        .filter((m) => m.batchId && m.batchId.status !== "archived")
        .map((m) => ({ _id: m.batchId._id, name: m.batchId.name, classLevel: m.batchId.classLevel, academicYear: m.batchId.academicYear, subject: m.batchId.subject, teacherName: oMap.get(String(m.batchId.ownerId)) || "" })),
      exams: examCards,
      notices: notices.map((n) => ({ _id: n._id, title: n.title, body: n.body?.slice(0, 280), priority: n.priority, publishAt: n.publishAt, authorName: n.authorId?.name || "", read: readSet.has(String(n._id)) })),
      unreadNotices: Math.max(0, unreadTotal),
      stats: publicStats(stats),
      globalRank: ahead === null ? null : ahead + 1,
      activity,
      progress: {
        examsTaken: subs.length,
        averagePct: examPcts.length ? Math.round(examPcts.reduce((a, b) => a + b, 0) / examPcts.length) : null,
        bestPct: examPcts.length ? Math.max(...examPcts) : null,
        practiceSessions: practice.length,
        battles: stats.battles,
        recentPcts: examPcts.slice(0, 10).reverse(),
      },
    });
  } catch (e) {
    console.error("student dashboard:", e.message);
    return res.status(500).json({ success: false, message: "Could not load your dashboard." });
  }
};
