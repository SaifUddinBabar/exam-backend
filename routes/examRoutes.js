import express from "express";
import {
  createExam,
  getExam,
  submitExam,
  getRanking,
  getStats,
  clearOldData,
  getAllExams,
  deleteExam
} from "../controllers/examController.js";

const router = express.Router();

router.post("/create", createExam);
router.get("/ranking/:code", getRanking);
router.get("/stats", getStats);
router.get("/list", getAllExams);
router.delete("/clear-old", clearOldData);
router.delete("/:examCode", deleteExam);
router.get("/:code", getExam);
router.post("/submit", submitExam);

export default router;