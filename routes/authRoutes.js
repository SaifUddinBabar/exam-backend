import express from "express";
import {
  sendOtp,
  verifyOtp,
  registerStudent,
  registerTeacher,
  registerOrganization,
  login,
  firebaseLogin,
  googleAuth,
  registerEmail,
  forgotPasswordEmail,
  resetPasswordEmail,
  resetPassword,
  getMe,
  updateProfilePhone,
  register,
  teacherPasscodeLogin,
  getTeacherStudentsList,
  getTeacherStudentDetails,
  deleteTeacherStudent,
  updateFullProfile,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

// Brute-force protection for credential endpoints (per client IP).
const loginLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, key: "auth-login", by: "ip" });
const passcodeLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: "auth-passcode", by: "ip" });
const otpLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: "auth-otp", by: "ip" });

// Google OAuth Endpoint
router.post("/google", loginLimit, googleAuth);

// Email Registration Endpoint
router.post("/register/email", loginLimit, registerEmail);

// Email Password Reset Endpoints
router.post("/password/forgot-email", otpLimit, forgotPasswordEmail);
router.post("/password/reset-email", otpLimit, resetPasswordEmail);

// OTP Endpoints
router.post("/otp/send", otpLimit, sendOtp);
router.post("/otp/verify", otpLimit, verifyOtp);

// Role-Specific Explicit Registration Endpoints
router.post("/register/student", loginLimit, registerStudent);
router.post("/register/teacher", loginLimit, registerTeacher);
router.post("/register/organization", loginLimit, registerOrganization);
router.post("/register", loginLimit, register); // Legacy compatibility

// Common Login & Password Reset
router.post("/login", loginLimit, login);
router.post("/firebase-login", loginLimit, firebaseLogin);
router.post("/password/reset", otpLimit, resetPassword);
router.post("/teacher-verify", passcodeLimit, teacherPasscodeLogin);

// Teacher Directory & Student Management
router.get("/teacher/students", protect, getTeacherStudentsList);
router.get("/teacher/students/:studentId", protect, getTeacherStudentDetails);
router.delete("/teacher/students/:studentId", protect, deleteTeacherStudent);

// Profile
router.get("/me", protect, getMe);
router.put("/profile", protect, updateFullProfile);
router.put("/profile/phone", protect, updateProfilePhone);

export default router;
