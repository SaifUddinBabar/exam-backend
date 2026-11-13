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
    passwordHash: {
      type: String,
      required: true,
    },
    // Global platform role
    globalRole: {
      type: String,
      enum: ["super_admin", "user"],
      default: "user",
    },
    // Backwards compatibility for legacy tutors
    role: {
      type: String,
      default: "tutor",
    },
    isActive: {
      type: Boolean,
      default: true,
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
