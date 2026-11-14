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

const router = express.Router();

// Google OAuth Endpoint
router.post("/google", googleAuth);

// Email Registration Endpoint
router.post("/register/email", registerEmail);

// Email Password Reset Endpoints
router.post("/password/forgot-email", forgotPasswordEmail);
router.post("/password/reset-email", resetPasswordEmail);

// OTP Endpoints
router.post("/otp/send", sendOtp);
router.post("/otp/verify", verifyOtp);

// Role-Specific Explicit Registration Endpoints
router.post("/register/student", registerStudent);
router.post("/register/teacher", registerTeacher);
router.post("/register/organization", registerOrganization);
router.post("/register", register); // Legacy compatibility

// Common Login & Password Reset
router.post("/login", login);
router.post("/firebase-login", firebaseLogin);
router.post("/password/reset", resetPassword);
router.post("/teacher-verify", teacherPasscodeLogin);

// Teacher Directory & Student Management
router.get("/teacher/students", protect, getTeacherStudentsList);
router.get("/teacher/students/:studentId", protect, getTeacherStudentDetails);
router.delete("/teacher/students/:studentId", protect, deleteTeacherStudent);

// Profile
router.get("/me", protect, getMe);
router.put("/profile", protect, updateFullProfile);
router.put("/profile/phone", protect, updateProfilePhone);

export default router;
