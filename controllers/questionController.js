import Question from "../models/Question.js";

// ==============================
// CREATE QUESTION
// ==============================
export const createQuestion = async (req, res) => {
  try {
    const {
      question,
      options,
      correctAnswer,
      chapter,
      topic,
      subject,
      questionType,
      boardName,
      boardYear
    } = req.body;

    const image = req.file ? req.file.filename : null;

    const newQuestion = await Question.create({
      question,
      options: JSON.parse(options),
      correctAnswer,
      chapter,
      topic: topic || "",
      subject,
      questionType: questionType || "normal",
      boardName: boardName || "",
      boardYear: boardYear || "",
      image
    });

    res.json(newQuestion);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ==============================
// GET QUESTIONS
// ==============================
export const getQuestions = async (req, res) => {
  try {
    const {
      chapter,
      topic,
      subject,
      questionType,
      boardYear,
      boardName,
      limit
    } = req.query;

    let query = {};

    // Subject filter
    if (subject) {
      query.subject = subject;
    }

    // Chapter filter
    if (chapter) {
      query.chapter = chapter;
    }

    // ✅ Topic filter (normal প্রশ্নের ক্ষেত্রে প্রাসঙ্গিক)
    if (topic) {
      query.topic = topic;
    }

    // ✅ Board Questions হলে boardName + boardYear দিয়ে exact filter
    if (questionType === "board") {
      query.questionType = "board";

      if (boardName) {
        query.boardName = boardName;
      }

      if (boardYear) {
        query.boardYear = boardYear;
      }

    } else if (questionType === "normal") {
      query.questionType = "normal";
    }

    let questions = await Question.find(query);

    if (limit) {
      questions = questions.slice(0, parseInt(limit));
    }

    res.json(questions);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ==============================
// GET TOPICS — distinct topic list for a chapter
// ==============================
export const getTopics = async (req, res) => {
  try {
    const { subject, chapter } = req.query;

    if (!chapter) {
      return res.json([]);
    }

    const query = { chapter, questionType: "normal" };
    if (subject) {
      query.subject = subject;
    }

    const topics = await Question.distinct("topic", query);

    // খালি স্ট্রিং/null বাদ দিয়ে পাঠানো
    const cleanTopics = topics.filter((t) => t && t.trim() !== "");

    res.json(cleanTopics);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};