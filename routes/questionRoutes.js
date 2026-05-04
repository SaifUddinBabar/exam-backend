import express from "express";
import { createQuestion, getQuestions } from "../controllers/questionController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.post("/", upload.single("image"), createQuestion);
router.get("/", getQuestions);

export default router;