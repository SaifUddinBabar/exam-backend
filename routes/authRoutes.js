import express from "express";
import {
  sendOtp,
  verifyOtp,
  registerStudent,
  registerTeacher,
  registerOrganization,
  login,
  resetPassword,
  getMe,
  register,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

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
router.post("/password/reset", resetPassword);

// Profile
router.get("/me", protect, getMe);

export default router;
