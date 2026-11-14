import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import "dotenv/config";
import User from "../models/User.js";
import {
  registerStudent,
  registerTeacher,
  registerOrganization,
  firebaseLogin,
  login,
  resetPassword,
} from "../controllers/authController.js";
import { getAllExams } from "../controllers/examController.js";

await mongoose.connect(process.env.MONGO_URI);

console.log("====================================================");
console.log("🛡️  EXAMINO STRICT SECURITY AUDIT & PENETRATION TESTS");
console.log("====================================================\n");

const createMockRes = () => {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.data = obj;
      return this;
    },
  };
  return res;
};

let testsPassed = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Security Test Failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
  testsPassed++;
}

// --------------------------------------------------------------------------
// TEST 1: Unverified Registration MUST Be Blocked
// --------------------------------------------------------------------------
console.log("--- 1. Testing Registration Without Valid OTP ---");
const unverifiedStudentRes = createMockRes();
await registerStudent(
  {
    body: {
      name: "Hacker User",
      phone: "01799887766",
      password: "password123",
      // No verificationToken and no firebaseToken
    },
  },
  unverifiedStudentRes
);
assert(
  unverifiedStudentRes.statusCode === 400 &&
    unverifiedStudentRes.data?.message?.includes("verification required"),
  "Student registration without verified OTP returns 400 Bad Request"
);

const unverifiedTeacherRes = createMockRes();
await registerTeacher(
  {
    body: {
      name: "Hacker Teacher",
      phone: "01899887766",
      password: "password123",
    },
  },
  unverifiedTeacherRes
);
assert(
  unverifiedTeacherRes.statusCode === 400,
  "Teacher registration without verified OTP returns 400 Bad Request"
);

// --------------------------------------------------------------------------
// TEST 2: Forged / Fake Firebase Tokens MUST Be Rejected
// --------------------------------------------------------------------------
console.log("\n--- 2. Testing Forged Firebase Token Rejection ---");
const forgedToken = jwt.sign(
  {
    iss: "https://securetoken.google.com/exam-platform-cf110",
    aud: "exam-platform-cf110",
    sub: "forged_uid_999",
    phone_number: "+8801810993792", // attempting to hijack existing user
  },
  "attacker-fake-private-key"
);

const fakeTokenLoginRes = createMockRes();
await firebaseLogin(
  {
    body: {
      idToken: forgedToken,
    },
  },
  fakeTokenLoginRes
);
assert(
  fakeTokenLoginRes.statusCode === 401 && fakeTokenLoginRes.data?.success === false,
  "Forged/self-signed Firebase token is strictly rejected with 401 Unauthorized"
);

const fakeTokenRegisterRes = createMockRes();
await registerStudent(
  {
    body: {
      name: "Attacker",
      phone: "01711223344",
      password: "password123",
      firebaseToken: forgedToken,
    },
  },
  fakeTokenRegisterRes
);
assert(
  fakeTokenRegisterRes.statusCode === 400,
  "Registration with forged Firebase token is strictly blocked"
);

// --------------------------------------------------------------------------
// TEST 3: Role Escalation via Request Body MUST Be Blocked
// --------------------------------------------------------------------------
console.log("\n--- 3. Testing Role Escalation Prevention ---");
// Create a temporary verified OTP record to test role assignment security
const tempPhone = "01799112233";
const OtpVerification = (await import("../models/OtpVerification.js")).default;
const crypto = await import("crypto");
const tempToken = crypto.randomBytes(24).toString("hex");

await OtpVerification.create({
  phone: tempPhone,
  purpose: "registration",
  otpHash: "mock_hash_for_test",
  resendAvailableAt: new Date(),
  verificationToken: tempToken,
  isVerified: true,
  expiresAt: new Date(Date.now() + 60000),
});

const exploitRes = createMockRes();
await registerStudent(
  {
    body: {
      name: "Role Exploit Attempt",
      phone: tempPhone,
      password: "password123",
      verificationToken: tempToken,
      role: "super_admin", // Attempt role escalation to super_admin
      globalRole: "super_admin",
    },
  },
  exploitRes
);

const createdUser = await User.findOne({ phone: tempPhone });
assert(
  exploitRes.statusCode === 201 && createdUser.role === "student" && createdUser.globalRole === "user",
  "Role manipulation in request body is ignored: user created strictly as student/user"
);

// Clean up
await User.deleteOne({ phone: tempPhone });

// --------------------------------------------------------------------------
// TEST 4: Phone Mismatch Protection (Token for Phone A cannot register Phone B)
// --------------------------------------------------------------------------
console.log("\n--- 4. Testing Phone Mismatch Protection ---");
// Even in test mode, token phone MUST match registration phone
process.env.NODE_ENV = "test";
process.env.ALLOW_TEST_MOCK_TOKENS = "true";
process.env.TEST_MOCK_SECRET = "security-test-internal-key-999";

const tokenPhoneA = jwt.sign(
  {
    iss: "https://securetoken.google.com/exam-platform-cf110",
    aud: "exam-platform-cf110",
    sub: "uid_phone_a",
    phone_number: "+8801700000001", // Phone A
  },
  process.env.TEST_MOCK_SECRET
);

const mismatchRes = createMockRes();
await registerStudent(
  {
    body: {
      name: "Mismatch Attacker",
      phone: "01700000002", // Phone B
      password: "password123",
      firebaseToken: tokenPhoneA,
    },
  },
  mismatchRes
);
assert(
  mismatchRes.statusCode === 400 && mismatchRes.data?.message?.includes("verification required"),
  "Token for Phone A CANNOT register Phone B (Mismatch strictly rejected)"
);

// --------------------------------------------------------------------------
// TEST 5: Password Reset Security (Requires Verified OTP)
// --------------------------------------------------------------------------
console.log("\n--- 5. Testing Password Reset Security ---");
const unverifiedResetRes = createMockRes();
await resetPassword(
  {
    body: {
      phone: "01810993792",
      newPassword: "hijackedPassword123",
      // No valid OTP or token
    },
  },
  unverifiedResetRes
);
assert(
  unverifiedResetRes.statusCode === 400,
  "Password reset without valid OTP or token is rejected with 400"
);

// --------------------------------------------------------------------------
// TEST 6: Student Blocked From Teacher APIs (Least Privilege Boundary)
// --------------------------------------------------------------------------
console.log("\n--- 6. Testing Student Least-Privilege API Boundary ---");
const studentApiRes = createMockRes();
await getAllExams(
  {
    user: {
      _id: new mongoose.Types.ObjectId(),
      role: "student",
      globalRole: "user",
    },
    query: {},
  },
  studentApiRes
);
assert(
  studentApiRes.statusCode === 403,
  "Student is strictly blocked from calling teacher/admin exam listing (403 Forbidden)"
);

// Reset test flags
delete process.env.ALLOW_TEST_MOCK_TOKENS;
delete process.env.TEST_MOCK_SECRET;

console.log("\n====================================================");
console.log(`🛡️  AUDIT COMPLETE: ${testsPassed} of ${totalTests} TESTS PASSED!`);
console.log("====================================================");

await mongoose.disconnect();
process.exit(0);
