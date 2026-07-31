import express from "express";
import {
  createQuestion,
  getQuestions,
  getTopics,
  autoGenerateQuestions
} from "../controllers/questionController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.post("/", upload.single("image"), createQuestion);
router.get("/topics", getTopics);
router.get("/auto-generate", autoGenerateQuestions);
router.get("/", getQuestions);

export default router;