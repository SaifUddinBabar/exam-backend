import express from "express";
import {
  getFilterMetadata,
  getQuestionBank,
  getAvailableCount,
  getTopicCounts,
  generatePracticeTest,
  submitPracticeTest,
  getPracticeMistakes,
  getBookmarks,
  toggleBookmark,
  getPracticeHistory,
  getPracticeAnalytics,
} from "../controllers/practiceController.js";
import { protect, authorize } from "../middleware/auth.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();
const staff = authorize("super_admin", "tutor", "org_admin");

// Subject / chapter / topic names and counts (no question content) — any signed-in user.
router.get("/metadata", protect, resolveTenantContext, getFilterMetadata);
router.get("/available-count", protect, resolveTenantContext, getAvailableCount);
router.get("/topic-counts", protect, resolveTenantContext, getTopicCounts);

// Full question bank browsing (includes answers) — teachers/admins only.
router.get("/question-bank", protect, resolveTenantContext, staff, getQuestionBank);

// Practice sessions — signed-in students.
router.post("/generate", protect, rateLimit({ windowMs: 60_000, max: 20, key: "practice-gen" }), resolveTenantContext, generatePracticeTest);
router.post("/submit", protect, resolveTenantContext, submitPracticeTest);

// Student focused drill
router.get("/mistakes", protect, resolveTenantContext, getPracticeMistakes);
router.get("/bookmarks", protect, resolveTenantContext, getBookmarks);
router.post("/bookmarks/:questionId", protect, resolveTenantContext, toggleBookmark);
router.delete("/bookmarks/:questionId", protect, resolveTenantContext, toggleBookmark);
router.get("/history", protect, resolveTenantContext, getPracticeHistory);
router.get("/analytics", protect, resolveTenantContext, getPracticeAnalytics);

export default router;
