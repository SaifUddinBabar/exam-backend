import mongoose from "mongoose";
import fs from "fs";
import Question from "./models/Question.js";

const MONGO_URI = "mongodb+srv://exam_app:FBQkye9ZvX3k2oq2@cluster0.p6esi4j.mongodb.net/exam_db?appName=Cluster0";

const run = async () => {
  try {
    console.log("Connecting...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected!");

    await Question.deleteMany();

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