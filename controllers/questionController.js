import Question from "../models/Question.js";

// =====================================================
// CHAPTER 2 — APPROVED 13 TOPICS ONLY
// =====================================================
const CHAPTER_2_TOPICS = [
  "কমিউনিকেশন সিস্টেম (Communication System)",
  "ডেটা কমিউনিকেশন (Data Communication)",
  "ডেটা কমিউনিকেশনের উপাদান (Data Communication Components: Source, Transmitter, Media, Receiver, Destination)",
  "ডেটা ট্রান্সমিশন মোড (Data Transmission Mode: Serial/Parallel, Simplex/Half Duplex/Full Duplex)",
  "ব্যান্ডউইথ (Bandwidth)",
  "কমিউনিকেশন মিডিয়া: তারযুক্ত (Wired Media – Twisted Pair, Coaxial, Fiber Optic)",
  "কমিউনিকেশন মিডিয়া: তারবিহীন (Wireless Media – Radio Wave, Microwave, Satellite, Bluetooth, Infrared, Wi-Fi, WiMAX)",
  "মোবাইল কমিউনিকেশন সিস্টেম (Mobile Communication System)",
  "মোবাইল ফোনের বিভিন্ন প্রজন্ম (Generations of Mobile Phone: 1G–5G)",
  "কম্পিউটার নেটওয়ার্ক (Computer Network) ও নেটওয়ার্কের প্রকারভেদ (PAN, LAN, MAN, WAN)",
  "নেটওয়ার্ক টপোলজি (Network Topology: Bus, Ring, Star, Tree, Mesh, Hybrid)",
  "নেটওয়ার্কিং ডিভাইস (Networking Devices: Modem, Hub, Switch, Router, Gateway, Repeater)",
  "ক্লাউড কম্পিউটিং (Cloud Computing)"
];


// =====================================================
// CREATE QUESTION
// =====================================================
export const createQuestion = async (req, res) => {
  try {
    const {
      question,
      options,
      correctAnswer,
      chapter,
      subject,
      topic,
      questionType,
      boardName,
      boardYear,
      difficulty
    } = req.body;

    // Chapter 2 হলে শুধু approved 13 topics allow করবে
    if (
      chapter === "Communication Systems" &&
      topic &&
      !CHAPTER_2_TOPICS.includes(topic)
    ) {
      return res.status(400).json({
        message: "Chapter 2-এর জন্য এই topic অনুমোদিত নয়।"
      });
    }

    const image = req.file ? req.file.filename : null;

    const newQuestion = await Question.create({
      question,
      options: JSON.parse(options),
      correctAnswer,
      chapter,
      subject,
      topic: topic || "",
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


// =====================================================
// GET QUESTIONS
// =====================================================
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

    // =================================================
    // CHAPTER 2 → ONLY APPROVED 13 TOPICS
    // =================================================
    if (chapter === "Communication Systems") {
      query.topic = { $in: CHAPTER_2_TOPICS };

      // যদি নির্দিষ্ট topic দেওয়া হয়
      if (topic) {
        if (!CHAPTER_2_TOPICS.includes(topic)) {
          return res.json([]);
        }

        query.topic = topic;
      }
    } else if (topic) {
      query.topic = topic;
    }

    // Difficulty filter
    if (difficulty) {
      query.difficulty = difficulty;
    }

    // Board / Normal filter
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
    console.error("getQuestions error:", err);
    res.status(500).json({ error: err.message });
  }
};


// =====================================================
// GET DISTINCT TOPICS FOR A CHAPTER
// =====================================================
export const getTopics = async (req, res) => {
  try {
    const { subject, chapter } = req.query;

    if (!subject || !chapter) {
      return res.status(400).json({
        message: "subject ও chapter প্রয়োজন"
      });
    }

    let topics;

    // =================================================
    // CHAPTER 2 → ONLY 13 APPROVED TOPICS
    // =================================================
    if (chapter === "Communication Systems") {

      const existingTopics = await Question.distinct("topic", {
        subject,
        chapter,
        questionType: "normal",
        topic: { $in: CHAPTER_2_TOPICS }
      });

      // Approved 13 topics-এর order বজায় থাকবে
      topics = CHAPTER_2_TOPICS.filter(
        topic => existingTopics.includes(topic)
      );

    } else {

      // অন্যান্য chapter আগের মতোই কাজ করবে
      topics = await Question.distinct("topic", {
        subject,
        chapter,
        questionType: "normal",
        topic: { $ne: "" }
      });
    }

    res.json(topics);

  } catch (err) {
    console.error("getTopics error:", err);
    res.status(500).json({
      error: err.message
    });
  }
};


// =====================================================
// AUTO GENERATE MODEL TEST
// Fixed ratio: 40% easy, 40% medium, 20% hard
// =====================================================
export const autoGenerateQuestions = async (req, res) => {
  try {
    const { subject, chapter, total } = req.query;

    if (!subject || !chapter || !total) {
      return res.status(400).json({
        message: "subject, chapter ও total প্রয়োজন"
      });
    }

    const totalCount = parseInt(total);

    if (!totalCount || totalCount <= 0) {
      return res.status(400).json({
        message: "সঠিক প্রশ্ন সংখ্যা দিন"
      });
    }

    // =================================================
    // BASE FILTER
    // =================================================
    const baseMatch = {
      subject,
      chapter,
      questionType: "normal"
    };

    // Chapter 2 হলে শুধু 13 topics
    if (chapter === "Communication Systems") {
      baseMatch.topic = {
        $in: CHAPTER_2_TOPICS
      };
    }

    // =================================================
    // 40 / 40 / 20 SPLIT
    // =================================================
    const easyCount = Math.round(totalCount * 0.4);
    const mediumCount = Math.round(totalCount * 0.4);
    const hardCount = totalCount - easyCount - mediumCount;


    // =================================================
    // RANDOM QUESTION PICKER
    // =================================================
    const pickRandom = async (
      difficulty,
      count,
      excludeIds = []
    ) => {
      if (count <= 0) return [];

      return Question.aggregate([
        {
          $match: {
            ...baseMatch,
            difficulty,
            _id: {
              $nin: excludeIds
            }
          }
        },
        {
          $sample: {
            size: count
          }
        }
      ]);
    };


    // =================================================
    // PICK QUESTIONS
    // =================================================
    const easyQs = await pickRandom(
      "easy",
      easyCount
    );

    const mediumQs = await pickRandom(
      "medium",
      mediumCount
    );

    const hardQs = await pickRandom(
      "hard",
      hardCount
    );


    let result = [
      ...easyQs,
      ...mediumQs,
      ...hardQs
    ];


    // =================================================
    // FILL SHORTAGE
    // =================================================
    const shortage = totalCount - result.length;

    if (shortage > 0) {

      const usedIds = result.map(
        q => q._id
      );

      const fillQs = await Question.aggregate([
        {
          $match: {
            ...baseMatch,
            _id: {
              $nin: usedIds
            }
          }
        },
        {
          $sample: {
            size: shortage
          }
        }
      ]);

      result = [
        ...result,
        ...fillQs
      ];
    }


    // =================================================
    // RESPONSE
    // =================================================
    res.json({
      questions: result,

      breakdown: {
        requested: {
          easy: easyCount,
          medium: mediumCount,
          hard: hardCount
        },

        found: {
          easy: easyQs.length,
          medium: mediumQs.length,
          hard: hardQs.length
        },

        total: result.length
      }
    });

  } catch (err) {
    console.error(
      "autoGenerateQuestions error:",
      err
    );

    res.status(500).json({
      error: err.message
    });
  }
};