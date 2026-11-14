import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    rollNumber: {
      type: String,
      trim: true,
      index: true,
      default: "",
    },
    firebaseUid: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    googleUid: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    avatar: {
      type: String,
      trim: true,
      default: "",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    passwordHash: {
      type: String,
      default: function () {
        return this.password || "";
      },
    },
    password: {
      type: String,
      select: false,
    },
    // Global platform role
    globalRole: {
      type: String,
      enum: ["super_admin", "user"],
      default: "user",
    },
    // Application role
    role: {
      type: String,
      enum: ["student", "tutor", "org_admin", "super_admin"],
      default: "student",
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      level: { type: String, trim: true, default: "" },
      group: { type: String, trim: true, default: "" },
      designation: { type: String, trim: true, default: "" },
      institution: { type: String, trim: true, default: "" },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.password;
        return ret;
      },
    },
  }
);

// Method to verify password
userSchema.methods.matchPassword = async function (enteredPassword) {
  const hash = this.passwordHash || this.password;
  if (!hash) return false;
  return await bcrypt.compare(enteredPassword, hash);
};

const User = mongoose.model("User", userSchema);
export default User;
