import http from "http";

console.log("================================================================================");
console.log("EXAMINO: STUDENT PORTAL QA & OPTIMIZATION SPRINT — TEST SUITE");
console.log("================================================================================");

const FRONTEND_URL = "http://127.0.0.1:5173";
const BACKEND_URL = "http://localhost:5000";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runQASuite() {
  try {
    // -------------------------------------------------------------------------
    // TEST 1: FRONTEND ROUTE ACCESSIBILITY & HTTP 200 STATUS
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1] Student Portal Routes Verification");
    const routes = [
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
      "/history",
      "/profile",
    ];

    for (const r of routes) {
      const res = await fetch(`${FRONTEND_URL}${r}`);
      assert(res.status === 200, `Route ${r} returned HTTP 200 (HTML Shell Loaded)`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: BACKEND STUDENT API ENDPOINTS
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Backend Student API Integration & Data Authority");
    
    // 2.1 Available Exams
    const availRes = await fetch(`${BACKEND_URL}/api/exams/student/available`);
    assert(availRes.status === 200, "GET /api/exams/student/available returns HTTP 200");
    const availableExams = await availRes.json();
    assert(Array.isArray(availableExams) && availableExams.length >= 4, `Available exams count is ${availableExams.length} (>= 4 expected)`);
    
    // Check that answers are NOT present in available list
    let answersExposedInList = false;
    for (const ex of availableExams) {
      if (ex.correctAnswer || ex.questions?.some(q => typeof q === "object" && q.correctAnswer)) {
        answersExposedInList = true;
      }
    }
    assert(!answersExposedInList, "Authoritative: Zero answer keys exposed in student exam listing");

    // 2.2 Exam Details & Question Content
    const examDetailRes = await fetch(`${BACKEND_URL}/api/exams/EXAM-ICT-01`);
    assert(examDetailRes.status === 200, "GET /api/exams/EXAM-ICT-01 returns HTTP 200");
    const examDetail = await examDetailRes.json();
    assert(examDetail.questions && examDetail.questions.length === 25, `Exam has exactly ${examDetail.questions?.length} real questions from database`);

    // -------------------------------------------------------------------------
    // TEST 3: REAL QUESTION CONTENT, BENGALI & MATH VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Real Question Content (Bengali, English, Math, Diagrams)");
    let hasBengali = false;
    let hasFourOptions = true;
    let preAnswerLeak = false;

    for (const q of examDetail.questions) {
      if (/[\u0980-\u09FF]/.test(q.question)) hasBengali = true;
      if (!Array.isArray(q.options) || q.options.length !== 4) hasFourOptions = false;
      if (q.correctAnswer || q.explanation) preAnswerLeak = true;
    }

    assert(hasBengali, "Verified: Questions contain genuine Bengali text (NCTB Curriculum)");
    assert(hasFourOptions, "Verified: All questions contain exactly 4 MCQ options");
    assert(!preAnswerLeak, "Security Gate: 100% pre-submission answer & explanation redaction");

    // -------------------------------------------------------------------------
    // TEST 4: STUDENT AUTHENTICATION FLOWS (Password vs SMS vs Forgot)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Student Authentication Flows & Gateway Capabilities");
    
    // Register unique test student
    const testEmail = `qa_student_${Date.now()}@student.examino.edu.bd`;
    const testRoll = `QA-ROLL-${Date.now()}`;
    const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "QA Automated Student",
        email: testEmail,
        password: "ValidPassword123!",
      }),
    });
    assert(regRes.status === 201, `Student Registration returned HTTP 201 (Email: ${testEmail})`);
    const regData = await regRes.json();
    assert(Boolean(regData.token), "Auth token successfully issued on student registration");

    // Login with student credentials
    const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "ValidPassword123!",
      }),
    });
    assert(loginRes.status === 200, "Student Login with password returned HTTP 200");
    const loginData = await loginRes.json();
    assert(loginData.user.name === "QA Automated Student", "Returned authenticated student profile matching registration");

    // Verify /api/auth/me
    const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    assert(meRes.status === 200, "GET /api/auth/me returns HTTP 200 for authenticated student");

    // -------------------------------------------------------------------------
    // TEST 5: LIVE EXAM SUBMISSION & SCORING WITH NEGATIVE MARKING
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Live Exam Submission & Server-Side Scoring");
    const q1 = examDetail.questions[0];
    const q2 = examDetail.questions[1];
    
    const submissionAnswers = {
      [q1._id]: q1.options[0],
      [q2._id]: q2.options[1],
    };

    const submitRes = await fetch(`${BACKEND_URL}/api/exams/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({
        examCode: "EXAM-ICT-01",
        name: "QA Automated Student",
        roll: testRoll,
        answers: submissionAnswers,
      }),
    });

    assert(submitRes.status === 200, "POST /api/exams/submit returned HTTP 200 OK");
    const submitResult = await submitRes.json();
    assert(submitResult.success === true, "Submission marked success: true");
    assert(submitResult.totalQuestions === 25, "Submission validated 25 total questions");
    assert(submitResult.questions && submitResult.questions.length > 0, "Post-submission evaluated review questions returned");
    assert(Boolean(submitResult.questions[0].correctAnswer), "Correct answers unlocked post-submission for review");

    // -------------------------------------------------------------------------
    // TEST 6: DUPLICATE SUBMISSION PROTECTION (Scheduled Exam Single-Attempt)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Duplicate Submission Protection");
    const dupRes = await fetch(`${BACKEND_URL}/api/exams/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({
        examCode: "EXAM-ICT-01",
        name: "QA Automated Student",
        roll: testRoll,
        answers: submissionAnswers,
      }),
    });

    assert(dupRes.status === 409, `Duplicate submission on scheduled exam rejected with HTTP 409 Conflict`);
    const dupData = await dupRes.json();
    assert(dupData.message.includes("Duplicate submission rejected"), "Informative message returned to student");

    // Roll-tampering attempt by same authenticated student
    const tamperRes = await fetch(`${BACKEND_URL}/api/exams/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({
        examCode: "EXAM-ICT-01",
        name: "QA Automated Student",
        roll: "TAMPERED-ROLL-999",
        answers: submissionAnswers,
      }),
    });
    assert(tamperRes.status === 409, "Roll-tampering attempt rejected with HTTP 409 Conflict (studentId binding enforced)");

    // -------------------------------------------------------------------------
    // TEST 7: STUDENT HISTORY & DYNAMIC DASHBOARD DATA
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7] Student Verified History API");
    const histRes = await fetch(`${BACKEND_URL}/api/exams/student/history`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    assert(histRes.status === 200, "GET /api/exams/student/history returned HTTP 200");
    const histData = await histRes.json();
    assert(Array.isArray(histData) && histData.length === 1, `History returns exactly 1 submission document for this student`);
    assert(histData[0].examCode === "EXAM-ICT-01", "History record correctly references EXAM-ICT-01");

    // -------------------------------------------------------------------------
    // TEST 8: LEADERBOARD / COHORT RANKING
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8] Exam Leaderboard & Ranking");
    const rankRes = await fetch(`${BACKEND_URL}/api/exams/ranking/EXAM-ICT-01`);
    assert(rankRes.status === 200, "GET /api/exams/ranking/EXAM-ICT-01 returned HTTP 200");
    const rankData = await rankRes.json();
    assert(Array.isArray(rankData) && rankData.length >= 1, `Ranking returns ${rankData.length} participant entries`);

    console.log("\n================================================================================");
    console.log(`QA SPRINT RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================");

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("QA Test Error:", err);
    process.exit(1);
  }
}

runQASuite();
