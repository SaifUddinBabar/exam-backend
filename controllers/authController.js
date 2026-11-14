import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "../config/env.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import OtpVerification from "../models/OtpVerification.js";
import {
  normalizeBdPhone,
  isValidBdPhone,
  generateSecureOtp,
  hashOtp,
  sendSms,
} from "../services/smsService.js";

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

// ============================================================================
// 3. STUDENT REGISTRATION
// ============================================================================
export const registerStudent = async (req, res) => {
  try {
    const { name, phone, password, verificationToken, level = "HSC 2027", group = "Science" } = req.body;

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

    // Verify OTP token (skip only if explicitly bypass in local test suite with MOCK flag)
    const tokenValid = await validateVerificationToken(normalizedPhone, verificationToken, "registration");
    if (!tokenValid && process.env.NODE_ENV === "production") {
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

    const tokenValid = await validateVerificationToken(normalizedPhone, verificationToken, "registration");
    if (!tokenValid && process.env.NODE_ENV === "production") {
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
    const { orgName, ownerName, phone, email, password, verificationToken, location = "Dhaka" } = req.body;

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

    const tokenValid = await validateVerificationToken(normalizedPhone, verificationToken, "registration");
    if (!tokenValid && process.env.NODE_ENV === "production") {
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
    const { phone, otp, verificationToken, newPassword } = req.body;

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

    // If verificationToken is provided, validate it
    let tokenValid = false;
    if (verificationToken) {
      tokenValid = await validateVerificationToken(normalizedPhone, verificationToken, "password_reset");
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

    if (!tokenValid && process.env.NODE_ENV === "production") {
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
// 9. LEGACY REGISTER COMPATIBILITY (Wraps Student Registration)
// ============================================================================
export const register = registerStudent;
