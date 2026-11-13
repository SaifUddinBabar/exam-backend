import assert from "assert";

console.log("================================================================================");
console.log("EXAMINO: PRACTICE PLATFORM & EXTENDED DASHBOARD QA TEST SUITE");
console.log("================================================================================");

const BACKEND_URL = "http://localhost:5000";
const FRONTEND_URL = "http://127.0.0.1:5173";

let passed = 0;
let failed = 0;

function testAssert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runPracticeSuite() {
  try {
    // -------------------------------------------------------------------------
    // TEST 1: ROUTE ACCESSIBILITY (All 17 Student Routes)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1] Extended Student Portal Route Verification");
    const routesToTest = [
      "/",
      "/login",
      "/register",
      "/dashboard",
      "/exams",
      "/exams/EXAM-ICT-01/details",
      "/exams/EXAM-ICT-01/instructions",
      "/exam/EXAM-ICT-01",
      "/exams/EXAM-ICT-01/submitted",
      "/exams/EXAM-ICT-01/result",
      "/exams/EXAM-ICT-01/review",
      "/results",
      "/performance",
      "/history",
      "/profile",
      "/question-bank",
      "/practice",
      "/practice/create",
      "/practice/mistakes",
      "/saved-questions",
    ];

    for (const r of routesToTest) {
      const res = await fetch(`${FRONTEND_URL}${r}`);
      testAssert(res.status === 200, `Route ${r} returned HTTP 200 (HTML Shell Loaded)`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: AUTHENTICATION SETUP
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Authenticated Student Registration & Login");
    const testEmail = `practice_qa_${Date.now()}@student.examino.edu.bd`;
    const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Self-Study Student",
        email: testEmail,
        password: "PracticePassword2026!",
        role: "student",
      }),
    });
    testAssert(regRes.status === 201, `Student registered successfully (HTTP 201)`);
    const regData = await regRes.json();
    const token = regData.token;
    testAssert(Boolean(token), "JWT token issued");

    // -------------------------------------------------------------------------
    // TEST 3: FILTER METADATA API
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Filter Metadata API Verification");
    const metaRes = await fetch(`${BACKEND_URL}/api/practice/metadata`);
    testAssert(metaRes.status === 200, "GET /api/practice/metadata returned HTTP 200");
    const meta = await metaRes.json();
    testAssert(meta.success === true, "Metadata API marked success: true");
    testAssert(meta.subjects && meta.subjects.length > 0, "Subjects array populated");
    const ictSubject = meta.subjects.find((s) => s.name === "ICT");
    testAssert(Boolean(ictSubject), "ICT subject exists in database");
    testAssert(ictSubject.chapters.length >= 6, `ICT has ${ictSubject.chapters.length} chapters`);
    testAssert(meta.boards.length > 0, `Boards available: ${meta.boards.join(", ")}`);
    testAssert(meta.boardYears.length > 0, `Board years available: ${meta.boardYears.join(", ")}`);

    // -------------------------------------------------------------------------
    // TEST 4: QUESTION BANK PAGINATION & SEARCH
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Question Bank Pagination, Filtering & Search");
    const qbRes = await fetch(`${BACKEND_URL}/api/practice/question-bank?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    testAssert(qbRes.status === 200, "GET /api/practice/question-bank returned HTTP 200");
    const qb = await qbRes.json();
    testAssert(qb.total >= 2000, `Total question bank count is ${qb.total} (>= 2000 expected)`);
    testAssert(qb.questions.length === 10, "Page 1 returned exactly 10 questions");
    testAssert(qb.questions[0].options.length === 4, "Questions have 4 options");
    testAssert(qb.questions[0].isBookmarked === false, "Default bookmark status is false");

    // Test Search query filter
    const searchRes = await fetch(`${BACKEND_URL}/api/practice/question-bank?search=কম্পিউটার`);
    const searchData = await searchRes.json();
    testAssert(searchData.total > 0, `Search for 'কম্পিউটার' returned ${searchData.total} matching questions`);

    // -------------------------------------------------------------------------
    // TEST 5: AVAILABLE COUNT PRE-CHECK
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Practice Available Count Pre-Check");
    const countRes = await fetch(`${BACKEND_URL}/api/practice/available-count?subject=ICT&difficulty=medium`);
    testAssert(countRes.status === 200, "GET /api/practice/available-count returned HTTP 200");
    const countData = await countRes.json();
    testAssert(countData.count > 0, `Available medium questions in ICT: ${countData.count}`);

    // -------------------------------------------------------------------------
    // TEST 6: PRACTICE TEST GENERATION (PRACTICE VS TEST MODES)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Practice Test Generation");
    // Mode A: Practice Mode (Immediate solutions included)
    const genPracticeRes = await fetch(`${BACKEND_URL}/api/practice/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subject: "ICT",
        questionCount: 10,
        difficulty: "mixed",
        mode: "practice",
      }),
    });
    testAssert(genPracticeRes.status === 201, "Generate Practice Mode returned HTTP 201");
    const practiceSet = await genPracticeRes.json();
    testAssert(practiceSet.questions.length === 10, "Generated 10 questions");
    testAssert(Boolean(practiceSet.questions[0].correctAnswer), "Practice Mode: Correct answer available for immediate feedback");

    // Mode B: Test Mode (Delayed grading - solutions redacted)
    const genTestRes = await fetch(`${BACKEND_URL}/api/practice/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subject: "ICT",
        questionCount: 15,
        difficulty: "hard",
        mode: "test",
        durationMinutes: 15,
      }),
    });
    testAssert(genTestRes.status === 201, "Generate Test Mode returned HTTP 201");
    const testSet = await genTestRes.json();
    testAssert(testSet.questions.length === 15, "Generated 15 hard questions for timed test");
    testAssert(testSet.questions[0].correctAnswer === undefined, "Test Mode: Correct answers redacted until final submission");

    // -------------------------------------------------------------------------
    // TEST 7: PRACTICE TEST SUBMISSION & SCORING
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7] Practice Test Submission & Grading");
    const q1 = testSet.questions[0];
    const q2 = testSet.questions[1];
    const q3 = testSet.questions[2];

    const submissionAnswers = {
      [q1._id]: q1.options[0], // Attempt 1
      [q2._id]: "Deliberate Wrong Answer", // Attempt 2 (Wrong)
      // q3 left unattempted
    };

    const submitRes = await fetch(`${BACKEND_URL}/api/practice/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sessionId: testSet.sessionId,
        answers: submissionAnswers,
        timeSpentSeconds: 120,
      }),
    });
    testAssert(submitRes.status === 200, "POST /api/practice/submit returned HTTP 200");
    const submitResult = await submitRes.json();
    testAssert(submitResult.success === true, "Submit marked success: true");
    testAssert(submitResult.totalQuestions === 15, "Evaluated all 15 questions");
    testAssert(submitResult.questions[0].correctAnswer !== undefined, "Post-submission: Correct answers unlocked for review");

    // -------------------------------------------------------------------------
    // TEST 8: BOOKMARKS / SAVED QUESTIONS
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8] Bookmarks & Saved Questions API");
    const bookmarkQId = qb.questions[0]._id;

    // Add Bookmark
    const addBmRes = await fetch(`${BACKEND_URL}/api/practice/bookmarks/${bookmarkQId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    testAssert(addBmRes.status === 200, "Add bookmark returned HTTP 200");
    const addBmData = await addBmRes.json();
    testAssert(addBmData.isBookmarked === true, "Bookmark status: true");

    // List Bookmarks
    const listBmRes = await fetch(`${BACKEND_URL}/api/practice/bookmarks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBmData = await listBmRes.json();
    testAssert(listBmData.total === 1, "Bookmark list contains exactly 1 saved question");
    testAssert(listBmData.bookmarks[0].question._id === bookmarkQId, "Saved question ID matches");

    // Remove Bookmark
    const delBmRes = await fetch(`${BACKEND_URL}/api/practice/bookmarks/${bookmarkQId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    testAssert(delBmRes.status === 200, "Delete bookmark returned HTTP 200");
    const delBmData = await delBmRes.json();
    testAssert(delBmData.isBookmarked === false, "Bookmark status updated to false");

    // Re-bookmark for UI verification
    await fetch(`${BACKEND_URL}/api/practice/bookmarks/${bookmarkQId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // -------------------------------------------------------------------------
    // TEST 9: PRACTICE MISTAKES (Wrong Questions Tracker)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 9] Practice Mistakes Tracking");
    const mistRes = await fetch(`${BACKEND_URL}/api/practice/mistakes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    testAssert(mistRes.status === 200, "GET /api/practice/mistakes returned HTTP 200");
    const mistData = await mistRes.json();
    testAssert(mistData.totalMistakes >= 1, `Mistakes recorded: ${mistData.totalMistakes} (>= 1 from deliberate wrong answer)`);
    testAssert(mistData.questions.length >= 1, "Mistake question details populated");

    // -------------------------------------------------------------------------
    // TEST 10: PRACTICE HISTORY & ANALYTICS
    // -------------------------------------------------------------------------
    console.log("\n[TEST 10] Practice History & Chapter Analytics");
    const histRes = await fetch(`${BACKEND_URL}/api/practice/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    testAssert(histRes.status === 200, "GET /api/practice/history returned HTTP 200");
    const histData = await histRes.json();
    testAssert(histData.count >= 1, `Practice session recorded in history (count: ${histData.count})`);

    const anaRes = await fetch(`${BACKEND_URL}/api/practice/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    testAssert(anaRes.status === 200, "GET /api/practice/analytics returned HTTP 200");
    const anaData = await anaRes.json();
    testAssert(anaData.totalSessions >= 1, "Analytics total sessions >= 1");
    testAssert(anaData.totalPracticeQuestions >= 15, "Analytics total practice questions recorded");

    // -------------------------------------------------------------------------
    // TEST 11: PRESERVATION OF SCHEDULED EXAMINATIONS (PHASE 1 REGRESSION CHECK)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 11] Phase 1 Scheduled Examinations Regression Check");
    const schedRes = await fetch(`${BACKEND_URL}/api/exams/EXAM-ICT-01`);
    testAssert(schedRes.status === 200, "Scheduled exam EXAM-ICT-01 accessible with HTTP 200");
    const schedExam = await schedRes.json();
    testAssert(schedExam.questions.length === 25, "Scheduled exam has 25 questions");
    testAssert(schedExam.questions[0].correctAnswer === undefined, "Scheduled exam answer keys strictly redacted");

    console.log("\n================================================================================");
    console.log(`TEST RUN COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================");

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error("Test Suite Unhandled Exception:", err);
    process.exit(1);
  }
}

runPracticeSuite();
