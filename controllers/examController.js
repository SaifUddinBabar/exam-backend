import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import Question from "../models/Question.js";

const generateCode = () => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

// CREATE
export const createExam = async (req, res) => {
  try {
    const { title, questions, duration } = req.body;

    if (!title || !questions || questions.length === 0) {
      return res.status(400).json({ message: "Title and Questions required" });
    }

    const exam = await Exam.create({
      title,
      questions: questions.map(q => q.toString()),
      duration,
      examCode: generateCode()
    });

    res.json(exam);
  } catch {
    res.status(500).json({ message: "Create exam failed" });
  }
};

// GET EXAM
export const getExam = async (req, res) => {
  try {
    const exam = await Exam.findOne({ examCode: req.params.code });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const questions = await Question.find({
      _id: { $in: exam.questions }
    });

    res.json({ ...exam._doc, questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// SUBMIT
export const submitExam = async (req, res) => {
  try {
    const { examCode, name, roll, answers } = req.body;

    const exam = await Exam.findOne({ examCode });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const questions = await Question.find({
      _id: { $in: exam.questions }
    });

    let score = 0;

    questions.forEach((q) => {
      if (answers[q._id] === q.correctAnswer) score++;
    });

    await Submission.create({ examCode, name, roll, score });

    res.json({ score, answers, questions });
  } catch {
    res.status(500).json({ message: "Submit failed" });
  }
};

// RANKING
export const getRanking = async (req, res) => {
  try {
    const data = await Submission.find({ examCode: req.params.code })
      .sort({ score: -1 });

    res.json(data);
  } catch {
    res.status(500).json({ message: "Ranking failed" });
  }
};

// STATS
export const getStats = async (req, res) => {
  const examCount = await Exam.countDocuments();
  const submissionCount = await Submission.countDocuments();
  const questionCount = await Question.countDocuments();

  res.json({ examCount, submissionCount, questionCount });
};

// 🔥 CLEAR / DELETE (MAIN FIX)
export const clearOldData = async (req, res) => {
  try {
    const { type } = req.query;

    let exams, subs;

    if (type === "all") {
      // ✅ DELETE ALL
      exams = await Exam.deleteMany({});
      subs = await Submission.deleteMany({});
    } else {
      // ✅ CLEAR OLD (2 days)
      const twoDaysAgo = new Date(Date.now() - 172800000);

      exams = await Exam.deleteMany({
        createdAt: { $lt: twoDaysAgo }
      });

      subs = await Submission.deleteMany({
        createdAt: { $lt: twoDaysAgo }
      });
    }

    res.json({
      message: "Done",
      examsDeleted: exams.deletedCount,
      submissionsDeleted: subs.deletedCount
    });

  } catch {
    res.status(500).json({ message: "Clear failed" });
  }
};