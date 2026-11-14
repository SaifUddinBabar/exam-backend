import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import Question from "../models/Question.js";

const generateCode = () => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

// ============================================================
// CREATE EXAM (Protected - Tutor / Admin / Org)
// ============================================================
export const createExam = async (req, res) => {
  try {
    const { title, description, questions, duration, negativeMarkPerWrong } = req.body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Title and at least one Question are required.",
      });
    }

    const organizationId = req.tenant?.orgId || null;
    const authorId = req.user?._id || null;

    let examCode = generateCode();
    let collisionCheck = await Exam.findOne({ examCode });
    while (collisionCheck) {
      examCode = generateCode();
      collisionCheck = await Exam.findOne({ examCode });
    }

    const exam = await Exam.create({
      title: title.trim(),
      description: description ? description.trim() : "",
      questions: questions.map((q) => q.toString()),
      duration: Number(duration) || 30,
      negativeMarkPerWrong: Number(negativeMarkPerWrong) || 0,
      examCode,
      organizationId,
      authorId,
      isPublished: true,
    });

    return res.status(201).json(exam);
  } catch (error) {
    console.error("Create Exam Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create exam." });
  }
};

// ============================================================
// GET EXAM FOR TAKING TEST (Public/Student - SANITIZED, NO ANSWERS)
// ============================================================
export const getExam = async (req, res) => {
  try {
    const code = req.params.code?.toUpperCase();
    const exam = await Exam.findOne({ examCode: code });
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    // Fetch questions explicitly excluding correctAnswer and explanation
    const rawQuestions = await Question.find({
      _id: { $in: exam.questions },
    }).select("-correctAnswer -explanation");

    // Maintain the author's question order
    const questionMap = new Map(rawQuestions.map((q) => [q._id.toString(), q]));
    const questions = exam.questions
      .map((id) => questionMap.get(id.toString()))
      .filter(Boolean);

    return res.json({
      ...exam._doc,
      questions,
    });
  } catch (err) {
    console.error("Get Exam Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// GET EXAM DETAILS FOR TEACHER / ADMIN (Protected - Includes Answers)
// ============================================================
export const getExamAdmin = async (req, res) => {
  try {
    const code = req.params.code?.toUpperCase();
    const exam = await Exam.findOne({ examCode: code });
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    // Role & Ownership check: super_admin or author or organization admin
    if (req.user?.globalRole !== "super_admin") {
      const isAuthor = exam.authorId && exam.authorId.toString() === req.user._id.toString();
      const isOrgAdmin =
        req.tenant?.role === "org_admin" &&
        exam.organizationId &&
        exam.organizationId.toString() === req.tenant.orgId.toString();

      if (!isAuthor && !isOrgAdmin) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You are not authorized to access this exam's administrative details.",
        });
      }
    }

    const rawQuestions = await Question.find({
      _id: { $in: exam.questions },
    });

    const questionMap = new Map(rawQuestions.map((q) => [q._id.toString(), q]));
    const questions = exam.questions
      .map((id) => questionMap.get(id.toString()))
      .filter(Boolean);

    return res.json({
      ...exam._doc,
      questions,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// SUBMIT EXAM (Student Submission & Server-Side Evaluation)
// ============================================================
export const submitExam = async (req, res) => {
  try {
    const { examCode, name, roll, answers = {} } = req.body;
    const idempotencyKey = req.headers["idempotency-key"] || req.body.idempotencyKey;

    if (!examCode || !name || !roll) {
      return res.status(400).json({
        success: false,
        message: "Exam code, name, and roll number are required.",
      });
    }

    const code = examCode.toUpperCase();
    const cleanRoll = roll.trim();

    // Idempotency: Check if this exact request was already processed
    if (idempotencyKey) {
      const existingKeySubmission = await Submission.findOne({ idempotencyKey });
      if (existingKeySubmission) {
        return res.json({
          success: true,
          submissionId: existingKeySubmission._id,
          score: existingKeySubmission.score,
          attemptNumber: existingKeySubmission.attemptNumber,
          isDuplicateHandled: true,
        });
      }
    }

    const exam = await Exam.findOne({ examCode: code });
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    // 1. Deadline Enforcement
    if (exam.endTime) {
      const gracePeriodMs = 2 * 60 * 1000; // 2 minutes grace
      if (Date.now() > new Date(exam.endTime).getTime() + gracePeriodMs) {
        return res.status(400).json({
          success: false,
          message: "Exam submission window has expired. Deadline passed.",
        });
      }
    }

    // 2. Submission Ownership & Duplicate Prevention (userId + examId)
    const studentId = req.user?._id || null;
    const organizationId = exam.organizationId || null;

    const queryFilter = studentId
      ? { examId: exam._id, studentId }
      : { examId: exam._id, roll: cleanRoll };

    const existingSubs = await Submission.find(queryFilter).sort({ attemptNumber: -1 });
    const attemptCount = existingSubs.length;

    // Disallow duplicates if exam is scheduled or retakes are disabled
    if (
      exam.examType === "scheduled" ||
      exam.allowRetake === false
    ) {
      if (attemptCount >= 1) {
        return res.status(409).json({
          success: false,
          message: studentId
            ? "Duplicate submission rejected: A final submission has already been recorded for this authenticated student account."
            : "Duplicate submission rejected: A final submission has already been recorded for this student roll.",
        });
      }
    } else if (exam.maxAttempts && attemptCount >= exam.maxAttempts) {
      return res.status(409).json({
        success: false,
        message: `Maximum attempt limit (${exam.maxAttempts}) reached for this exam.`,
      });
    }

    const currentAttemptNumber = attemptCount + 1;

    // 3. Fetch questions and grade server-side
    const questions = await Question.find({
      _id: { $in: exam.questions },
    });

    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    questions.forEach((q) => {
      const studentAns = answers[q._id.toString()];
      if (!studentAns) {
        unattemptedCount++;
      } else if (studentAns === q.correctAnswer) {
        correctCount++;
      } else {
        wrongCount++;
      }
    });

    const negativePenalty = exam.negativeMarkPerWrong || 0;
    const rawScore = correctCount - (wrongCount * negativePenalty);
    const score = Math.max(0, parseFloat(rawScore.toFixed(2)));

    const submission = await Submission.create({
      examCode: code,
      examId: exam._id,
      organizationId,
      studentId,
      name: name.trim(),
      roll: cleanRoll,
      score,
      totalQuestions: questions.length,
      correctCount,
      wrongCount,
      attemptNumber: currentAttemptNumber,
      idempotencyKey: idempotencyKey || null,
      answers,
    });

    // Provide evaluated questions with correct answers for review screen
    return res.json({
      success: true,
      submissionId: submission._id,
      score,
      totalQuestions: questions.length,
      correctCount,
      wrongCount,
      unattemptedCount,
      attemptNumber: currentAttemptNumber,
      answers,
      questions,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate submission rejected: Concurrent submission attempt detected.",
      });
    }
    console.error("Submit Exam Error:", error);
    return res.status(500).json({ success: false, message: "Submission failed." });
  }
};

// ============================================================
// GET LEADERBOARD / RANKING
// ============================================================
export const getRanking = async (req, res) => {
  try {
    const code = req.params.code?.toUpperCase();
    const data = await Submission.find({ examCode: code })
      .select("name roll score createdAt")
      .sort({ score: -1, createdAt: 1 });

    return res.json(data);
  } catch (error) {
    console.error("Ranking Error:", error);
    return res.status(500).json({ success: false, message: "Ranking retrieval failed." });
  }
};

// ============================================================
// GET OVERALL PLATFORM / TENANT STATS
// ============================================================
export const getStats = async (req, res) => {
  try {
    const filter = req.tenant?.orgId ? { organizationId: req.tenant.orgId } : {};

    const [examCount, submissionCount, questionCount] = await Promise.all([
      Exam.countDocuments(filter),
      Submission.countDocuments(filter),
      Question.countDocuments(req.tenant?.orgId ? { organizationId: req.tenant.orgId } : {}),
    ]);

    return res.json({ examCount, submissionCount, questionCount });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Stats retrieval failed." });
  }
};

// ============================================================
// GET ALL EXAMS (Optimized with Aggregation Pipeline & Strict Scoping)
// ============================================================
export const getAllExams = async (req, res) => {
  try {
    const filter = {};

    if (req.user?.globalRole === "super_admin") {
      if (req.tenant?.orgId) {
        filter.organizationId = req.tenant.orgId;
      }
    } else if (req.user?.role === "org_admin") {
      if (req.tenant?.orgId) {
        filter.organizationId = req.tenant.orgId;
      } else {
        filter.$or = [{ authorId: req.user._id }, { organizationId: { $ne: null } }];
      }
    } else if (req.user?.role === "tutor") {
      // Teacher sees only exams they authored OR exams in their active organization
      if (req.tenant?.orgId) {
        filter.$or = [{ authorId: req.user._id }, { organizationId: req.tenant.orgId }];
      } else {
        filter.authorId = req.user._id;
      }
    } else {
      // Students cannot use instructor list endpoint
      return res.status(403).json({
        success: false,
        message: "Forbidden: Instructor access required.",
      });
    }

    const examsWithCount = await Exam.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "submissions",
          localField: "examCode",
          foreignField: "examCode",
          as: "submissionsList",
        },
      },
      {
        $addFields: {
          submissionCount: { $size: "$submissionsList" },
        },
      },
      {
        $project: {
          submissionsList: 0,
        },
      },
    ]);

    return res.json(examsWithCount);
  } catch (error) {
    console.error("Get All Exams Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve exams." });
  }
};

