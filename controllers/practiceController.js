import Question from "../models/Question.js";
import Bookmark from "../models/Bookmark.js";
import PracticeSession from "../models/PracticeSession.js";
import Submission from "../models/Submission.js";
import { languageFilter } from "../utils/questionLanguage.js";

// Helper for tenant context filter
const getTenantFilter = (req) => {
  if (req.tenant?.orgId) {
    return {
      hidden: { $ne: true },
      $or: [
        { organizationId: req.tenant.orgId },
        { isPublic: true },
        { organizationId: null },
      ],
    };
  }
  return {
    hidden: { $ne: true },
    $or: [{ isPublic: true }, { organizationId: null }],
  };
};

// Chapter, topic and language filters use the stored fields exactly, so the
// counts shown in selectors always equal the number of questions a filter returns.
// (The earlier keyword-regex topic matching counted one question under several
// topics; uncategorised questions are tracked by the Phase 2 data-quality audit.)
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const addAnd = (filter, clause) => {
  if (!clause) return filter;
  filter.$and = filter.$and || [];
  filter.$and.push(clause);
  return filter;
};

export const getChapterQueryRegex = (chapter) => {
  if (!chapter || chapter === "All") return null;
  return chapter;
};

export const applyVersionFilter = (filter, version, chapter) => {
  if (chapter && chapter !== "All") filter.chapter = chapter;
  addAnd(filter, languageFilter(version));
};

const listOf = (v) => (Array.isArray(v) ? v : String(v).split("||")).map((t) => String(t).trim()).filter(Boolean);

/** Exact topic match. "__none__" selects questions with no topic. */
export const applyTopicFilter = (filter, topic) => {
  if (!topic || topic === "All") return;
  const topics = listOf(topic);
  if (!topics.length) return;
  if (topics.includes("__none__")) {
    const rest = topics.filter((t) => t !== "__none__");
    addAnd(filter, { $or: [{ topic: { $in: ["", null, ...rest] } }, { topic: { $exists: false } }] });
  } else {
    filter.topic = topics.length === 1 ? topics[0] : { $in: topics };
  }
};

export const applySearch = (filter, search) => {
  const q = String(search || "").trim().slice(0, 100);
  if (!q) return;
  const rx = new RegExp(escapeRx(q), "i");
  addAnd(filter, { $or: [{ question: rx }, { questionBn: rx }, { questionEn: rx }, { options: rx }] });
};

// ============================================================================
// 1. GET FILTER METADATA (Subjects, Chapters, Dependent Topics, Boards, Classes)
// ============================================================================
export const getFilterMetadata = async (req, res) => {
  try {
    const { version } = req.query;
    const tenantFilter = getTenantFilter(req);
    const matchFilter = { ...tenantFilter };

    addAnd(matchFilter, languageFilter(version));

    // Aggregate distinct combinations of Subject, Chapter, Topic
    const metadata = await Question.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            subject: "$subject",
            chapter: "$chapter",
          },
          topics: { $addToSet: "$topic" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.subject",
          chapters: {
            $push: {
              chapter: "$_id.chapter",
              topics: "$topics",
              questionCount: "$count",
            },
          },
          totalQuestions: { $sum: "$count" },
        },
      },
    ]);

    // Distinct boards and classes
    const [boards, boardYears, classes] = await Promise.all([
      Question.distinct("boardName", { ...matchFilter, boardName: { $ne: "" } }),
      Question.distinct("boardYear", { ...matchFilter, boardYear: { $ne: "" } }),
      Question.distinct("className", { ...matchFilter, className: { $ne: "" } }),
    ]);

    // Format structure: { subjects: [{ name, total, chapters: [{ name, count, topics }] }], boards, boardYears, classes }
    const formattedSubjects = metadata.map((s) => ({
      name: s._id || "ICT",
      totalQuestions: s.totalQuestions,
      chapters: s.chapters.map((c) => ({
        name: c.chapter,
        questionCount: c.questionCount,
        topics: c.topics.filter(Boolean).sort(),
      })),
    }));

    return res.json({
      success: true,
      subjects: formattedSubjects,
      boards: boards.filter(Boolean).sort(),
      boardYears: boardYears.filter(Boolean).sort().reverse(),
      classes: classes.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("getFilterMetadata error:", error);
    return res.status(500).json({ success: false, message: "Failed to load metadata" });
  }
};

