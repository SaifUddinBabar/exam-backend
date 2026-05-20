// ==============================
// routes/examRoutes.js
// ==============================

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

// ==============================
// CREATE EXAM
// ==============================
router.post(
"/create",
createExam
);

// ==============================
// GET ALL EXAMS
// ==============================
router.get(
"/list",
getAllExams
);

// ==============================
// GET STATS
// ==============================
router.get(
"/stats",
getStats
);

// ==============================
// GET RANKING
// ==============================
router.get(
"/ranking/:code",
getRanking
);

// ==============================
// GET SINGLE EXAM
// ==============================
router.get(
"/:code",
getExam
);

// ==============================
// SUBMIT EXAM
// ==============================
router.post(
"/submit",
submitExam
);

// ==============================
// DELETE SINGLE EXAM
// ==============================
router.delete(
"/:examCode",
deleteExam
);

// ==============================
// DELETE ALL DATA
// ==============================
router.delete(
"/clear-old",
clearOldData
);

export default router;
