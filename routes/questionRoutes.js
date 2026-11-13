import express from "express";
import {
  createQuestion,
  getQuestions,
  getTopics,
  autoGenerateQuestions,
} from "../controllers/questionController.js";
import { upload } from "../middleware/upload.js";
import { protect, authorize } from "../middleware/auth.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";

const router = express.Router();

// Public / Tenant-filtered question querying
router.get("/topics", getTopics);
router.get("/auto-generate", autoGenerateQuestions);
router.get("/", resolveTenantContext, getQuestions);

// Protected question authoring
router.post(
  "/",
  protect,
  resolveTenantContext,
  authorize("super_admin", "tutor", "org_admin", "teacher"),
  upload.single("image"),
  createQuestion
);

export default router;
