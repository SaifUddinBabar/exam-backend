import express from "express";
import { getAllIctQuestions, getIctChapters, getIctTopics, getRandomExamSet, getIctStats } from "../controllers/ictController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();
const staff = authorize("super_admin", "tutor", "org_admin");

// Metadata (no question content)
router.get("/stats", protect, getIctStats);
router.get("/chapters", protect, getIctChapters);
router.get("/topics", protect, getIctTopics);

// Question content — teachers/admins only
router.get("/random", protect, staff, getRandomExamSet);
router.get("/", protect, staff, getAllIctQuestions);

export default router;
