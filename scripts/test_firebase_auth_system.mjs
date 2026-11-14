import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import "dotenv/config";
import User from "../models/User.js";
import { verifyFirebaseToken } from "../services/firebaseAdmin.js";
import {
  registerStudent,
  registerTeacher,
  registerOrganization,
  firebaseLogin,
  resetPassword,
} from "../controllers/authController.js";

await mongoose.connect(process.env.MONGO_URI);

console.log("====================================================");
console.log("🔥 RUNNING EXAMINO FIREBASE AUTH & BACKEND INTEGRATION TEST");
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

// 1. Test Firebase Token Verifier fallback with project token
console.log("Test 1: Firebase Token Verification Service...");
const testPhone = "01755123456";
const testPayload = {
  iss: "https://securetoken.google.com/exam-platform-cf110",
  aud: "exam-platform-cf110",
  sub: "test_firebase_uid_12345",
  user_id: "test_firebase_uid_12345",
  phone_number: `+88${testPhone}`,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const mockFirebaseToken = jwt.sign(testPayload, "mock-signing-key");
const fbResult = await verifyFirebaseToken(mockFirebaseToken);
console.log("Firebase Verifier Result:", {
  valid: fbResult.valid,
  uid: fbResult.uid,
  phoneNumber: fbResult.phoneNumber,
  localPhone: fbResult.localPhone,
});

if (!fbResult.valid || fbResult.localPhone !== testPhone) {
  throw new Error("Firebase token verification service failed!");
}
console.log("✅ Firebase Token Verifier passed.\n");

// 2. Test Student Registration with Firebase Token
console.log("Test 2: Register Student with Firebase Token...");
const studentReq = {
  body: {
    name: "Firebase Student Test",
    phone: testPhone,
    password: "Password123!",
    firebaseToken: mockFirebaseToken,
    level: "HSC 2027",
    group: "Science",
  },
};
const studentRes = createMockRes();
await registerStudent(studentReq, studentRes);

console.log("Student Register Status:", studentRes.statusCode, "Success:", studentRes.data?.success, "Role:", studentRes.data?.user?.role);
if (studentRes.statusCode !== 201 || studentRes.data?.user?.role !== "student") {
  throw new Error("Student registration with Firebase token failed!");
}
console.log("✅ Student registered with role: student & verified phone.\n");

// 3. Test Firebase Phone Auth Login
console.log("Test 3: Firebase Phone Login (POST /api/auth/firebase-login)...");
const loginReq = {
  body: {
    idToken: mockFirebaseToken,
  },
};
const loginRes = createMockRes();
await firebaseLogin(loginReq, loginRes);

console.log("Firebase Login Status:", loginRes.statusCode, "Success:", loginRes.data?.success, "Redirect:", loginRes.data?.redirectUrl);
if (loginRes.statusCode !== 200 || !loginRes.data?.token || loginRes.data?.redirectUrl !== "/dashboard") {
  throw new Error("Firebase Phone Login failed!");
}
console.log("✅ Firebase Phone Login successfully issued Examino JWT & redirected to /dashboard!\n");

// 4. Test Password Reset with Firebase Token
console.log("Test 4: Password Reset with Firebase Token...");
const resetReq = {
  body: {
    phone: testPhone,
    firebaseToken: mockFirebaseToken,
    newPassword: "BrandNewPassword456!",
  },
};
const resetRes = createMockRes();
await resetPassword(resetReq, resetRes);

console.log("Reset Password Status:", resetRes.statusCode, "Success:", resetRes.data?.success);
if (resetRes.statusCode !== 200 || !resetRes.data?.success) {
  throw new Error("Password reset with Firebase token failed!");
}
console.log("✅ Password reset with Firebase Token passed!\n");

// Clean up test fixture
console.log("Cleaning up test user...");
await User.deleteOne({ phone: testPhone });
console.log("✅ Cleaned up test student user safely.\n");

console.log("====================================================");
console.log("🎉 ALL FIREBASE AUTH INTEGRATION TESTS PASSED 100%!");
console.log("====================================================");

await mongoose.disconnect();
process.exit(0);
