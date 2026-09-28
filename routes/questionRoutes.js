import express from "express";

import {
  createQuestion,
  getQuestions,
  getTopics,
  autoGenerateQuestions
} from "../controllers/questionController.js";

import { upload } from "../middleware/upload.js";


const router = express.Router();


// ============================================================
// CREATE QUESTION
// ============================================================

router.post(
  "/",
  upload.single("image"),
  createQuestion
);


// ============================================================
// GET TOPICS
// ============================================================

router.get(
  "/topics",
  getTopics
);


// ============================================================
// AUTO GENERATE MODEL TEST
// ============================================================

router.get(
  "/auto-generate",
  autoGenerateQuestions
);


// ============================================================
// GET QUESTIONS
// ============================================================

router.get(
  "/",
  getQuestions
);


export default router;