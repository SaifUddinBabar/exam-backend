import express from "express";
import {
  listBatches,
  createBatch,
  updateBatch,
  setBatchArchived,
  regenerateCode,
  listBatchStudents,
  addBatchStudents,
  removeBatchStudent,
  moveBatchStudents,
  searchStudents,
  myBatches,
  joinBatch,
} from "../controllers/batchController.js";
import { protect, authorize } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();
const staff = authorize("super_admin", "tutor", "org_admin");

// Student
router.get("/mine", protect, myBatches);
router.post("/join", protect, rateLimit({ windowMs: 15 * 60_000, max: 20, key: "batch-join" }), joinBatch);

// Teacher
router.get("/students/search", protect, staff, searchStudents);
router.get("/", protect, staff, listBatches);
router.post("/", protect, staff, createBatch);
router.put("/:id", protect, staff, updateBatch);
router.post("/:id/archive", protect, staff, setBatchArchived(true));
router.post("/:id/restore", protect, staff, setBatchArchived(false));
router.post("/:id/regenerate-code", protect, staff, regenerateCode);
router.get("/:id/students", protect, staff, listBatchStudents);
router.post("/:id/students", protect, staff, addBatchStudents);
router.delete("/:id/students/:studentId", protect, staff, removeBatchStudent);
router.post("/:id/move", protect, staff, moveBatchStudents);

export default router;
