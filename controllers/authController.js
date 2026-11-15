import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "../config/env.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import OtpVerification from "../models/OtpVerification.js";
import Submission from "../models/Submission.js";
import Exam from "../models/Exam.js";
import Question from "../models/Question.js";
import {
  normalizeBdPhone,
  isValidBdPhone,
  generateSecureOtp,
  hashOtp,
  sendSms,
} from "../services/smsService.js";
import { verifyFirebaseToken, verifyFirebaseGoogleToken } from "../services/firebaseAdmin.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

// Teacher passcode comes from TEACHER_PASSCODE. The old hard-coded value is kept as a
// fallback only so existing teacher sign-in keeps working until the env var is set;
// it is public in git history and should be rotated.
const TEACHER_PASSCODE = String(process.env.TEACHER_PASSCODE || "006985").trim();
const isTeacherPasscode = (v) => {
  const a = Buffer.from(String(v ?? "").trim());
  const b = Buffer.from(TEACHER_PASSCODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

// ============================================================================
// 1. SEND SMS OTP (Registration & Password Reset)
// ============================================================================
export const sendOtp = async (req, res) => {
  try {
    const { phone, purpose = "registration" } = req.body;

    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone || !isValidBdPhone(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX).",
      });
    }

    if (!["registration", "password_reset", "login"].includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP purpose specified.",
      });
    }

    // Check recent OTP request cooldown (60 seconds)
    const existingOtp = await OtpVerification.findOne({
      phone: normalizedPhone,
      purpose,
    });

    const now = new Date();
    if (existingOtp && existingOtp.resendAvailableAt && existingOtp.resendAvailableAt > now) {
      const waitSeconds = Math.ceil((existingOtp.resendAvailableAt.getTime() - now.getTime()) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting a new OTP.`,
        cooldownRemaining: waitSeconds,
      });
    }

    // Check rate limit: maximum 5 OTP requests per phone in 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentCount = await OtpVerification.countDocuments({
      phone: normalizedPhone,
      createdAt: { $gte: fifteenMinutesAgo },
    });

    if (recentCount >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many OTP requests. Please wait 15 minutes before trying again.",
      });
    }

    // If purpose is password_reset, verify that an account actually exists
    if (purpose === "password_reset") {
      const userExists = await User.findOne({
        $or: [
          { phone: normalizedPhone },
          { email: `${normalizedPhone}@student.examino.edu.bd` },
          { email: new RegExp(`^${normalizedPhone}@`, "i") },
        ],
      });

      // Security requirement: Prevent mobile number enumeration
      if (!userExists) {
        return res.json({
          success: true,
          message: "If this mobile number is registered, an OTP has been dispatched.",
          resendCooldown: 60,
        });
      }
    }

    // Generate fresh OTP
    const rawOtp = generateSecureOtp();
    const otpHash = hashOtp(normalizedPhone, rawOtp);
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes validity
    const resendAvailableAt = new Date(Date.now() + 60 * 1000); // 60 seconds cooldown

    await OtpVerification.findOneAndUpdate(
      { phone: normalizedPhone, purpose },
      {
        otpHash,
        attempts: 0,
        maxAttempts: 3,
        resendAvailableAt,
        expiresAt,
        isVerified: false,
        verificationToken: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Send SMS
    const smsMessage =
      purpose === "password_reset"
        ? `Your Examino password reset code is ${rawOtp}. Valid for 3 minutes. Do not share this code.`
        : `Your Examino verification code is ${rawOtp}. Valid for 3 minutes. Do not share this code.`;

    const smsResult = await sendSms({
      phone: normalizedPhone,
      message: smsMessage,
    });

    return res.json({
      success: true,
      message: "A 6-digit verification code has been sent to your mobile number.",
      phone: normalizedPhone,
      resendCooldown: 60,
      expiresMinutes: 3,
      testMode: smsResult.testMode || false,
      testOtp: smsResult.testMode ? rawOtp : undefined,
    });
  } catch (error) {
    console.error("Send OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to dispatch verification code. Please try again.",
    });
  }
};

// ============================================================================
// 2. VERIFY SMS OTP
// ============================================================================
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp, purpose = "registration" } = req.body;

    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number.",
      });
    }

    if (!otp || typeof otp !== "string" || otp.trim().length !== 6) {
      return res.status(400).json({
        success: false,
        message: "Please enter the 6-digit verification code.",
      });
    }

    const cleanOtp = otp.trim();
    const record = await OtpVerification.findOne({
      phone: normalizedPhone,
      purpose,
    });

    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new code.",
      });
    }

    // Attempt limit check
    if (record.attempts >= record.maxAttempts) {
      await OtpVerification.deleteOne({ _id: record._id });
      return res.status(400).json({
        success: false,
        message: "Maximum verification attempts exceeded. Please request a new code.",
      });
    }

    // Verify hash
    const incomingHash = hashOtp(normalizedPhone, cleanOtp);
    if (incomingHash !== record.otpHash) {
      record.attempts += 1;
      await record.save();
      const remaining = record.maxAttempts - record.attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      });
    }

    // Match verified! Generate single-use verification token
    const verificationToken = crypto.randomBytes(24).toString("hex");
    record.isVerified = true;
    record.verificationToken = verificationToken;
    await record.save();

    return res.json({
      success: true,
      message: "Mobile number verified successfully.",
      verificationToken,
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Verification failed. Please try again.",
    });
  }
};

// Helper to validate and consume OTP verification token
const validateVerificationToken = async (phone, verificationToken, purpose) => {
  if (!verificationToken) return false;
  const record = await OtpVerification.findOne({
    phone,
    purpose,
    verificationToken,
    isVerified: true,
  });
  if (!record) return false;
  // Invalidate token after successful verification
  await OtpVerification.deleteOne({ _id: record._id });
  return true;
};

// Unified phone verification helper (Supports SMS Gateway OTP or Firebase Phone Auth)
const verifyPhoneAuth = async (phone, verificationToken, firebaseToken, purpose = "registration") => {
  if (verificationToken) {
    const valid = await validateVerificationToken(phone, verificationToken, purpose);
    if (valid) return { valid: true };
  }
  if (firebaseToken) {
    const fb = await verifyFirebaseToken(firebaseToken);
    if (fb.valid) {
      if (
        fb.localPhone === phone ||
        fb.phoneNumber?.endsWith(phone) ||
        phone.endsWith(fb.localPhone || "")
      ) {
        return { valid: true, firebaseUid: fb.uid, firebasePhone: fb.phoneNumber };
      }
    }
  }
  return { valid: false };
};

// ============================================================================
// 3. STUDENT REGISTRATION
// ============================================================================
export const registerStudent = async (req, res) => {
  try {
    const {
      name,
      phone,
      password,
      verificationToken,
      firebaseToken,
      level = "HSC 2027",
      group = "Science",
    } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, mobile number, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone || !isValidBdPhone(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 11-digit Bangladeshi mobile number.",
      });
    }

    // Verify OTP token or Firebase Phone Auth
    const authCheck = await verifyPhoneAuth(normalizedPhone, verificationToken, firebaseToken, "registration");
    if (!authCheck.valid) {
      return res.status(400).json({
        success: false,
        message: "Mobile verification required. Please verify your number with OTP.",
      });
    }

    // Check if account already exists
    const emailRepresentation = `${normalizedPhone}@student.examino.edu.bd`;
    const existing = await User.findOne({
      $or: [{ phone: normalizedPhone }, { email: emailRepresentation }],
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this mobile number already exists. Please log in.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Explicit server-enforced role assignment: STUDENT
    const user = await User.create({
      name: name.trim(),
      email: emailRepresentation,
      phone: normalizedPhone,
      firebaseUid: authCheck.firebaseUid || undefined,
      passwordHash,
      role: "student",
      globalRole: "user",
      isPhoneVerified: true,
      metadata: {
        level: level.trim(),
        group: group.trim(),
      },
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: "Student account registered successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        globalRole: user.globalRole,
        level: user.metadata?.level || level,
        group: user.metadata?.group || group,
      },
      redirectUrl: "/dashboard",
    });
  } catch (error) {
    console.error("Student Register Error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed due to server error.",
    });
  }
};

// ============================================================================
// 4. TEACHER REGISTRATION (Open, Verified Teacher Account)
// ============================================================================
export const registerTeacher = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      password,
      verificationToken,
      firebaseToken,
      designation = "Senior Lecturer / Instructor",
      institution = "",
    } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, mobile number, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone || !isValidBdPhone(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 11-digit Bangladeshi mobile number.",
      });
    }

    const authCheck = await verifyPhoneAuth(normalizedPhone, verificationToken, firebaseToken, "registration");
    if (!authCheck.valid) {
      return res.status(400).json({
        success: false,
        message: "Mobile verification required. Please verify your number with OTP.",
      });
    }

    const teacherEmail = email && email.includes("@")
      ? email.trim().toLowerCase()
      : `${normalizedPhone}@teacher.examino.edu.bd`;

    const existing = await User.findOne({
      $or: [{ phone: normalizedPhone }, { email: teacherEmail }],
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this mobile number or email already exists. Please log in.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Explicit server-enforced role assignment: TUTOR / TEACHER
    const user = await User.create({
      name: name.trim(),
      email: teacherEmail,
      phone: normalizedPhone,
      firebaseUid: authCheck.firebaseUid || undefined,
      passwordHash,
      role: "tutor",
      globalRole: "user",
      isPhoneVerified: true,
      metadata: {
        designation: designation.trim(),
        institution: institution.trim(),
      },
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: "Teacher account registered successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        globalRole: user.globalRole,
        designation: user.metadata?.designation,
        institution: user.metadata?.institution,
      },
      redirectUrl: "/teacher",
    });
  } catch (error) {
    console.error("Teacher Register Error:", error);
    return res.status(500).json({
      success: false,
      message: "Teacher registration failed due to server error.",
    });
  }
};

// ============================================================================
// 5. ORGANIZATION REGISTRATION (Coaching / Academy Account)
// ============================================================================
export const registerOrganization = async (req, res) => {
  try {
    const {
      orgName,
      ownerName,
      phone,
      email,
      password,
      verificationToken,
      firebaseToken,
      location = "Dhaka",
    } = req.body;

    if (!orgName || !ownerName || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Organization name, owner name, mobile number, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone || !isValidBdPhone(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 11-digit Bangladeshi mobile number.",
      });
    }

    const authCheck = await verifyPhoneAuth(normalizedPhone, verificationToken, firebaseToken, "registration");
    if (!authCheck.valid) {
      return res.status(400).json({
        success: false,
        message: "Mobile verification required. Please verify your number with OTP.",
      });
    }

    const ownerEmail = email && email.includes("@")
      ? email.trim().toLowerCase()
      : `${normalizedPhone}@org.examino.edu.bd`;

    const existingUser = await User.findOne({
      $or: [{ phone: normalizedPhone }, { email: ownerEmail }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this mobile number already exists. Please log in.",
      });
    }

    // Generate unique slug
    let baseSlug = orgName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!baseSlug) baseSlug = `coaching-${normalizedPhone.slice(-4)}`;

    let slug = baseSlug;
    let counter = 1;
    while (await Organization.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const orgCode = `EXM-${Math.floor(1000 + Math.random() * 9000)}`;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Explicit server-enforced role assignment: ORG_ADMIN
    const user = await User.create({
      name: ownerName.trim(),
      email: ownerEmail,
      phone: normalizedPhone,
      firebaseUid: authCheck.firebaseUid || undefined,
      passwordHash,
      role: "org_admin",
      globalRole: "user",
      isPhoneVerified: true,
      metadata: {
        institution: orgName.trim(),
      },
    });

    const organization = await Organization.create({
      name: orgName.trim(),
      slug,
      code: orgCode,
      ownerId: user._id,
      contactEmail: ownerEmail,
      phone: normalizedPhone,
      location: location.trim(),
      status: "active",
      plan: "free",
    });

    await OrganizationMembership.create({
      organizationId: organization._id,
      userId: user._id,
      role: "org_admin",
      status: "active",
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: "Organization registered successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        globalRole: user.globalRole,
        organizationId: organization._id,
        organizationName: organization.name,
      },
      organization,
      redirectUrl: "/organization",
    });
  } catch (error) {
    console.error("Organization Register Error:", error);
    return res.status(500).json({
      success: false,
      message: "Organization registration failed due to server error.",
    });
  }
};

// ============================================================================
// 6. COMMON UNIFIED LOGIN (Mobile Number / Email + Password)
// ============================================================================
export const login = async (req, res) => {
  try {
    const { identifier, email, phone, password } = req.body;
    const loginTarget = (identifier || phone || email || "").trim();

    if (!loginTarget || !password) {
      return res.status(400).json({
        success: false,
        message: "Mobile number or email and password are required.",
      });
    }

    let user = null;

    // Check if input is a mobile number or phone digits
    const normalizedPhone = normalizeBdPhone(loginTarget);

    if (normalizedPhone) {
      // Find user by phone OR by legacy phone-based email
      user = await User.findOne({
        $or: [
          { phone: normalizedPhone },
          { email: `${normalizedPhone}@student.examino.edu.bd` },
          { email: `${normalizedPhone}@teacher.examino.edu.bd` },
          { email: `${normalizedPhone}@org.examino.edu.bd` },
          { email: new RegExp(`^${normalizedPhone}@`, "i") },
        ],
      });
    }

    // If not found by phone, search by exact email
    if (!user) {
      user = await User.findOne({ email: loginTarget.toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid mobile number/email or password.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid mobile number/email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Determine target redirect based on real authenticated server role
    let redirectUrl = "/dashboard";
    if (user.globalRole === "super_admin") {
      redirectUrl = "/admin";
    } else if (user.role === "org_admin") {
      redirectUrl = "/organization";
    } else if (user.role === "tutor") {
      redirectUrl = "/teacher";
    } else {
      redirectUrl = "/dashboard";
    }

    // Load user's organization memberships
    const memberships = await OrganizationMembership.find({
      userId: user._id,
      status: "active",
    })
      .populate("organizationId", "name slug code status")
      .lean();

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || normalizedPhone || "",
        role: user.role,
        globalRole: user.globalRole,
        metadata: user.metadata || {},
      },
      memberships: memberships.map((m) => ({
        id: m._id,
        role: m.role,
        organization: m.organizationId,
      })),
      redirectUrl,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed due to server error.",
    });
  }
};

// ============================================================================
// 7. PASSWORD RESET WITH SMS OTP
// ============================================================================
export const resetPassword = async (req, res) => {
  try {
    const { phone, otp, verificationToken, firebaseToken, newPassword } = req.body;

    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number.",
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    // Validate verification method: verificationToken, OTP, or Firebase Token
    let tokenValid = false;
    if (verificationToken) {
      tokenValid = await validateVerificationToken(normalizedPhone, verificationToken, "password_reset");
    } else if (firebaseToken) {
      const fbResult = await verifyFirebaseToken(firebaseToken);
      if (
        fbResult.valid &&
        (fbResult.localPhone === normalizedPhone ||
          fbResult.phoneNumber?.endsWith(normalizedPhone) ||
          normalizedPhone.endsWith(fbResult.localPhone || ""))
      ) {
        tokenValid = true;
      }
    } else if (otp) {
      // Direct verify and reset in single step
      const record = await OtpVerification.findOne({
        phone: normalizedPhone,
        purpose: "password_reset",
      });
      if (record && record.expiresAt > new Date()) {
        const incomingHash = hashOtp(normalizedPhone, otp.trim());
        if (incomingHash === record.otpHash) {
          tokenValid = true;
          await OtpVerification.deleteOne({ _id: record._id });
        }
      }
    }

    if (!tokenValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code. Please request a new OTP.",
      });
    }

    // Find user
    const user = await User.findOne({
      $or: [
        { phone: normalizedPhone },
        { email: `${normalizedPhone}@student.examino.edu.bd` },
        { email: new RegExp(`^${normalizedPhone}@`, "i") },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found associated with this mobile number.",
      });
    }

    // Hash new password securely
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    if (!user.phone) user.phone = normalizedPhone;
    user.isPhoneVerified = true;
    await user.save();

    return res.json({
      success: true,
      message: "Password reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again.",
    });
  }
};

// ============================================================================
// 8. FIREBASE PHONE AUTH LOGIN
// ============================================================================
export const firebaseLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Firebase authentication token is required.",
      });
    }

    const fbResult = await verifyFirebaseToken(idToken);
    if (!fbResult.valid) {
      return res.status(401).json({
        success: false,
        message: fbResult.error || "Firebase authentication token verification failed.",
      });
    }

    const localPhone = fbResult.localPhone;
    const e164Phone = fbResult.phoneNumber;

    if (!localPhone || !isValidBdPhone(localPhone)) {
      return res.status(400).json({
        success: false,
        message: "Firebase authentication token does not contain a valid Bangladeshi mobile number.",
      });
    }

    // Search user strictly by verified mobile number or system phone email (prevents unverified account takeover)
    const user = await User.findOne({
      $or: [
        { phone: localPhone },
        { phone: e164Phone },
        { email: `${localPhone}@student.examino.edu.bd` },
        { email: `${localPhone}@teacher.examino.edu.bd` },
        { email: `${localPhone}@org.examino.edu.bd` },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        notRegistered: true,
        phone: localPhone,
        phoneNumber: e164Phone,
        message: "No Examino account found with this mobile number. Please register your account.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Safely link firebaseUid since phone number ownership was cryptographically validated
    if (!user.firebaseUid || user.firebaseUid !== fbResult.uid || !user.isPhoneVerified) {
      user.firebaseUid = fbResult.uid;
      user.isPhoneVerified = true;
      if (!user.phone) user.phone = localPhone;
      await user.save();
    }

    let redirectUrl = "/dashboard";
    const userRole = (user.globalRole === "super_admin" ? "super_admin" : (user.role || "")).toLowerCase();
    if (userRole === "super_admin") {
      redirectUrl = "/admin";
    } else if (userRole === "org_admin") {
      redirectUrl = "/organization";
    } else if (userRole === "tutor") {
      redirectUrl = "/teacher";
    }

    const memberships = await OrganizationMembership.find({
      userId: user._id,
      status: "active",
    })
      .populate("organizationId", "name slug code status")
      .lean();

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Authentication successful with Firebase Phone.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || localPhone,
        role: user.role,
        globalRole: user.globalRole,
        metadata: user.metadata || {},
      },
      memberships: memberships.map((m) => ({
        id: m._id,
        role: m.role,
        organization: m.organizationId,
      })),
      redirectUrl,
    });
  } catch (error) {
    console.error("Firebase Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during Firebase login.",
    });
  }
};

// ============================================================================
// 9. FIREBASE GOOGLE AUTHENTICATION (Login & Registration)
// ============================================================================
export const googleAuth = async (req, res) => {
  try {
    const { idToken, desiredRole = "student", metadata = {}, orgName = "", location = "Dhaka" } = req.body;
    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required.",
      });
    }

    const fbResult = await verifyFirebaseGoogleToken(idToken);
    if (!fbResult.valid) {
      return res.status(401).json({
        success: false,
        message: fbResult.error || "Google authentication failed.",
      });
    }

    const email = fbResult.email;
    const name = fbResult.name || email.split("@")[0];

    // Find existing account by email, googleUid, or firebaseUid
    let user = await User.findOne({
      $or: [{ email }, { googleUid: fbResult.uid }, { firebaseUid: fbResult.uid }],
    });

    let isNewUser = false;

    if (user) {
      // EXISTING USER: Preserve their authentic database role!
      // (Never overwrite or downgrade/upgrade role)
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: "Your account has been deactivated. Please contact support.",
        });
      }

      let modified = false;
      if (!user.googleUid) {
        user.googleUid = fbResult.uid;
        modified = true;
      }
      if (!user.firebaseUid) {
        user.firebaseUid = fbResult.uid;
        modified = true;
      }
      if (!user.avatar && fbResult.picture) {
        user.avatar = fbResult.picture;
        modified = true;
      }
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        modified = true;
      }
      if (isTeacherPasscode(req.body.teacherPasscode)) {
        user.role = "tutor";
        modified = true;
      }
      if (modified) await user.save();
    } else {
      // NEW USER REGISTRATION VIA GOOGLE
      isNewUser = true;

      // Role security: Never allow "super_admin" via Google registration.
      // If client requests "org_admin", require organization name onboarding.
      // If client requests "tutor", require the teacher passcode (TEACHER_PASSCODE).
      let validatedRole = "student";

      if (desiredRole === "org_admin") {
        if (!orgName || !orgName.trim()) {
          return res.status(400).json({
            success: false,
            needsOrgOnboarding: true,
            message: "Coaching / Organization Name is required to register as Coaching Administrator.",
          });
        }
        validatedRole = "org_admin";
      } else if (desiredRole === "tutor" || isTeacherPasscode(req.body.teacherPasscode)) {
        if (isTeacherPasscode(req.body.teacherPasscode)) {
          validatedRole = "tutor";
        } else {
          validatedRole = "student";
        }
      } else {
        validatedRole = "student";
      }

      const randomPassword = crypto.randomBytes(32).toString("hex");
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(randomPassword, salt);

      user = await User.create({
        name,
        email,
        googleUid: fbResult.uid,
        firebaseUid: fbResult.uid,
        avatar: fbResult.picture || "",
        passwordHash,
        role: validatedRole,
        globalRole: "user",
        isEmailVerified: true,
        metadata: {
          level: metadata.level || "HSC 2027",
          group: metadata.group || "Science",
          designation: metadata.designation || (validatedRole === "tutor" ? "Lecturer / Educator" : ""),
          institution: metadata.institution || "",
        },
      });

      // If Coaching / Organization Admin -> create organization workspace
      if (validatedRole === "org_admin") {
        let baseSlug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!baseSlug) baseSlug = `coaching-${Date.now().toString().slice(-4)}`;
        let slug = baseSlug;
        let counter = 1;
        while (await Organization.findOne({ slug })) {
          slug = `${baseSlug}-${counter++}`;
        }
        const organization = await Organization.create({
          name: orgName.trim(),
          slug,
          code: `EXM-${Math.floor(1000 + Math.random() * 9000)}`,
          ownerId: user._id,
          contactEmail: user.email,
          location: (location || "Dhaka").trim(),
          status: "active",
          plan: "free",
        });
        await OrganizationMembership.create({
          organizationId: organization._id,
          userId: user._id,
          role: "org_admin",
          status: "active",
        });
      }
    }

    let redirectUrl = "/dashboard";
    const userRole = (user.globalRole === "super_admin" ? "super_admin" : (user.role || "")).toLowerCase();
    if (userRole === "super_admin") {
      redirectUrl = "/admin";
    } else if (userRole === "org_admin") {
      redirectUrl = "/organization";
    } else if (userRole === "tutor") {
      redirectUrl = "/teacher";
    }

    const memberships = await OrganizationMembership.find({
      userId: user._id,
      status: "active",
    })
      .populate("organizationId", "name slug code status")
      .lean();

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: isNewUser ? "Google registration successful." : "Google login successful.",
      token,
      isNewUser,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        avatar: user.avatar || "",
        role: user.role,
        globalRole: user.globalRole,
        isEmailVerified: user.isEmailVerified,
        metadata: user.metadata || {},
      },
      memberships: memberships.map((m) => ({
        id: m._id,
        role: m.role,
        organization: m.organizationId,
      })),
      redirectUrl,
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during Google authentication.",
    });
  }
};

// ============================================================================
// 10. EMAIL + PASSWORD REGISTRATION
// ============================================================================
export const registerEmail = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      role = "student",
      level = "HSC 2027",
      group = "Science",
      designation = "Lecturer",
      institution = "",
      orgName = "",
      location = "Dhaka",
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Full name is required." });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email address is required." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email address already exists. Please sign in.",
      });
    }

    // Role security: Only allow "student", "tutor", or "org_admin"
    const allowedRoles = ["student", "tutor", "org_admin"];
    let targetRole = allowedRoles.includes(role) ? role : "student";

    if (targetRole === "tutor" && !isTeacherPasscode(req.body.teacherPasscode)) {
      targetRole = "student";
    }

    if (targetRole === "org_admin" && !orgName.trim()) {
      return res.status(400).json({ success: false, message: "Organization name is required." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: targetRole,
      globalRole: "user",
      isEmailVerified: false,
      metadata: {
        level: level.trim(),
        group: group.trim(),
        designation: designation.trim(),
        institution: institution.trim(),
      },
    });

    let redirectUrl = "/dashboard";
    if (targetRole === "tutor") {
      redirectUrl = "/teacher";
    } else if (targetRole === "org_admin") {
      redirectUrl = "/organization";
      // Create organization workspace
      let baseSlug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!baseSlug) baseSlug = `coaching-${Date.now().toString().slice(-4)}`;
      let slug = baseSlug;
      let counter = 1;
      while (await Organization.findOne({ slug })) {
        slug = `${baseSlug}-${counter++}`;
      }
      const organization = await Organization.create({
        name: orgName.trim(),
        slug,
        code: `EXM-${Math.floor(1000 + Math.random() * 9000)}`,
        ownerId: user._id,
        contactEmail: normalizedEmail,
        location: location.trim(),
        status: "active",
        plan: "free",
      });
      await OrganizationMembership.create({
        organizationId: organization._id,
        userId: user._id,
        role: "org_admin",
        status: "active",
      });
    }

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: "Account registered successfully with email.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        globalRole: user.globalRole,
        isEmailVerified: user.isEmailVerified,
        metadata: user.metadata || {},
      },
      redirectUrl,
    });
  } catch (error) {
    console.error("Email Register Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during email registration.",
    });
  }
};

// ============================================================================
// 11. EMAIL PASSWORD RESET FLOW
// ============================================================================
export const forgotPasswordEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Anti-enumeration: always return success
    if (!user) {
      return res.json({
        success: true,
        message: "If this email is registered, password reset instructions have been dispatched.",
      });
    }

    // Generate signed reset token with 15 minutes validity
    const resetToken = jwt.sign(
      { id: user._id, email: user.email, purpose: "password_reset_email" },
      config.jwt.secret,
      { expiresIn: "15m" }
    );

    // Securely dispatch transactional email (never exposed over HTTP wire)
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetToken,
    });

    return res.json({
      success: true,
      message: "If this email is registered, password reset instructions have been dispatched.",
    });
  } catch (error) {
    console.error("Forgot Password Email Error:", error);
    return res.status(500).json({ success: false, message: "Failed to process password reset request." });
  }
};

export const resetPasswordEmail = async (req, res) => {
  try {
    const { email, resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken) {
      return res.status(400).json({ success: false, message: "Password reset token is required." });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, config.jwt.secret);
    } catch (err) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset token." });
    }

    if (decoded.purpose !== "password_reset_email") {
      return res.status(400).json({ success: false, message: "Invalid reset token purpose." });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({
      success: true,
      message: "Password has been successfully updated. You can now login.",
    });
  } catch (error) {
    console.error("Reset Password Email Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update password." });
  }
};

// ============================================================================
// 8. GET CURRENT AUTHENTICATED PROFILE & MEMBERSHIPS
// ============================================================================
export const getMe = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    const memberships = await OrganizationMembership.find({
      userId: user._id,
      status: "active",
    })
      .populate("organizationId", "name slug code status plan settings")
      .lean();

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        globalRole: user.globalRole,
        isPhoneVerified: user.isPhoneVerified,
        metadata: user.metadata || {},
      },
      memberships: memberships.map((m) => ({
        id: m._id,
        role: m.role,
        organization: m.organizationId,
      })),
    });
  } catch (error) {
    console.error("GetMe Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile.",
    });
  }
};

// ============================================================================
// 12. UPDATE / LINK MOBILE NUMBER (Profile Onboarding for Google Users)
// ============================================================================
export const updateProfilePhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: "Mobile number is required." });
    }

    const normalizedPhone = normalizeBdPhone(phone);
    if (!normalizedPhone || !isValidBdPhone(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX).",
      });
    }

    // Check if another user already owns this phone
    const existing = await User.findOne({
      phone: normalizedPhone,
      _id: { $ne: req.user._id },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already linked to another Examino account.",
      });
    }

    req.user.phone = normalizedPhone;
    req.user.isPhoneVerified = true;
    await req.user.save();

    return res.json({
      success: true,
      message: "Mobile number updated successfully.",
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        isPhoneVerified: req.user.isPhoneVerified,
      },
    });
  } catch (err) {
    console.error("Update Phone Error:", err);
    return res.status(500).json({ success: false, message: "Failed to update mobile number." });
  }
};

// ============================================================================
// 9. LEGACY REGISTER COMPATIBILITY (Wraps Student Registration)
// ============================================================================
export const register = registerStudent;

// ============================================================================
// 12. TEACHER PASSCODE VERIFY & LOGIN (Code: 006985)
// ============================================================================
export const teacherPasscodeLogin = async (req, res) => {
  try {
    const { teacherPasscode, email, password, idToken, name } = req.body;

    if (!isTeacherPasscode(teacherPasscode)) {
      return res.status(401).json({
        success: false,
        message: "ভুল শিক্ষক আইডি / পাসকোড। শুধুমাত্র অনুমোদিত শিক্ষক প্রবেশ করতে পারবেন।",
      });
    }

    let targetUser = null;

    // A) If idToken provided (Firebase Google Sign-In)
    if (idToken) {
      const fbResult = await verifyFirebaseGoogleToken(idToken);
      if (!fbResult.valid || !fbResult.email) {
        return res.status(401).json({
          success: false,
          message: fbResult.error || "গুগল সাইন-ইন যাচাইকরণ ব্যর্থ হয়েছে।",
        });
      }
      targetUser = await User.findOne({ email: fbResult.email.toLowerCase().trim() });
      if (!targetUser) {
        const randomPassword = crypto.randomBytes(32).toString("hex");
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(randomPassword, salt);
        targetUser = await User.create({
          name: fbResult.name || name || "Examino Teacher",
          email: fbResult.email.toLowerCase().trim(),
          googleUid: fbResult.uid,
          firebaseUid: fbResult.uid,
          avatar: fbResult.picture || "",
          passwordHash,
          role: "tutor",
          globalRole: "user",
          isEmailVerified: true,
          metadata: { designation: "Chief Educator & Admin", institution: "Examino" },
        });
      } else {
        targetUser.role = "tutor";
        if (fbResult.uid) targetUser.googleUid = fbResult.uid;
        if (fbResult.picture && !targetUser.avatar) targetUser.avatar = fbResult.picture;
        await targetUser.save();
      }
    } 
    // B) If email & password provided
    else if (email && password) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() }).select("+password +passwordHash");
      if (targetUser) {
        const isMatch = await targetUser.matchPassword(password);
        if (!isMatch) {
          return res.status(401).json({ success: false, message: "ভুল পাসওয়ার্ড।" });
        }
        if (targetUser.isActive === false) {
          return res.status(403).json({ success: false, message: "This account has been deactivated." });
        }
        // Only a student account is upgraded; centre admins and super admins keep their role.
        if (["student", "user", "", undefined, null].includes(targetUser.role)) {
          targetUser.role = "tutor";
          await targetUser.save();
        }
      } else {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        targetUser = await User.create({
          name: name?.trim() || "Examino Teacher",
          email: email.toLowerCase().trim(),
          passwordHash,
          role: "tutor",
          globalRole: "user",
          isEmailVerified: true,
          metadata: { designation: "Chief Educator & Admin", institution: "Examino" },
        });
      }
    }
    // C) Email without password or Google token: REJECTED.
    // This path used to return a login token for any existing account (and promote it
    // to teacher) from the passcode + email alone — an account-takeover hole. The web
    // app never used it; teachers sign in with email+password or Google.
    else if (email) {
      return res.status(400).json({
        success: false,
        message: "পাসওয়ার্ড অথবা Google দিয়ে সাইন ইন করুন। (Password or Google sign-in is required.)",
      });
    } else {
      // Passcode-only access opens ONLY the dedicated shared account. It used to open the
      // first tutor found — a real teacher's private account — for anyone with the passcode.
      // Set PASSCODE_ONLY_LOGIN=off to disable this shared login entirely.
      if (String(process.env.PASSCODE_ONLY_LOGIN || "").toLowerCase() === "off") {
        return res.status(403).json({ success: false, message: "Passcode-only sign-in is disabled. Sign in with your email and password or Google." });
      }
      targetUser = await User.findOne({ email: "teacher@examino.edu.bd" });
      if (!targetUser) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash("Teacher@006985", salt);
        targetUser = await User.create({
          name: "Examino Chief Teacher",
          email: "teacher@examino.edu.bd",
          passwordHash,
          role: "tutor",
          globalRole: "user",
          isEmailVerified: true,
          metadata: { designation: "Chief Educator & Admin", institution: "Examino" },
        });
      }
    }

    if (targetUser.isActive === false) {
      return res.status(403).json({ success: false, message: "This account has been deactivated." });
    }
    const token = generateToken(targetUser._id);
    return res.json({
      success: true,
      message: "শিক্ষক ড্যাশবোর্ডে স্বাগতম!",
      token,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone || "",
        avatar: targetUser.avatar || "",
        role: "tutor",
        globalRole: targetUser.globalRole,
        metadata: targetUser.metadata || {},
      },
      redirectUrl: "/teacher",
    });
  } catch (error) {
    console.error("Teacher Passcode Login Error:", error);
    return res.status(500).json({ success: false, message: "শিক্ষক লগইন সম্পন্ন করা সম্ভব হয়নি।" });
  }
};

// ============================================================================
// 13. GET ALL REGISTERED STUDENTS (For Teacher Dashboard)
// ============================================================================
export const getTeacherStudentsList = async (req, res) => {
  try {
    if (req.user?.role !== "tutor" && req.user?.globalRole !== "super_admin") {
      return res.status(403).json({ success: false, message: "শিক্ষক বা অ্যাডমিন এক্সেস প্রয়োজন।" });
    }

    const students = await User.find({ role: { $in: ["student", "user"] }, isActive: { $ne: false } })
      .select("name email phone avatar createdAt metadata isActive")
      .sort({ createdAt: -1 })
      .lean();

    const studentIds = students.map((s) => s._id);
    const submissions = await Submission.find({ studentId: { $in: studentIds } })
      .select("studentId score totalQuestions examCode createdAt")
      .lean();

    const subMap = new Map();
    submissions.forEach((sub) => {
      const sId = sub.studentId?.toString();
      if (!sId) return;
      if (!subMap.has(sId)) subMap.set(sId, []);
      subMap.get(sId).push(sub);
    });

    const enriched = students.map((st) => {
      const stSubs = subMap.get(st._id.toString()) || [];
      const examsTaken = stSubs.length;
      let avgPct = null;
      let bestPct = null;
      if (examsTaken > 0) {
        const pcts = stSubs.map((s) => Math.round(((s.score || 0) / (s.totalQuestions || 25)) * 100));
        avgPct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
        bestPct = Math.max(...pcts);
      }
      return {
        id: st._id,
        _id: st._id,
        name: st.name,
        email: st.email,
        phone: st.phone || "—",
        roll: st.rollNumber || st.metadata?.rollNumber || st.phone || st.email.split("@")[0],
        avatar: st.avatar,
        createdAt: st.createdAt,
        examsTaken,
        avgPct,
        bestPct,
        active: st.isActive,
        attempts: stSubs.map((s) => ({
          id: s._id,
          examCode: s.examCode,
          score: s.score,
          totalQuestions: s.totalQuestions,
          pct: Math.round(((s.score || 0) / (s.totalQuestions || 25)) * 100),
          createdAt: s.createdAt,
        })),
      };
    });

    return res.json({
      success: true,
      totalStudents: enriched.length,
      students: enriched,
    });
  } catch (error) {
    console.error("Get Teacher Students List Error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve student directory." });
  }
};

// ============================================================================
// 14. GET SPECIFIC STUDENT DETAILS & ANALYTICS FOR TEACHER
// ============================================================================
export const getTeacherStudentDetails = async (req, res) => {
  try {
    if (req.user?.role !== "tutor" && req.user?.globalRole !== "super_admin") {
      return res.status(403).json({ success: false, message: "শিক্ষক বা অ্যাডমিন এক্সেস প্রয়োজন।" });
    }

    const { studentId } = req.params;
    const student = await User.findById(studentId).select("name email phone rollNumber avatar createdAt metadata isActive").lean();
    if (!student) {
      return res.status(404).json({ success: false, message: "শিক্ষার্থী পাওয়া যায়নি।" });
    }

    const submissions = await Submission.find({ studentId })
      .sort({ createdAt: -1 })
      .lean();

    const examsTaken = submissions.length;
    let avgPct = 0;
    let bestPct = 0;
    if (examsTaken > 0) {
      const pcts = submissions.map((s) => Math.round(((s.score || 0) / (s.totalQuestions || 25)) * 100));
      avgPct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      bestPct = Math.max(...pcts);
    }

    // Weak topics / Mistakes breakdown
    const examIds = submissions.map((s) => s.examId).filter(Boolean);
    const exams = await Exam.find({ _id: { $in: examIds } }).select("questions title examCode").lean();
    const examMap = new Map(exams.map((e) => [e._id.toString(), e]));
    const allQuestionIds = exams.flatMap((e) => e.questions || []);

    const questions = await Question.find({ _id: { $in: allQuestionIds } })
      .select("subject chapter topic correctAnswer")
      .lean();
    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));

    const topicStats = {};
    submissions.forEach((sub) => {
      const answers = sub.answers || {};
      for (const [qId, studentAns] of Object.entries(answers)) {
        const q = qMap.get(qId);
        if (!q) continue;

        const topicKey = q.topic || q.chapter || "সাধারণ বিষয়";
        if (!topicStats[topicKey]) {
          topicStats[topicKey] = {
            topic: topicKey,
            chapter: q.chapter || "",
            subject: q.subject || "ICT",
            totalAttempted: 0,
            wrongCount: 0,
            correctCount: 0,
          };
        }
        topicStats[topicKey].totalAttempted++;
        if (studentAns === q.correctAnswer) {
          topicStats[topicKey].correctCount++;
        } else {
          topicStats[topicKey].wrongCount++;
        }
      }
    });

    const weakTopics = Object.values(topicStats)
      .map((t) => {
        const accuracy = t.totalAttempted > 0 ? Math.round((t.correctCount / t.totalAttempted) * 100) : 0;
        return {
          ...t,
          accuracy,
        };
      })
      .filter((t) => t.wrongCount > 0 || t.accuracy < 70)
      .sort((a, b) => b.wrongCount - a.wrongCount);

    const attempts = submissions.map((s) => {
      const ex = examMap.get(s.examId?.toString());
      return {
        id: s._id,
        examCode: s.examCode,
        examTitle: ex?.title || s.examCode,
        score: s.score,
        totalQuestions: s.totalQuestions || 25,
        pct: Math.round(((s.score || 0) / (s.totalQuestions || 25)) * 100),
        createdAt: s.createdAt,
      };
    });

    return res.json({
      success: true,
      student: {
        id: student._id,
        _id: student._id,
        name: student.name,
        email: student.email,
        phone: student.phone || "—",
        roll: student.rollNumber || student.metadata?.rollNumber || student.phone || student.email.split("@")[0],
        avatar: student.avatar || "",
        createdAt: student.createdAt,
        active: student.isActive,
        metadata: student.metadata || {},
        examsTaken,
        avgPct,
        bestPct,
        weakTopics,
        attempts,
      },
    });
  } catch (error) {
    console.error("Get Teacher Student Details Error:", error);
    return res.status(500).json({ success: false, message: "শিক্ষার্থীর বিস্তারিত তথ্য লোড করতে ব্যর্থ হয়েছে।" });
  }
};

// ============================================================================
// 15. DELETE / REMOVE STUDENT (TEACHER OR SUPER ADMIN ONLY)
// ============================================================================
export const deleteTeacherStudent = async (req, res) => {
  try {
    if (req.user?.role !== "tutor" && req.user?.globalRole !== "super_admin") {
      return res.status(403).json({ success: false, message: "শিক্ষক বা অ্যাডমিন এক্সেস প্রয়োজন।" });
    }

    const { studentId } = req.params;
    const target = await User.findById(studentId);
    if (!target) {
      return res.status(404).json({ success: false, message: "শিক্ষার্থী পাওয়া যায়নি।" });
    }

    if (target.role === "tutor" || target.globalRole === "super_admin") {
      return res.status(400).json({ success: false, message: "শিক্ষক বা অ্যাডমিন অ্যাকাউন্ট ডিলিট করা সম্ভব নয়।" });
    }

    // Deactivate instead of hard-deleting: the account can no longer sign in, but exam
    // results and history are preserved and the action can be reversed.
    target.isActive = false;
    await target.save();

    return res.json({
      success: true,
      message: `${target.name} শিক্ষার্থীকে সফলভাবে রিমুভ করা হয়েছে।`,
    });
  } catch (error) {
    console.error("Delete Teacher Student Error:", error);
    return res.status(500).json({ success: false, message: "শিক্ষার্থী রিমুভ করতে ব্যর্থ হয়েছে।" });
  }
};

// ============================================================================
// 16. UPDATE FULL STUDENT PROFILE (Name, Phone, Roll, Avatar)
// ============================================================================
export const updateFullProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const { name, phone, roll, avatar, level, group, institution } = req.body;
    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (avatar !== undefined) user.avatar = avatar.trim();
    if (roll !== undefined) {
      user.rollNumber = roll.trim();
      if (!user.metadata) user.metadata = {};
      user.metadata.rollNumber = roll.trim();
    }
    if (level || group || institution) {
      if (!user.metadata) user.metadata = {};
      if (level) user.metadata.level = level.trim();
      if (group) user.metadata.group = group.trim();
      if (institution) user.metadata.institution = institution.trim();
    }

    await user.save();

    return res.json({
      success: true,
      message: "প্রোফাইল সফলভাবে আপডেট করা হয়েছে।",
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        roll: user.rollNumber || user.metadata?.rollNumber || "",
        avatar: user.avatar || "",
        role: user.role,
        globalRole: user.globalRole,
        metadata: user.metadata || {},
      },
    });
  } catch (error) {
    console.error("Update Full Profile Error:", error);
    return res.status(500).json({ success: false, message: "প্রোফাইল আপডেট করতে সমস্যা হয়েছে।" });
  }
};
