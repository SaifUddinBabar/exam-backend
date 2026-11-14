import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("FATAL: MONGO_URI is not set in environment.");
  process.exit(1);
}

// Insecure default blacklist
const INSECURE_SECRETS = new Set(["secret123", "secret", "password", "123456", "admin"]);

let jwtAccessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

// Ensure robust, secure production initialization without container boot crash
if (!jwtAccessSecret || INSECURE_SECRETS.has(jwtAccessSecret)) {
  if (NODE_ENV === "production") {
    jwtAccessSecret = crypto.randomBytes(32).toString("hex");
    console.warn("⚠️  PRODUCTION WARNING: JWT_ACCESS_SECRET is missing or insecure in production environment.");
    console.warn("⚠️  Generated ephemeral 256-bit key to prevent container crash. Set JWT_ACCESS_SECRET in Render dashboard for persistent sessions across restarts.");
  } else {
    // Persistent development fallback to prevent logout on hot-reload if env missing
    jwtAccessSecret = "dev-persistent-jwt-secret-examino-local-e7b41b1d8f7b7625c276f5ef5bdfa929";
    console.warn("⚠️  WARNING: JWT_ACCESS_SECRET not configured in .env. Using persistent development fallback key.");
  }
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export const config = {
  env: NODE_ENV,
  port: PORT,
  mongoUri: MONGO_URI,
  frontendUrl: FRONTEND_URL,
  jwt: {
    secret: jwtAccessSecret,
    expiresIn: JWT_EXPIRES_IN,
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || '"Examino" <noreply@examino.edu.bd>',
  },
};

export default config;
