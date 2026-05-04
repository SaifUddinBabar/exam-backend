import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import Question from "../models/Question.js";

// 🔥 generate exam code
const generateCode = () => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

// ================= CREATE EXAM =================
export const createExam = async (req, res) => {
  try {
    const { title, questions, duration } = req.body;

    if (!title || !questions || questions.length === 0) {
      return res.status(400).json({
        message: "Title and Questions required"
      });
    }

    // 🔥 FIX: ensure ObjectId format
    const exam = await Exam.create({
      title,
      questions: questions.map(q => q.toString()),
      duration,
      examCode: generateCode()
    });

    console.log("CREATED EXAM:", exam);

    res.json(exam);

  } catch (err) {
    console.error("CREATE EXAM ERROR:", err);
    res.status(500).json({ message: "Create exam failed" });
  }
};

// ================= GET EXAM =================
export const getExam = async (req, res) => {
  try {
    const { code } = req.params;

    const exam = await Exam.findOne({ examCode: code });

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    // 🔥 FIX: fetch questions correctly
    const questions = await Question.find({
      _id: { $in: exam.questions }
    });

    if (!questions.length) {
      return res.status(404).json({ message: "Questions not found" });
    }

    res.json({
      ...exam._doc,
      questions
    });

  } catch (err) {
    console.error("GET EXAM ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= SUBMIT EXAM =================
export const submitExam = async (req, res) => {
  try {
    const { examCode, name, roll, answers } = req.body;

    const exam = await Exam.findOne({ examCode });

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const questions = await Question.find({
      _id: { $in: exam.questions }
    });

    let score = 0;

    questions.forEach((q) => {
      if (answers[q._id] === q.correctAnswer) {
        score++;
      }
    });

    await Submission.create({
      examCode,
      name,
      roll,
      score
    });

    res.json({
      score,
      answers,
      questions
    });

  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    res.status(500).json({ message: "Submit failed" });
  }
};

// ================= RANKING =================
export const getRanking = async (req, res) => {
  try {
    const { code } = req.params;

    const data = await Submission.find({ examCode: code })
      .sort({ score: -1 });

    res.json(data);

  } catch (err) {
    console.error("RANKING ERROR:", err);
    res.status(500).json({ message: "Ranking failed" });
  }
};