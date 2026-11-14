import Question from "../models/Question.js";
import { applyTopicFilter, getChapterQueryRegex } from "./practiceController.js";

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
// CREATE QUESTION (Protected - Tutor / Admin)
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
      difficulty,
      explanation,
      isPublic
    } = req.body;

    if (!question || !options || !correctAnswer || !chapter || !subject) {
      return res.status(400).json({
        success: false,
        message: "Question, 4 options, correct answer, chapter, and subject are required."
      });
    }

    // Parse options if sent as string or JSON
    let parsedOptions = options;
    if (typeof options === "string") {
      try {
        parsedOptions = JSON.parse(options);
      } catch {
        parsedOptions = options.split(",").map(o => o.trim());
      }
    }

    if (!Array.isArray(parsedOptions) || parsedOptions.length !== 4) {
      return res.status(400).json({
        success: false,
        message: "Exactly 4 options are required."
      });
    }

    // Chapter 2 rule: Only allow approved 13 topics
    if (
      chapter === "Communication Systems" &&
      topic &&
      !CHAPTER_2_TOPICS.includes(topic)
    ) {
      return res.status(400).json({
        success: false,
        message: "Chapter 2-এর জন্য এই topic অনুমোদিত নয়।"
      });
    }

    const image = req.file ? req.file.filename : null;
    const organizationId = req.tenant?.orgId || null;
    const tutorId = req.user?._id?.toString() || "";

    const newQuestion = await Question.create({
      question: question.trim(),
      options: parsedOptions,
      correctAnswer: correctAnswer.trim(),
      explanation: explanation ? explanation.trim() : "",
      chapter: chapter.trim(),
      subject: subject.trim(),
      topic: topic ? topic.trim() : "",
      questionType: questionType || "normal",
      boardName: boardName || "",
      boardYear: boardYear || "",
      difficulty: difficulty || "medium",
      image: image || "",
      tutorId,
      organizationId,
      isPublic: isPublic !== undefined ? Boolean(isPublic) : !organizationId
    });

    return res.status(201).json(newQuestion);
  } catch (err) {
    console.error("createQuestion error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// GET QUESTIONS (Tenant-Scoped & Filterable)
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

    // Tenancy Filter: Allow public questions OR questions belonging to the current tenant
    if (req.tenant?.orgId) {
      query.$or = [
        { organizationId: req.tenant.orgId },
        { isPublic: true },
        { organizationId: null }
      ];
    }

    if (subject) query.subject = subject;
    if (chapter) query.chapter = getChapterQueryRegex(chapter);
    if (topic && topic !== "All") {
      applyTopicFilter(query, topic);
    }

    if (difficulty) query.difficulty = difficulty;

    if (questionType === "board") {
      query.questionType = "board";
      if (boardName) query.boardName = boardName;
      if (boardYear) query.boardYear = boardYear;
    } else if (questionType === "normal") {
      query.questionType = "normal";
    }

    let questionsQuery = Question.find(query);
    if (limit) {
      questionsQuery = questionsQuery.limit(parseInt(limit));
    }

    const questions = await questionsQuery;
    return res.json(questions);
  } catch (err) {
    console.error("getQuestions error:", err);
    return res.status(500).json({ success: false, error: err.message });
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
        success: false,
        message: "subject ও chapter প্রয়োজন"
      });
    }

    let topics;
    if (chapter === "Communication Systems") {
      const existingTopics = await Question.distinct("topic", {
        subject,
        chapter,
        questionType: "normal",
        topic: { $in: CHAPTER_2_TOPICS }
      });

      topics = CHAPTER_2_TOPICS.filter((topic) =>
        existingTopics.includes(topic)
      );
    } else {
      topics = await Question.distinct("topic", {
        subject,
        chapter,
        questionType: "normal",
        topic: { $ne: "" }
      });
    }

    return res.json(topics);
  } catch (err) {
    console.error("getTopics error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// AUTO GENERATE MODEL TEST (40% Easy, 40% Medium, 20% Hard)
// =====================================================
export const autoGenerateQuestions = async (req, res) => {
  try {
    const { subject, chapter, total } = req.query;

    if (!subject || !chapter || !total) {
      return res.status(400).json({
        success: false,
        message: "subject, chapter ও total প্রয়োজন"
      });
    }

    const totalCount = parseInt(total);
    if (!totalCount || totalCount <= 0) {
      return res.status(400).json({
        success: false,
        message: "সঠিক প্রশ্ন সংখ্যা দিন"
      });
    }

    const baseMatch = {
      subject,
      chapter,
      questionType: "normal"
    };

    if (chapter === "Communication Systems") {
      baseMatch.topic = { $in: CHAPTER_2_TOPICS };
    }

    const easyCount = Math.round(totalCount * 0.4);
    const mediumCount = Math.round(totalCount * 0.4);
    const hardCount = totalCount - easyCount - mediumCount;

    const pickRandom = async (difficulty, count, excludeIds = []) => {
      if (count <= 0) return [];
      return Question.aggregate([
        {
          $match: {
            ...baseMatch,
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

    const shortage = totalCount - result.length;
    if (shortage > 0) {
      const usedIds = result.map((q) => q._id);
      const fillQs = await Question.aggregate([
        {
          $match: {
            ...baseMatch,
            _id: { $nin: usedIds }
          }
        },
        { $sample: { size: shortage } }
      ]);
      result = [...result, ...fillQs];
    }

    return res.json({
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
    console.error("autoGenerateQuestions error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
