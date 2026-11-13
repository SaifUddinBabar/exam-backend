import express from "express";
import cors from "cors";

import config from "./config/env.js";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";
import { startBackupScheduler } from "./services/backupScheduler.js";

// Initialize Database
connectDB();

const app = express();

// ==============================
// MIDDLEWARE
// ==============================
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static("uploads"));

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
  console.error("Unhandled Error:", err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(config.env === "development" ? { stack: err.stack } : {}),
  });
});

// ==============================
// START SERVER
// ==============================
const PORT = config.port;

let server;
let backupScheduler;
if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    console.log(`🚀 Examino server running on port ${PORT} [${config.env}]`);
    const intervalHours = parseFloat(process.env.BACKUP_INTERVAL_HOURS || "24");
    backupScheduler = startBackupScheduler(intervalHours * 60 * 60 * 1000);
  });
}

export { app, server, backupScheduler };
export default app;
