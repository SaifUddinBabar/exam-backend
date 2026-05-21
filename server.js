import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import examRoutes from "./routes/examRoutes.js";

dotenv.config();
connectDB();

const app = express();

// ==============================
// MIDDLEWARE
// ==============================
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(
  "/uploads",
  express.static("uploads")
);

// ==============================
// ROUTES
// ==============================
app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/exams", examRoutes);

app.get("/", (req, res) => {
  res.send("API Running 🚀");
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // ==============================
  // KEEP SERVER ALIVE
  // ==============================
  setInterval(() => {
    fetch("https://exam-backend-2-o8e6.onrender.com/")
      .then(() => console.log("✅ Server alive"))
      .catch(() => console.log("❌ Ping failed"));
  }, 14 * 60 * 1000);
});