// ============================================================================
// 2. GET QUESTION BANK (Paginated with Search & Filters)
// ============================================================================
export const getQuestionBank = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      search = "",
      subject,
      chapter,
      topic,
      difficulty,
      boardName,
      boardYear,
      className,
      version,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { ...getTenantFilter(req) };

    if (subject && subject !== "All") filter.subject = subject;
    applyVersionFilter(filter, version, chapter);
    applyTopicFilter(filter, topic);
    if (difficulty && difficulty !== "All") filter.difficulty = difficulty.toLowerCase();
    if (boardName && boardName !== "All") {
      filter.questionType = "board";
      filter.boardName = boardName;
    }
    if (boardYear && boardYear !== "All") {
      filter.questionType = "board";
      filter.boardYear = boardYear;
    }
    if (className && className !== "All") filter.className = className;

    applySearch(filter, search);

    const [total, questions] = await Promise.all([
      Question.countDocuments(filter),
      Question.find(filter)
        .select("-__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    // Check bookmarks for authenticated student
    let bookmarkedIds = new Set();
    if (req.user?._id) {
      const bookmarks = await Bookmark.find({
        studentId: req.user._id,
        questionId: { $in: questions.map((q) => q._id) },
      }).select("questionId");
      bookmarkedIds = new Set(bookmarks.map((b) => b.questionId.toString()));
    }

    const questionsWithBookmarkStatus = questions.map((q) => ({
      ...q,
      isBookmarked: bookmarkedIds.has(q._id.toString()),
    }));

    return res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: questionsWithBookmarkStatus.length,
      questions: questionsWithBookmarkStatus,
    });
  } catch (error) {
    console.error("getQuestionBank error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch question bank" });
  }
};

// ============================================================================
// 3. GET AVAILABLE COUNT (Pre-check for Practice Test creation)
// ============================================================================
export const getAvailableCount = async (req, res) => {
  try {
    const { subject, chapter, topic, difficulty, version } = req.query;
    const filter = { ...getTenantFilter(req) };

    if (subject && subject !== "All") filter.subject = subject;
    applyVersionFilter(filter, version, chapter);
    applyTopicFilter(filter, topic);
    if (difficulty && difficulty !== "mixed" && difficulty !== "All") {
      filter.difficulty = difficulty.toLowerCase();
    }

    const count = await Question.countDocuments(filter);
    return res.json({ success: true, count });
  } catch (error) {
    console.error("getAvailableCount error:", error);
    return res.status(500).json({ success: false, message: "Failed to get question count" });
  }
};

// ============================================================================
// 3.1 GET TOPIC COUNTS & DIFFICULTY BREAKDOWN FOR A CHAPTER
// ============================================================================
export const getTopicCounts = async (req, res) => {
  try {
    const { chapter, subject, version, difficulty } = req.query;
    const filter = { ...getTenantFilter(req) };
    if (subject && subject !== "All") filter.subject = subject;
    applyVersionFilter(filter, version, chapter);
    if (difficulty && !["All", "mixed"].includes(difficulty)) filter.difficulty = String(difficulty).toLowerCase();

    // One aggregation: per-topic counts plus difficulty totals for the same filter.
    const [byTopic, byDifficulty] = await Promise.all([
      Question.aggregate([{ $match: filter }, { $group: { _id: { $ifNull: ["$topic", ""] }, n: { $sum: 1 } } }]),
      Question.aggregate([{ $match: filter }, { $group: { _id: "$difficulty", n: { $sum: 1 } } }]),
    ]);

    const topicCounts = {};
    let noTopic = 0;
    byTopic.forEach((t) => {
      if (t._id && String(t._id).trim()) topicCounts[t._id] = t.n;
      else noTopic += t.n;
    });
    const d = Object.fromEntries(byDifficulty.map((x) => [x._id || "unclassified", x.n]));
    const total = byDifficulty.reduce((a, x) => a + x.n, 0);

    return res.json({
      success: true,
      chapter: chapter || null,
      topicCounts,
      noTopicCount: noTopic,
      stats: {
        total,
        easy: d.easy || 0,
        medium: d.medium || 0,
        hard: d.hard || 0,
        unclassified: (d.unclassified || 0) + Math.max(0, total - ((d.easy || 0) + (d.medium || 0) + (d.hard || 0) + (d.unclassified || 0))),
      },
    });
  } catch (error) {
    console.error("getTopicCounts error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to get topic counts" });
  }
};

