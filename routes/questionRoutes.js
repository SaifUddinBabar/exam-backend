import express from "express";
import {
  createQuestion,
  updateQuestion,
  getQuestions,
  getTopics,
  autoGenerateQuestions,
  getQuestionRevisions,
  reportQuestion,
  listReports,
  resolveReport,
} from "../controllers/questionController.js";
import { reviewQueue } from "../controllers/questionReviewController.js";
import { upload } from "../middleware/upload.js";
import { protect, authorize } from "../middleware/auth.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();
const staff = authorize("super_admin", "tutor", "org_admin");

// The question bank (with correct answers) is visible to teachers/admins only.
// Students receive questions only through authorised exam, practice or battle sessions.
router.get("/topics", protect, staff, getTopics);
router.get("/auto-generate", protect, staff, autoGenerateQuestions);
router.get("/review", protect, staff, reviewQueue);
router.get("/reports", protect, resolveTenantContext, staff, listReports);
router.put("/reports/:reportId", protect, resolveTenantContext, staff, resolveReport);
router.get("/", protect, resolveTenantContext, staff, getQuestions);

router.post("/", protect, resolveTenantContext, staff, upload.single("image"), createQuestion);
router.put("/:id", protect, resolveTenantContext, staff, upload.single("image"), updateQuestion);
router.get("/:id/revisions", protect, staff, getQuestionRevisions);
router.post("/:id/report", protect, rateLimit({ windowMs: 60 * 60_000, max: 30, key: "q-report" }), reportQuestion);

export default router;
