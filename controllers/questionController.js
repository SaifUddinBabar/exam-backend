import Question from "../models/Question.js";

// CREATE
export const createQuestion = async (req, res) => {
  try {
    const { question, options, correctAnswer, chapter, subject } = req.body;

    const image = req.file ? req.file.filename : null;

    const newQuestion = await Question.create({
      question,
      options: JSON.parse(options),
      correctAnswer,
      chapter,
      subject,
      image
    });

    res.json(newQuestion);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// GET
export const getQuestions = async (req, res) => {
  try {
    const { chapter, limit } = req.query;

    let query = {};

    if (chapter) {
      query.chapter = chapter;
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