// ============================================================================
// 4. CREATE / GENERATE PRACTICE TEST
// ============================================================================
export const generatePracticeTest = async (req, res) => {
  try {
    const {
      subject = "ICT",
      chapter = "All",
      topic = "All",
      questionCount = 20,
      difficulty = "mixed",
      mode = "practice", // 'practice' (immediate feedback) or 'test' (delayed grading)
      durationMinutes = 0,
      title,
      version = "bangla",
    } = req.body;

    const tenantFilter = getTenantFilter(req);
    const filter = { ...tenantFilter };

    if (subject && subject !== "All") filter.subject = subject;
    applyVersionFilter(filter, version, chapter);
    applyTopicFilter(filter, topic);

    const requestedCount = Math.max(5, Math.min(100, parseInt(questionCount) || 20));

    let selectedQuestions = [];

    if (difficulty === "mixed" || !difficulty) {
      // Pick balanced: 40% Easy, 40% Medium, 20% Hard
      const easyTarget = Math.round(requestedCount * 0.4);
      const medTarget = Math.round(requestedCount * 0.4);
      const hardTarget = requestedCount - easyTarget - medTarget;

      const [easy, med, hard] = await Promise.all([
        Question.aggregate([
          { $match: { ...filter, difficulty: "easy" } },
          { $sample: { size: easyTarget } },
        ]),
        Question.aggregate([
          { $match: { ...filter, difficulty: "medium" } },
          { $sample: { size: medTarget } },
        ]),
        Question.aggregate([
          { $match: { ...filter, difficulty: "hard" } },
          { $sample: { size: hardTarget } },
        ]),
      ]);

      selectedQuestions = [...easy, ...med, ...hard];

      // If we don't have enough balanced questions, fill remaining from any difficulty
      if (selectedQuestions.length < requestedCount) {
        const existingIds = selectedQuestions.map((q) => q._id);
        const fill = await Question.aggregate([
          { $match: { ...filter, _id: { $nin: existingIds } } },
          { $sample: { size: requestedCount - selectedQuestions.length } },
        ]);
        selectedQuestions.push(...fill);
      }
    } else {
      filter.difficulty = difficulty.toLowerCase();
      selectedQuestions = await Question.aggregate([
        { $match: filter },
        { $sample: { size: requestedCount } },
      ]);
    }

    if (!selectedQuestions || selectedQuestions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No questions found matching your selected criteria.",
      });
    }

    // Shuffle questions
    selectedQuestions.sort(() => Math.random() - 0.5);

    // Create session record if student is authenticated
    let session = null;
    if (req.user?._id) {
      session = await PracticeSession.create({
        studentId: req.user._id,
        title: title || `${subject} - ${chapter === "All" ? (version === "english" ? "English Medium All Chapters" : "বাংলা মাধ্যম সর্বমোট অধ্যায়") : chapter} Practice`,
        mode,
        subject,
        chapter,
        topic,
        difficulty,
        version: version || "bangla",
        durationMinutes: parseInt(durationMinutes) || 0,
        totalQuestions: selectedQuestions.length,
        questions: selectedQuestions.map((q) => ({
          questionId: q._id,
          correctAnswer: q.correctAnswer,
        })),
      });
    }

    // In 'test' mode, redact correct answers and explanations until submission!
    // In 'practice' mode, keep them available for immediate feedback on option select!
    const clientQuestions = selectedQuestions.map((q) => {
      const item = {
        _id: q._id,
        question: q.question,
        options: q.options,
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic,
        difficulty: q.difficulty,
        image: q.image || "",
      };
      if (mode === "practice") {
        item.correctAnswer = q.correctAnswer;
        item.explanation = q.explanation || "";
      }
      return item;
    });

    return res.status(201).json({
      success: true,
      sessionId: session?._id || `guest_${Date.now()}`,
      title: session?.title || `${subject} Practice Set`,
      mode,
      durationMinutes: parseInt(durationMinutes) || 0,
      totalQuestions: clientQuestions.length,
      questions: clientQuestions,
    });
  } catch (error) {
    console.error("generatePracticeTest error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate practice test" });
  }
};

