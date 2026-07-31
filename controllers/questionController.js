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
      subject,
      questionType,
      boardName,
      boardYear,
      difficulty
    } = req.body;

    const image = req.file ? req.file.filename : null;

    const newQuestion = await Question.create({
      question,
      options: JSON.parse(options),
      correctAnswer,
      chapter,
      subject,
      questionType: questionType || "normal",
      boardName: boardName || "",
      boardYear: boardYear || "",
      difficulty: difficulty || "medium",
      image
    });

    res.json(newQuestion);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ==============================
// GET QUESTIONS — FIXED
// ==============================
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

    let query = {};

    // Subject filter
    if (subject) {
      query.subject = subject;
    }

    // Chapter filter
    if (chapter) {
      query.chapter = chapter;
    }

    // Topic filter
    if (topic) {
      query.topic = topic;
    }

    // Difficulty filter
    if (difficulty) {
      query.difficulty = difficulty;
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
// GET DISTINCT TOPICS FOR A CHAPTER
// ==============================
export const getTopics = async (req, res) => {
  try {
    const { subject, chapter } = req.query;

    if (!subject || !chapter) {
      return res.status(400).json({ message: "subject ও chapter প্রয়োজন" });
    }

    const topics = await Question.distinct("topic", {
      subject,
      chapter,
      questionType: "normal",
      topic: { $ne: "" }
    });

    res.json(topics);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ==============================
// AUTO GENERATE MODEL TEST
// Fixed ratio: 40% easy, 40% medium, 20% hard
// ==============================
export const autoGenerateQuestions = async (req, res) => {
  try {
    const { subject, chapter, total } = req.query;

    if (!subject || !chapter || !total) {
      return res.status(400).json({ message: "subject, chapter ও total প্রয়োজন" });
    }

    const totalCount = parseInt(total);
    if (!totalCount || totalCount <= 0) {
      return res.status(400).json({ message: "সঠিক প্রশ্ন সংখ্যা দিন" });
    }

    // 40 / 40 / 20 split
    const easyCount = Math.round(totalCount * 0.4);
    const mediumCount = Math.round(totalCount * 0.4);
    const hardCount = totalCount - easyCount - mediumCount;

    const pickRandom = async (difficulty, count, excludeIds = []) => {
      if (count <= 0) return [];
      return Question.aggregate([
        {
          $match: {
            subject,
            chapter,
            questionType: "normal",
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

    // কোনো difficulty তে যথেষ্ট প্রশ্ন না থাকলে, বাকি যেকোনো difficulty থেকে ঘাটতি পূরণ
    const shortage = totalCount - result.length;
    if (shortage > 0) {
      const usedIds = result.map((q) => q._id);
      const fillQs = await Question.aggregate([
        {
          $match: {
            subject,
            chapter,
            questionType: "normal",
            _id: { $nin: usedIds }
          }
        },
        { $sample: { size: shortage } }
      ]);
      result = [...result, ...fillQs];
    }

    res.json({
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
    res.status(500).json({ error: err.message });
  }
};