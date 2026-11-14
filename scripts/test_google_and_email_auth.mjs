process.env.NODE_ENV = "test";
process.env.ALLOW_TEST_MOCK_TOKENS = "true";

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import config from "../config/env.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import {
  googleAuth,
  registerEmail,
  login,
  forgotPasswordEmail,
  resetPasswordEmail,
  registerStudent,
  updateProfilePhone,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

await mongoose.connect(process.env.MONGO_URI);

console.log("================================================================");
console.log("🛡️  EXAMINO PRODUCTION REMEDIATION & SECURITY INTEGRATION SUITE");
console.log("================================================================\n");

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
    throw new Error(`Test assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
  testsPassed++;
}

// Clean up previous test users
const testSuffix = Date.now().toString().slice(-6);
const emailStudent = `student_${testSuffix}@example.com`;
const emailTeacher = `teacher_${testSuffix}@example.com`;
const emailOrg = `orgadmin_${testSuffix}@example.com`;
const googleUserEmail = `googleuser_${testSuffix}@gmail.com`;
const googleCoachingEmail = `googlecoach_${testSuffix}@gmail.com`;

// --------------------------------------------------------------------------
// TEST GROUP 1: JWT & ENVIRONMENT SECURITY
// --------------------------------------------------------------------------
console.log("\n--- TEST GROUP 1: JWT Configuration & Environment Security ---");

assert(
  typeof config.jwt.secret === "string" && config.jwt.secret.length >= 32,
  "Persistent cryptographically secure JWT_ACCESS_SECRET is configured"
);
assert(
  config.frontendUrl && config.frontendUrl.startsWith("http"),
  "Frontend URL is configured for secure redirection and email dispatch"
);

// --------------------------------------------------------------------------
// TEST GROUP 2: EMAIL REGISTRATION & ROLE VALIDATION
// --------------------------------------------------------------------------
console.log("\n--- TEST GROUP 2: Email Registration & Role Validation ---");

// 2.1 Invalid email format
const resBadEmail = createMockRes();
await registerEmail(
  {
    body: {
      name: "Bad Email",
      email: "not-an-email",
      password: "password123",
      confirmPassword: "password123",
    },
  },
  resBadEmail
);
assert(resBadEmail.statusCode === 400, "Reject registration with invalid email format");

// 2.2 Password mismatch
const resMismatch = createMockRes();
await registerEmail(
  {
    body: {
      name: "Mismatch",
      email: `mismatch_${testSuffix}@example.com`,
      password: "password123",
      confirmPassword: "password456",
    },
  },
  resMismatch
);
assert(resMismatch.statusCode === 400, "Reject registration when confirmPassword does not match");

// 2.3 Valid Student Registration
const resStudent = createMockRes();
await registerEmail(
  {
    body: {
      name: "Tanvir Rahman",
      email: emailStudent,
      password: "securePassword123!",
      confirmPassword: "securePassword123!",
      role: "student",
      level: "HSC 2026",
      group: "Science",
    },
  },
  resStudent
);
assert(resStudent.statusCode === 201 && resStudent.data.success, "Student registers with email successfully");
assert(resStudent.data.token && resStudent.data.user.role === "student", "Issues JWT token and assigns role 'student'");
assert(resStudent.data.redirectUrl === "/dashboard", "Student redirectUrl is '/dashboard'");

// 2.4 Duplicate email registration rejected
const resDuplicate = createMockRes();
await registerEmail(
  {
    body: {
      name: "Duplicate User",
      email: emailStudent,
      password: "anotherPassword123",
      confirmPassword: "anotherPassword123",
    },
  },
  resDuplicate
);
assert(resDuplicate.statusCode === 409, "Reject duplicate email registration with 409 Conflict");

// 2.5 Valid Teacher Registration
const resTeacher = createMockRes();
await registerEmail(
  {
    body: {
      name: "Prof. Shamsul",
      email: emailTeacher,
      password: "teacherPassword123!",
      confirmPassword: "teacherPassword123!",
      role: "tutor",
      designation: "Assistant Professor",
      institution: "Dhaka College",
    },
  },
  resTeacher
);
assert(resTeacher.statusCode === 201 && resTeacher.data.user.role === "tutor", "Teacher registers with email and gets role 'tutor'");
assert(resTeacher.data.redirectUrl === "/teacher", "Teacher redirectUrl is '/teacher'");

// 2.6 Valid Coaching / Org Admin Registration
const resOrg = createMockRes();
await registerEmail(
  {
    body: {
      name: "Hafizur Rahman",
      email: emailOrg,
      password: "orgPassword123!",
      confirmPassword: "orgPassword123!",
      role: "org_admin",
      orgName: `Nobodoy Coaching ${testSuffix}`,
      location: "Mirpur-10, Dhaka",
    },
  },
  resOrg
);
assert(resOrg.statusCode === 201 && resOrg.data.user.role === "org_admin", "Coaching director registers with email as 'org_admin'");
assert(resOrg.data.redirectUrl === "/organization", "Org Admin redirectUrl is '/organization'");

// --------------------------------------------------------------------------
// TEST GROUP 3: EMAIL LOGIN & CREDENTIALS VERIFICATION
// --------------------------------------------------------------------------
console.log("\n--- TEST GROUP 3: Email Login & Credentials Verification ---");

// 3.1 Successful login with correct credentials
const resLogin = createMockRes();
await login(
  {
    body: {
      identifier: emailStudent,
      password: "securePassword123!",
    },
  },
  resLogin
);
assert(resLogin.statusCode === 200 && resLogin.data.success, "Successful login with correct email and password");
assert(resLogin.data.token && resLogin.data.user.email === emailStudent, "Returns authenticated user profile and token");

// 3.2 Failed login with incorrect password
const resBadPass = createMockRes();
await login(
  {
    body: {
      identifier: emailStudent,
      password: "wrongPassword999",
    },
  },
  resBadPass
);
assert(resBadPass.statusCode === 401, "Reject login with incorrect password with 401 Unauthorized");

// 3.3 Failed login with non-existent email
const resNotFound = createMockRes();
await login(
  {
    body: {
      identifier: "nonexistent_email_12345@example.com",
      password: "somePassword123",
    },
  },
  resNotFound
);
assert(resNotFound.statusCode === 401, "Reject login with non-existent email with 401 Unauthorized");

// --------------------------------------------------------------------------
// TEST GROUP 4: SECURE PASSWORD RESET FLOW (No Public Token Leak)
// --------------------------------------------------------------------------
console.log("\n--- TEST GROUP 4: Secure Password Reset (Zero Token Exposure) ---");

// 4.1 Forgot Password Request MUST NOT return resetToken in response
const resForgot = createMockRes();
await forgotPasswordEmail(
  {
    body: {
      email: emailStudent,
    },
  },
  resForgot
);
assert(resForgot.statusCode === 200 && resForgot.data.success, "Forgot password responds with success message");
assert(resForgot.data.resetToken === undefined, "CRITICAL: Password reset token is NOT exposed in public API response");

// 4.2 Non-existent email also returns generic message (anti-enumeration defense)
const resForgotFake = createMockRes();
await forgotPasswordEmail(
  {
    body: {
      email: "fake_nonexistent_user@gmail.com",
    },
  },
  resForgotFake
);
assert(
  resForgotFake.statusCode === 200 && resForgotFake.data.success,
  "Anti-enumeration: non-existent email returns same generic success message"
);

// 4.3 Legitimate reset using signed token
const studentUser = await User.findOne({ email: emailStudent });
const validResetToken = jwt.sign(
  { id: studentUser._id, email: studentUser.email, purpose: "password_reset_email" },
  config.jwt.secret,
  { expiresIn: "15m" }
);

const resReset = createMockRes();
await resetPasswordEmail(
  {
    body: {
      email: emailStudent,
      resetToken: validResetToken,
      newPassword: "newSecurePassword456!",
      confirmPassword: "newSecurePassword456!",
    },
  },
  resReset
);
assert(resReset.statusCode === 200 && resReset.data.success, "Password updated successfully with valid reset token");

// 4.4 Old password fails
const resOldPassFail = createMockRes();
await login(
  {
    body: {
      identifier: emailStudent,
      password: "securePassword123!",
    },
  },
  resOldPassFail
);
assert(resOldPassFail.statusCode === 401, "Old password rejected after password reset");

// 4.5 New password succeeds
const resNewPassSuccess = createMockRes();
await login(
  {
    body: {
      identifier: emailStudent,
      password: "newSecurePassword456!",
    },
  },
  resNewPassSuccess
);
assert(resNewPassSuccess.statusCode === 200 && resNewPassSuccess.data.success, "New password successfully authenticates user");

// --------------------------------------------------------------------------
// TEST GROUP 5: GOOGLE AUTH, COACHING ONBOARDING & ESCALATION PREVENTION
// --------------------------------------------------------------------------
console.log("\n--- TEST GROUP 5: Google Auth & Coaching Onboarding ---");

const testMockSecret = process.env.TEST_MOCK_SECRET || "internal-test-key-only";

// 5.1 Reject invalid Google ID token
const resBadGoogle = createMockRes();
await googleAuth(
  {
    body: {
      idToken: "invalid_unauthenticated_token_xyz",
      desiredRole: "student",
    },
  },
  resBadGoogle
);
assert(resBadGoogle.statusCode === 401, "Reject unverified Google ID token with 401 Unauthorized");

// 5.2 Register new user via Google Sign-In as Student
const validNewGoogleToken = jwt.sign(
  {
    aud: "exam-platform-cf110",
    sub: `google_uid_${testSuffix}`,
    email: googleUserEmail,
    email_verified: true,
    name: "Google Student User",
    picture: "https://lh3.googleusercontent.com/a/sample-avatar",
  },
  testMockSecret,
  { expiresIn: "1h" }
);

const resNewGoogleUser = createMockRes();
await googleAuth(
  {
    body: {
      idToken: validNewGoogleToken,
      desiredRole: "student",
    },
  },
  resNewGoogleUser
);
assert(resNewGoogleUser.statusCode === 200 && resNewGoogleUser.data.isNewUser, "New user registered via Google Sign-In");
assert(resNewGoogleUser.data.user.role === "student", "Google user assigned 'student' role");
assert(resNewGoogleUser.data.redirectUrl === "/dashboard", "Google student directed to '/dashboard'");

// 5.3 Prevent Privilege Escalation via Google Auth
const resTamperRole = createMockRes();
await googleAuth(
  {
    body: {
      idToken: validNewGoogleToken,
      desiredRole: "super_admin",
    },
  },
  resTamperRole
);
assert(
  resTamperRole.data.user.role === "student" && resTamperRole.data.user.globalRole === "user",
  "Google Auth rejects desiredRole: 'super_admin' and preserves unprivileged role"
);

// 5.4 Coaching Google Registration without Org Name prompts Step 2 Onboarding
const validCoachingGoogleToken = jwt.sign(
  {
    aud: "exam-platform-cf110",
    sub: `google_coach_uid_${testSuffix}`,
    email: googleCoachingEmail,
    email_verified: true,
    name: "Coaching Director",
  },
  testMockSecret,
  { expiresIn: "1h" }
);

const resCoachNoName = createMockRes();
await googleAuth(
  {
    body: {
      idToken: validCoachingGoogleToken,
      desiredRole: "org_admin",
      // orgName omitted
    },
  },
  resCoachNoName
);
assert(
  resCoachNoName.statusCode === 400 && resCoachNoName.data.needsOrgOnboarding,
  "Coaching Google registration without organization name requires Step 2 onboarding"
);

// 5.5 Coaching Google Registration with Org Name creates Organization Workspace
const resCoachComplete = createMockRes();
await googleAuth(
  {
    body: {
      idToken: validCoachingGoogleToken,
      desiredRole: "org_admin",
      orgName: `Google Academy ${testSuffix}`,
      location: "Dhanmondi, Dhaka",
    },
  },
  resCoachComplete
);
assert(
  resCoachComplete.statusCode === 200 && resCoachComplete.data.user.role === "org_admin",
  "Coaching Google registration with organization name creates org_admin"
);
assert(
  resCoachComplete.data.redirectUrl === "/organization",
  "Coaching director directed to '/organization' workspace"
);
const createdOrg = await Organization.findOne({ name: `Google Academy ${testSuffix}` });
assert(createdOrg && createdOrg.ownerId.toString() === resCoachComplete.data.user.id.toString(), "Organization workspace created with verified ownership");

// 5.6 Existing Org Admin logging in with Google preserves their role
const validExistingOrgToken = jwt.sign(
  {
    aud: "exam-platform-cf110",
    sub: `google_org_uid_${testSuffix}`,
    email: emailOrg,
    email_verified: true,
    name: "Hafizur Rahman",
  },
  testMockSecret,
  { expiresIn: "1h" }
);

const resExistingOrgGoogle = createMockRes();
await googleAuth(
  {
    body: {
      idToken: validExistingOrgToken,
      desiredRole: "student", // client requests student, server preserves org_admin
    },
  },
  resExistingOrgGoogle
);
assert(resExistingOrgGoogle.statusCode === 200 && resExistingOrgGoogle.data.user.role === "org_admin", "Existing account preserves server-assigned role 'org_admin' without downgrade");

// --------------------------------------------------------------------------
// TEST GROUP 6: PHONE PROFILE UPDATE & ONBOARDING FOR GOOGLE USERS
// --------------------------------------------------------------------------
console.log("\n--- TEST GROUP 6: Phone Number Onboarding for Google Users ---");

const googleStudent = await User.findOne({ email: googleUserEmail });

// 6.1 Valid phone update
const resUpdatePhone = createMockRes();
await updateProfilePhone(
  {
    user: googleStudent,
    body: {
      phone: "01788776655",
    },
  },
  resUpdatePhone
);
assert(resUpdatePhone.statusCode === 200 && resUpdatePhone.data.success, "Google user can link verified phone number");
assert(resUpdatePhone.data.user.phone === "01788776655", "Normalized phone number saved to user profile");

// 6.2 Reject duplicate phone number
const anotherUser = await User.findOne({ email: emailTeacher });
const resDupPhone = createMockRes();
await updateProfilePhone(
  {
    user: anotherUser,
    body: {
      phone: "01788776655", // already used by googleStudent
    },
  },
  resDupPhone
);
assert(resDupPhone.statusCode === 409, "Reject linking duplicate mobile number with 409 Conflict");

// 6.3 Reject invalid phone number
const resInvalidPhone = createMockRes();
await updateProfilePhone(
  {
    user: anotherUser,
    body: {
      phone: "12345",
    },
  },
  resInvalidPhone
);
assert(resInvalidPhone.statusCode === 400, "Reject invalid non-Bangladeshi phone format with 400 Bad Request");

// --------------------------------------------------------------------------
// TEST GROUP 7: ROUTE PROTECTION & PHONE REGISTRATION REGRESSION
// --------------------------------------------------------------------------
console.log("\n--- TEST GROUP 7: Route Protection & Phone OTP Regression ---");

// 7.1 Unauthenticated request blocked by protect middleware
const resProtectNoToken = createMockRes();
let protectCalledNext = false;
await protect(
  {
    headers: {},
  },
  resProtectNoToken,
  () => {
    protectCalledNext = true;
  }
);
assert(!protectCalledNext && resProtectNoToken.statusCode === 401, "Unauthenticated request strictly blocked with 401 Unauthorized");

// 7.2 Phone registration without OTP remains blocked
const resPhoneNoOtp = createMockRes();
await registerStudent(
  {
    body: {
      name: "No OTP Phone User",
      phone: "01811223344",
      password: "password123",
    },
  },
  resPhoneNoOtp
);
assert(
  resPhoneNoOtp.statusCode === 400 && resPhoneNoOtp.data.message.includes("verification required"),
  "Phone registration without verified OTP remains blocked with 400"
);

// Clean up test records
await User.deleteMany({
  email: { $in: [emailStudent, emailTeacher, emailOrg, googleUserEmail, googleCoachingEmail] },
});
await Organization.deleteMany({
  $or: [
    { slug: new RegExp(`nobodoy-coaching-${testSuffix}`, "i") },
    { slug: new RegExp(`google-academy-${testSuffix}`, "i") },
  ],
});

console.log("\n================================================================");
console.log(`🎉 ALL ${testsPassed} / ${totalTests} REMEDIATION & SECURITY TESTS PASSED!`);
console.log("================================================================\n");

await mongoose.disconnect();
process.exit(0);