// ============================================================
// DELETE SINGLE EXAM (Protected)
// ============================================================
export const deleteExam = async (req, res) => {
  try {
    const rawCode = req.params.examCode;
    const isObjectId = mongoose.Types.ObjectId.isValid(rawCode);
    const exam = await Exam.findOne({
      $or: [
        { examCode: rawCode?.toUpperCase() },
        ...(isObjectId ? [{ _id: rawCode }] : []),
      ],
    });
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found." });
    }

    // Role check: super_admin, tutor, or matching author
    if (
      req.user.globalRole !== "super_admin" &&
      req.user.role !== "tutor" &&
      exam.authorId &&
      exam.authorId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this exam.",
      });
    }

    await Exam.deleteOne({ _id: exam._id });
    await Submission.deleteMany({
      $or: [{ examId: exam._id }, { examCode: exam.examCode }],
    });

    return res.json({ success: true, message: "Exam deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Delete failed." });
  }
};

// ============================================================
// GET STUDENT AVAILABLE EXAMS (Sanitized, Published Exams)
// ============================================================
export const getStudentAvailableExams = async (req, res) => {
  try {
    // Return all published exams so students can see and join every exam created by the teacher
    const query = {
      isPublished: true,
    };

    const exams = await Exam.find(query)
      .select("title description examCode duration examType allowRetake maxAttempts negativeMarkPerWrong startTime endTime createdAt questions authorId")
      .sort({ createdAt: -1 });

    const sanitized = exams.map((e) => ({
      _id: e._id,
      title: e.title,
      description: e.description,
      examCode: e.examCode,
      duration: e.duration,
      examType: e.examType,
      allowRetake: e.allowRetake,
      maxAttempts: e.maxAttempts,
      negativeMarkPerWrong: e.negativeMarkPerWrong,
      startTime: e.startTime,
      endTime: e.endTime,
      totalQuestions: e.questions ? e.questions.length : 0,
      createdAt: e.createdAt,
    }));

    return res.json(sanitized);
  } catch (error) {
    console.error("Get Student Available Exams Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve available exams." });
  }
};

