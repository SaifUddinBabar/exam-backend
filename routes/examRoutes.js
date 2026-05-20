import express from "express";
import {
  createExam,
  getExam,
  submitExam,
  getRanking,
  getStats,
  clearOldData
} from "../controllers/examController.js";

const router = express.Router();

router.post("/create", createExam);

// 🔥 MUST BE BEFORE /:code
router.get("/ranking/:code", getRanking);

import {
  createExam,
  getExam,
  submitExam,
  getRanking,
  getStats,
  clearOldData,
  deleteExam          // এটা add করো
} from "../controllers/examController.js";

// এই line add করো existing routes এর সাথে
router.delete("/:examCode", deleteExam);


// ✅ NEW ROUTES (VERY IMPORTANT)
router.get("/stats", getStats);
router.delete("/clear-old", clearOldData);

router.get("/:code", getExam);
router.post("/submit", submitExam);

export default router;