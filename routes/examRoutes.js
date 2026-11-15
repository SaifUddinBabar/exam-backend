import express from "express";
import {
  createExam,
  updateExam,
  getExam,
  getExamAdmin,
  startExam,
  saveAnswers,
  submitExam,
  getMyResult,
  getRanking,
  getStats,
  getAllExams,
  deleteExam,
  getStudentAvailableExams,
  getStudentHistory,
  getStudentWeakTopics,
} from "../controllers/examController.js";
import { protect, authorize } from "../middleware/auth.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();
const staff = authorize("super_admin", "tutor", "org_admin");

// Static routes (before parameterised ones)
router.get("/stats", protect, staff, getStats);
router.get("/student/weak-topics", protect, getStudentWeakTopics);
router.get("/student/available", protect, getStudentAvailableExams);
router.get("/student/history", protect, getStudentHistory);
router.get("/list", protect, resolveTenantContext, staff, getAllExams);
router.post("/create", protect, resolveTenantContext, staff, createExam);
router.post("/submit", protect, rateLimit({ windowMs: 60_000, max: 20, key: "exam-submit" }), submitExam);

// Parameterised routes
router.get("/ranking/:code", protect, resolveTenantContext, getRanking);
router.get("/:code/admin", protect, resolveTenantContext, staff, getExamAdmin);
router.put("/:code", protect, resolveTenantContext, staff, updateExam);
router.post("/:code/start", protect, rateLimit({ windowMs: 60_000, max: 30, key: "exam-start" }), startExam);
router.put("/:code/answers", protect, rateLimit({ windowMs: 60_000, max: 120, key: "exam-save" }), saveAnswers);
router.get("/:code/my-result", protect, getMyResult);
router.delete("/:examCode", protect, resolveTenantContext, staff, deleteExam);
router.get("/:code", protect, getExam);

export default router;
