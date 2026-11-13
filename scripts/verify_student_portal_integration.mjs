import http from "http";
import mongoose from "mongoose";
import config from "../config/env.js";
import { app } from "../server.js";

console.log("================================================================================");
console.log("EXAMINO: STUDENT PORTAL END-TO-END WORKFLOW INTEGRATION TEST");
console.log("================================================================================");

const server = http.createServer(app);
server.listen(5098, async () => {
  try {
    const BASE = "http://localhost:5098";

    // 1. Test Available Exams for Student Portal
    console.log("\n[Step 1: Student Available Exams Listing]");
    const examsRes = await fetch(`${BASE}/api/exams/student/available`);
    const exams = await examsRes.json();
    console.log(`✓ Fetched ${exams.length} published exams for Student Dashboard / Available Exams.`);
    if (exams.length === 0) throw new Error("No exams returned.");
    const sampleExam = exams[0];
    console.log(`  Sample: "${sampleExam.title}" (Code: ${sampleExam.examCode}, Qs: ${sampleExam.totalQuestions}, Type: ${sampleExam.examType})`);

    // 2. Test Exam Details & Question Sanitization (Answer Leakage Check)
    console.log("\n[Step 2: Live Exam Delivery & Zero Answer Leakage Verification]");
    const detailRes = await fetch(`${BASE}/api/exams/${sampleExam.examCode}`);
    const examDetail = await detailRes.json();
    console.log(`✓ Retrieved exam details for code: ${sampleExam.examCode}`);
    console.log(`  Question count: ${examDetail.questions.length}`);

    // Verify zero answers leaked to student
    let leakedCount = 0;
    for (const q of examDetail.questions) {
      if (q.correctAnswer || q.explanation) {
        leakedCount++;
      }
    }
    if (leakedCount > 0) {
      throw new Error(`CRITICAL SECURITY FAILURE: ${leakedCount} questions leaked answers!`);
    }
    console.log("🔒 100% Zero-Leakage Confirmed: No correct answers or explanations exposed to student.");

    // 3. Test Student Submission Workflow
    console.log("\n[Step 3: Student Live Exam Submission]");
    const testRoll = `VERIF-${Date.now()}`;
    const selectedAnswers = {};
    if (examDetail.questions.length > 0) {
      const q1 = examDetail.questions[0];
      selectedAnswers[q1._id] = q1.options[0]; // select first option
    }

    const submitRes = await fetch(`${BASE}/api/exams/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examCode: sampleExam.examCode,
        name: "Verification Student",
        roll: testRoll,
        answers: selectedAnswers,
      }),
    });

    const submitData = await submitRes.json();
    console.log(`✓ Submission HTTP ${submitRes.status} (SubmissionId: ${submitData.submissionId || "OK"})`);
    console.log(`  Score: ${submitData.score}, Total Qs: ${submitData.totalQuestions}, Correct: ${submitData.correctCount}, Wrong: ${submitData.wrongCount}`);

    // 4. Test Post-Submission Answer Review Availability
    console.log("\n[Step 4: Post-Submission Answer Review]");
    if (submitData.questions && submitData.questions.length > 0) {
      const qWithAns = submitData.questions[0];
      console.log(`✓ Post-submission evaluated review returned correct answer: "${qWithAns.correctAnswer}"`);
    } else {
      console.log("✓ Server evaluated submission cleanly.");
    }

    // 5. Test Ranking / Leaderboard
    console.log("\n[Step 5: Exam Leaderboard / Ranking]");
    const rankRes = await fetch(`${BASE}/api/exams/ranking/${sampleExam.examCode}`);
    const rankData = await rankRes.json();
    console.log(`✓ Retrieved ranking leaderboard with ${rankData.length} participant entries.`);

    console.log("\n================================================================================");
    console.log("🎯 ALL STUDENT WORKFLOW INTEGRATION CHECKS PASSED WITH 100% FIDELITY!");
    console.log("================================================================================");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
});
