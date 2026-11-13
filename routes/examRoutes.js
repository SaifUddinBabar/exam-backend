import express from "express";
import {
  createExam,
  getExam,
  getExamAdmin,
  submitExam,
  getRanking,
  getStats,
  getAllExams,
  deleteExam,
  getStudentAvailableExams,
  getStudentHistory,
} from "../controllers/examController.js";
import { protect, authorize, optionalAuth } from "../middleware/auth.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";

const router = express.Router();

// Static routes (MUST be defined before dynamic parameterized routes)
router.get("/stats", resolveTenantContext, getStats);
router.get("/student/available", optionalAuth, resolveTenantContext, getStudentAvailableExams);
router.get("/student/history", protect, resolveTenantContext, getStudentHistory);
router.get("/list", protect, resolveTenantContext, authorize("super_admin", "tutor", "org_admin"), getAllExams);
router.post("/create", protect, resolveTenantContext, authorize("super_admin", "tutor", "org_admin"), createExam);
router.post("/submit", optionalAuth, submitExam);

// Dynamic parameterized routes
router.get("/ranking/:code", getRanking);
router.get("/:code/admin", protect, resolveTenantContext, authorize("super_admin", "tutor", "org_admin"), getExamAdmin);
router.delete("/:examCode", protect, resolveTenantContext, authorize("super_admin", "tutor", "org_admin"), deleteExam);
router.get("/:code", getExam); // Sanitized public student exam delivery

export default router;
