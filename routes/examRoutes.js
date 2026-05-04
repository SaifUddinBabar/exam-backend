import express from "express";
import {
  createExam,
  getExam,
  submitExam,
  getRanking
} from "../controllers/examController.js";

const router = express.Router();

router.post("/create", createExam);

// 🔥 MUST BE BEFORE /:code
router.get("/ranking/:code", getRanking);

router.get("/:code", getExam);

router.post("/submit", submitExam);

export default router;