// ============================================================================
// 5. SUBMIT PRACTICE TEST
// ============================================================================
export const submitPracticeTest = async (req, res) => {
  try {
    const { sessionId, answers = {}, timeSpentSeconds = 0 } = req.body;

    let session = null;
    if (sessionId && !sessionId.startsWith("guest_") && req.user?._id) {
      session = await PracticeSession.findOne({
        _id: sessionId,
        studentId: req.user._id,
      });
    }

    // Extract all question IDs from answers or session
    let questionIds = [];
    if (session && session.questions.length > 0) {
      questionIds = session.questions.map((q) => q.questionId);
    } else {
      questionIds = Object.keys(answers);
    }

    const realQuestions = await Question.find({ _id: { $in: questionIds } }).lean();
    const questionMap = new Map(realQuestions.map((q) => [q._id.toString(), q]));

    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    const evaluatedQuestions = [];
    const sessionQuestions = [];

    for (const q of realQuestions) {
      const qId = q._id.toString();
      const studentAnswer = answers[qId] !== undefined ? answers[qId] : "";
      const isAttempted = Boolean(studentAnswer && studentAnswer.trim());
      const isCorrect = isAttempted && studentAnswer === q.correctAnswer;

      if (!isAttempted) {
        unattemptedCount++;
      } else if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }

      evaluatedQuestions.push({
        _id: q._id,
        question: q.question,
        options: q.options,
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic,
        difficulty: q.difficulty,
        image: q.image || "",
        studentAnswer,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || "",
        isCorrect,
      });

      sessionQuestions.push({
        questionId: q._id,
        studentAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
      });
    }

    const score = correctCount; // Standard 1 mark per correct practice question

    if (session) {
      session.questions = sessionQuestions;
      session.score = score;
      session.correctCount = correctCount;
      session.wrongCount = wrongCount;
      session.unattemptedCount = unattemptedCount;
      session.timeSpentSeconds = parseInt(timeSpentSeconds) || 0;
      session.isCompleted = true;
      await session.save();
    }

    return res.json({
      success: true,
      score,
      totalQuestions: evaluatedQuestions.length,
      correctCount,
      wrongCount,
      unattemptedCount,
      accuracy: evaluatedQuestions.length > 0 ? Math.round((correctCount / (correctCount + wrongCount || 1)) * 100) : 0,
      timeSpentSeconds: parseInt(timeSpentSeconds) || 0,
      questions: evaluatedQuestions,
    });
  } catch (error) {
    console.error("submitPracticeTest error:", error);
    return res.status(500).json({ success: false, message: "Failed to submit practice test" });
  }
};

// ============================================================================
// 6. PRACTICE MISTAKES (Wrong Questions Drill)
// ============================================================================
export const getPracticeMistakes = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    // 1. Gather wrong question IDs from PracticeSessions
    const wrongPracticeSessions = await PracticeSession.find({
      studentId,
      "questions.isCorrect": false,
    }).select("questions");

    const wrongQuestionIds = new Set();
    wrongPracticeSessions.forEach((sess) => {
      sess.questions.forEach((q) => {
        if (q.studentAnswer && !q.isCorrect) {
          wrongQuestionIds.add(q.questionId.toString());
        }
      });
    });

    // 2. Also inspect regular Exam Submissions to find missed questions
    const submissions = await Submission.find({ studentId }).select("answers").lean();
    for (const sub of submissions) {
      if (sub.answers && typeof sub.answers === "object") {
        const attemptedIds = Object.keys(sub.answers);
        if (attemptedIds.length > 0) {
          const relatedQuestions = await Question.find({ _id: { $in: attemptedIds } }).select("_id correctAnswer").lean();
          relatedQuestions.forEach((rq) => {
            const studentAns = sub.answers[rq._id.toString()];
            if (studentAns && studentAns !== rq.correctAnswer) {
              wrongQuestionIds.add(rq._id.toString());
            }
          });
        }
      }
    }

    const wrongList = Array.from(wrongQuestionIds);

    const { version } = req.query;
    const mistakeFilter = {
      _id: { $in: wrongList },
      ...getTenantFilter(req),
    };
    addAnd(mistakeFilter, languageFilter(version));

    const questions = await Question.find(mistakeFilter).lean();

    return res.json({
      success: true,
      totalMistakes: questions.length,
      questions,
    });
  } catch (error) {
    console.error("getPracticeMistakes error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch mistakes" });
  }
};

