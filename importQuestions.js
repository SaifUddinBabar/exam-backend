import mongoose from "mongoose";
import fs from "fs";
import dotenv from "dotenv";
import Question from "./models/Question.js";

dotenv.config();

const run = async () => {
  try {
    console.log("IMPORT DB:", process.env.MONGO_URI);

    await mongoose.connect(process.env.MONGO_URI);

    await Question.deleteMany(); // 🔥 add this

    const data = JSON.parse(
      fs.readFileSync("questions.json", "utf-8")
    );

    console.log("Total Questions:", data.length);

    await Question.insertMany(data);

    console.log("✅ Questions Imported Successfully");
    process.exit();

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();