// ============================================================
// GET STUDENT WEAK TOPICS & REVISION RECOMMENDATIONS
// ============================================================
export const getStudentWeakTopics = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const submissions = await Submission.find({ studentId })
      .sort({ createdAt: -1 })
      .limit(15);

    if (!submissions || submissions.length === 0) {
      return res.json({
        success: true,
        weakTopics: [],
        totalMistakes: 0,
        message: "No exam submissions found yet.",
      });
    }

    const examIds = submissions.map((s) => s.examId).filter(Boolean);
    const exams = await Exam.find({ _id: { $in: examIds } }).select("questions");
    const allQuestionIds = exams.flatMap((e) => e.questions || []);

    const questions = await Question.find({ _id: { $in: allQuestionIds } })
      .select("subject chapter topic difficulty correctAnswer")
      .lean();

    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
    const topicStats = {};

    submissions.forEach((sub) => {
      const answers = sub.answers || {};
      for (const [qId, studentAns] of Object.entries(answers)) {
        const q = qMap.get(qId);
        if (!q) continue;

        const topicKey = q.topic || q.chapter || "সাধারণ বিষয়";
        if (!topicStats[topicKey]) {
          topicStats[topicKey] = {
            topic: topicKey,
            chapter: q.chapter || "",
            subject: q.subject || "ICT",
            totalAttempted: 0,
            wrongCount: 0,
            correctCount: 0,
          };
        }
        topicStats[topicKey].totalAttempted++;
        if (studentAns === q.correctAnswer) {
          topicStats[topicKey].correctCount++;
        } else {
          topicStats[topicKey].wrongCount++;
        }
      }
    });

    const weakList = Object.values(topicStats)
      .map((t) => {
        const accuracy = t.totalAttempted > 0 ? Math.round((t.correctCount / t.totalAttempted) * 100) : 0;
        return {
          ...t,
          accuracy,
        };
      })
      .filter((t) => t.wrongCount > 0 || t.accuracy < 70)
      .sort((a, b) => b.wrongCount - a.wrongCount);

    return res.json({
      success: true,
      weakTopics: weakList,
      totalMistakes: weakList.reduce((acc, curr) => acc + curr.wrongCount, 0),
    });
  } catch (error) {
    console.error("Get Weak Topics Error:", error);
    return res.status(500).json({ success: false, message: "Failed to analyze weak topics." });
  }
};

// ============================================================
// GET STUDENT SUBMISSION HISTORY
// ============================================================
export const getStudentHistory = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const submissions = await Submission.find({ studentId })
      .sort({ createdAt: -1 })
      .populate("examId", "title examCode duration examType negativeMarkPerWrong");

    return res.json(submissions);
  } catch (error) {
    console.error("Get Student History Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve history." });
  }
};