// ============================================================================
// 7. BOOKMARKS (Saved Questions)
// ============================================================================
export const getBookmarks = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { version } = req.query;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const questionMatch = { ...getTenantFilter(req) };
    addAnd(questionMatch, languageFilter(version));

    const bookmarks = await Bookmark.find({ studentId })
      .populate({
        path: "questionId",
        match: questionMatch,
      })
      .sort({ createdAt: -1 })
      .lean();

    const validBookmarks = bookmarks
      .filter((b) => b.questionId)
      .map((b) => ({
        bookmarkId: b._id,
        savedAt: b.createdAt,
        question: b.questionId,
      }));

    return res.json({
      success: true,
      total: validBookmarks.length,
      bookmarks: validBookmarks,
    });
  } catch (error) {
    console.error("getBookmarks error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch bookmarks" });
  }
};

export const toggleBookmark = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { questionId } = req.params;

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const existing = await Bookmark.findOne({ studentId, questionId });
    if (existing) {
      await Bookmark.deleteOne({ _id: existing._id });
      return res.json({ success: true, isBookmarked: false, message: "Question removed from bookmarks" });
    }

    await Bookmark.create({ studentId, questionId });
    return res.json({ success: true, isBookmarked: true, message: "Question saved to bookmarks" });
  } catch (error) {
    console.error("toggleBookmark error:", error);
    return res.status(500).json({ success: false, message: "Failed to toggle bookmark" });
  }
};

// ============================================================================
// 8. PRACTICE HISTORY & ANALYTICS
// ============================================================================
export const getPracticeHistory = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const sessions = await PracticeSession.find({ studentId, isCompleted: true })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return res.json({
      success: true,
      count: sessions.length,
      sessions,
    });
  } catch (error) {
    console.error("getPracticeHistory error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch practice history" });
  }
};

export const getPracticeAnalytics = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const sessions = await PracticeSession.find({ studentId, isCompleted: true }).lean();

    let totalPracticeQuestions = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalTimeSpent = 0;

    const chapterStats = {};

    sessions.forEach((sess) => {
      totalPracticeQuestions += sess.totalQuestions || 0;
      totalCorrect += sess.correctCount || 0;
      totalWrong += sess.wrongCount || 0;
      totalTimeSpent += sess.timeSpentSeconds || 0;

      const ch = sess.chapter || "Mixed";
      if (!chapterStats[ch]) {
        chapterStats[ch] = { chapter: ch, total: 0, correct: 0 };
      }
      chapterStats[ch].total += sess.totalQuestions || 0;
      chapterStats[ch].correct += sess.correctCount || 0;
    });

    const chapterPerformance = Object.values(chapterStats).map((cs) => ({
      ...cs,
      accuracy: cs.total > 0 ? Math.round((cs.correct / cs.total) * 100) : 0,
    }));

    return res.json({
      success: true,
      totalSessions: sessions.length,
      totalPracticeQuestions,
      totalCorrect,
      totalWrong,
      overallAccuracy: (totalCorrect + totalWrong) > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0,
      totalTimeSpentMinutes: Math.round(totalTimeSpent / 60),
      chapterPerformance,
    });
  } catch (error) {
    console.error("getPracticeAnalytics error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch practice analytics" });
  }
};
