import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Question from "../models/Question.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ICT_FILE = path.join(__dirname, "../ict_questions.json");

// Helper to load fallback JSON if DB query empty
function loadLocalIctJson() {
  try {
    if (fs.existsSync(ICT_FILE)) {
      return JSON.parse(fs.readFileSync(ICT_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading local ict_questions.json:", err);
  }
  return [];
}

// =====================================================
// GET /api/ict (With filters: chapter, topic, boardName, boardYear, limit, page)
// =====================================================
export const getAllIctQuestions = async (req, res) => {
  try {
    const { chapter, topic, boardName, boardYear, difficulty, limit = 50, page = 1, random } = req.query;

    const query = { subject: "ICT" };
    if (chapter) query.chapter = new RegExp(chapter, "i");
    if (topic) query.topic = new RegExp(topic, "i");
    if (difficulty) query.difficulty = difficulty;
    if (boardName) {
      query.questionType = "board";
      query.boardName = new RegExp(boardName, "i");
    }
    if (boardYear) query.boardYear = boardYear;

    const pageSize = Math.min(parseInt(limit) || 50, 1000);
    const pageNum = Math.max(parseInt(page) || 1, 1);

    // If random requested
    if (random === "true" || random === "1") {
      const randomQuestions = await Question.aggregate([
        { $match: query },
        { $sample: { size: pageSize } }
      ]);
      return res.json({
        success: true,
        count: randomQuestions.length,
        questions: randomQuestions
      });
    }

    const total = await Question.countDocuments(query);
    let questions = await Question.find(query)
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize);

    // Fallback if DB doesn't have it yet
    if (questions.length === 0) {
      let localData = loadLocalIctJson();
      if (chapter) localData = localData.filter(q => q.chapter?.toLowerCase().includes(chapter.toLowerCase()));
      if (topic) localData = localData.filter(q => q.topic?.toLowerCase().includes(topic.toLowerCase()));
      if (boardName) localData = localData.filter(q => q.boardName?.toLowerCase() === boardName.toLowerCase());
      if (boardYear) localData = localData.filter(q => q.boardYear === boardYear);

      return res.json({
        success: true,
        source: "local_cache",
        total: localData.length,
        page: pageNum,
        limit: pageSize,
        questions: localData.slice((pageNum - 1) * pageSize, pageNum * pageSize)
      });
    }

    return res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / pageSize),
      limit: pageSize,
      questions
    });
  } catch (err) {
    console.error("getAllIctQuestions error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// GET /api/ict/chapters (List chapters & counts)
// =====================================================
export const getIctChapters = async (req, res) => {
  try {
    const chapters = await Question.aggregate([
      { $match: { subject: "ICT" } },
      { $group: { _id: "$chapter", totalQuestions: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    if (chapters.length === 0) {
      const local = loadLocalIctJson();
      const map = {};
      local.forEach(q => {
        map[q.chapter] = (map[q.chapter] || 0) + 1;
      });
      return res.json({
        success: true,
        chapters: Object.entries(map).map(([chapter, totalQuestions]) => ({ _id: chapter, totalQuestions }))
      });
    }

    return res.json({ success: true, chapters });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// GET /api/ict/topics (List topics & counts)
// =====================================================
export const getIctTopics = async (req, res) => {
  try {
    const { chapter } = req.query;
    const match = { subject: "ICT" };
    if (chapter) match.chapter = new RegExp(chapter, "i");

    const topics = await Question.aggregate([
      { $match: match },
      { $group: { _id: "$topic", totalQuestions: { $sum: 1 }, chapter: { $first: "$chapter" } } },
      { $sort: { totalQuestions: -1 } }
    ]);

    if (topics.length === 0) {
      const local = loadLocalIctJson().filter(q => !chapter || q.chapter?.toLowerCase().includes(chapter.toLowerCase()));
      const map = {};
      local.forEach(q => {
        map[q.topic] = (map[q.topic] || 0) + 1;
      });
      return res.json({
        success: true,
        topics: Object.entries(map).map(([topic, totalQuestions]) => ({ _id: topic, totalQuestions }))
      });
    }

    return res.json({ success: true, topics });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// GET /api/ict/random (Random exam set for tests)
// =====================================================
export const getRandomExamSet = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const { chapter } = req.query;

    const match = { subject: "ICT" };
    if (chapter) match.chapter = new RegExp(chapter, "i");

    let questions = await Question.aggregate([
      { $match: match },
      { $sample: { size: limit } }
    ]);

    if (questions.length === 0) {
      const local = loadLocalIctJson().filter(q => !chapter || q.chapter?.toLowerCase().includes(chapter.toLowerCase()));
      // Shuffle array
      const shuffled = [...local].sort(() => 0.5 - Math.random());
      questions = shuffled.slice(0, limit);
    }

    return res.json({
      success: true,
      count: questions.length,
      questions
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
// GET /api/ict/stats (Summary stats)
// =====================================================
export const getIctStats = async (req, res) => {
  try {
    const total = await Question.countDocuments({ subject: "ICT" });
    const boardCount = await Question.countDocuments({ subject: "ICT", questionType: "board" });
    const normalCount = await Question.countDocuments({ subject: "ICT", questionType: "normal" });
    const withImages = await Question.countDocuments({ subject: "ICT", image: { $ne: "" } });

    return res.json({
      success: true,
      subject: "ICT",
      totalQuestions: total,
      boardQuestions: boardCount,
      topicBasedQuestions: normalCount,
      questionsWithImages: withImages
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
