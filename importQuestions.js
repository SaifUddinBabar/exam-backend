
import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import Question from "./models/Question.js";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is not configured in environment variables.");
}

const run = async () => {
  try {
    console.log("Connecting...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected!");

    // WARNING: This deletes all existing questions.
    await Question.deleteMany();

    const data = JSON.parse(
      fs.readFileSync("questions.json", "utf-8")
    );

    console.log("Total Questions:", data.length);
    await Question.insertMany(data);
    console.log("Questions Imported Successfully");
    process.exit(0);

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
