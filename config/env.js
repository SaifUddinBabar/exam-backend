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
if (!jwtAccessSecret || INSECURE_SECRETS.has(jwtAccessSecret)) {
  const fallbackSecret = crypto.randomBytes(32).toString("hex");
  if (NODE_ENV === "production") {
    console.warn("⚠️  WARNING: JWT_ACCESS_SECRET is missing or insecure in production environment.");
    console.warn("⚠️  Using a secure ephemeral 256-bit random key for this session to ensure high availability.");
    jwtAccessSecret = fallbackSecret;
  } else {
    // Generate an ephemeral strong key for local dev if missing to prevent "secret123" usage
    jwtAccessSecret = fallbackSecret;
    console.warn("⚠️  WARNING: JWT_ACCESS_SECRET not configured. Using generated secure fallback for session.");
  }
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export const config = {
  env: NODE_ENV,
  port: PORT,
  mongoUri: MONGO_URI,
  jwt: {
    secret: jwtAccessSecret,
    expiresIn: JWT_EXPIRES_IN,
  },
};

export default config;
