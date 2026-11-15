import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import config from "./config/env.js";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";
import ictRoutes from "./routes/ictRoutes.js";
import practiceRoutes from "./routes/practiceRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import batchRoutes from "./routes/batchRoutes.js";
import noticeRoutes from "./routes/noticeRoutes.js";
import { battleRouter, leagueRouter, studentRouter } from "./routes/gameRoutes.js";
import { startBackupScheduler } from "./services/backupScheduler.js";

// Initialize Database
connectDB();

const app = express();
// Render terminates TLS at one proxy hop; trust it so req.ip is the real client.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// ==============================
// MIDDLEWARE
// ==============================
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

// ==============================
// HEALTH CHECK
// ==============================
app.get("/", (req, res) => {
  res.json({
    name: "Examino API",
    status: "healthy",
    version: "1.0.0",
    env: config.env,
  });
});

// ==============================
// ROUTES
// ==============================
app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/ict", ictRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/battles", battleRouter);
app.use("/api/league", leagueRouter);
app.use("/api/student", studentRouter);

// ==============================
// 404 NOT FOUND HANDLER
// ==============================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ==============================
// GLOBAL ERROR HANDLER
// ==============================
app.use((err, req, res, next) => {
  // Multer and body-parser errors are client errors with safe messages.
  let status = err.status || err.statusCode || (err.name === "MulterError" ? 400 : 500);
  if (err.type === "entity.too.large") status = 413;
  if (status >= 500) console.error("Unhandled Error:", err.stack);
  res.status(status).json({
    success: false,
    message: status >= 500 ? "Internal Server Error" : err.message,
    ...(config.env === "development" && status >= 500 ? { stack: err.stack } : {}),
  });
});

// ==============================
// START SERVER
// ==============================
const PORT = config.port;

let server;
let backupScheduler;
if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Examino server running on port ${PORT} [${config.env}]`);
    const intervalHours = parseFloat(process.env.BACKUP_INTERVAL_HOURS || "24");
    backupScheduler = startBackupScheduler(intervalHours * 60 * 60 * 1000);
  });
}

export { app, server, backupScheduler };
export default app;
