import express from "express";
import {
  getAllIctQuestions,
  getIctChapters,
  getIctTopics,
  getRandomExamSet,
  getIctStats
} from "../controllers/ictController.js";

const router = express.Router();

// Stats & Metadata
router.get("/stats", getIctStats);
router.get("/chapters", getIctChapters);
router.get("/topics", getIctTopics);
router.get("/random", getRandomExamSet);

// Questions Query (with filters: ?chapter=&topic=&boardName=&boardYear=&page=&limit=)
router.get("/", getAllIctQuestions);

export default router;
