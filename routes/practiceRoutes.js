import express from "express";
import {
  getFilterMetadata,
  getQuestionBank,
  getAvailableCount,
  generatePracticeTest,
  submitPracticeTest,
  getPracticeMistakes,
  getBookmarks,
  toggleBookmark,
  getPracticeHistory,
  getPracticeAnalytics,
} from "../controllers/practiceController.js";
import { protect, optionalAuth } from "../middleware/auth.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";

const router = express.Router();

// Question Bank & Meta
router.get("/metadata", resolveTenantContext, getFilterMetadata);
router.get("/question-bank", optionalAuth, resolveTenantContext, getQuestionBank);
router.get("/available-count", resolveTenantContext, getAvailableCount);

// Practice Generation & Submissions
router.post("/generate", optionalAuth, resolveTenantContext, generatePracticeTest);
router.post("/submit", optionalAuth, resolveTenantContext, submitPracticeTest);

// Student Focused Drill
router.get("/mistakes", protect, resolveTenantContext, getPracticeMistakes);
router.get("/bookmarks", protect, resolveTenantContext, getBookmarks);
router.post("/bookmarks/:questionId", protect, resolveTenantContext, toggleBookmark);
router.delete("/bookmarks/:questionId", protect, resolveTenantContext, toggleBookmark);
router.get("/history", protect, resolveTenantContext, getPracticeHistory);
router.get("/analytics", protect, resolveTenantContext, getPracticeAnalytics);

export default router;
