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

    const exam = await Exam.create({
      title,
      questions,
      duration,
      examCode: generateCode()
    });

    console.log("CREATED EXAM:", exam); // ✅ correct place

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

    const questions = await Question.find({
      _id: { $in: exam.questions }
    });

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

    // 🔥 IMPORTANT CHANGE
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

    console.log("RANKING API HIT:", code); // 🔥 ADD THIS

    const data = await Submission.find({ examCode: code })
      .sort({ score: -1 });

    console.log("RANK DATA:", data); // 🔥 ADD THIS

    res.json(data);

  } catch (err) {
    console.error("RANKING ERROR:", err);
    res.status(500).json({ message: "Ranking failed" });
  }
};