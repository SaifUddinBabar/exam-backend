import mongoose from "mongoose";
import fs from "fs";
import dotenv from "dotenv";

import Question from "../models/Question.js";

dotenv.config();

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

// আপনার final Chapter 2 JSON file
const JSON_FILE =
  "D:/Exam-project/communication_systems_13_topics_final.json";

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI;


/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

async function fixChapter2() {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI পাওয়া যায়নি। .env file check করুন।");
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected.");


    /*
    |--------------------------------------------------------------------------
    | Read JSON
    |--------------------------------------------------------------------------
    */

    if (!fs.existsSync(JSON_FILE)) {
      throw new Error(
        `JSON file পাওয়া যায়নি:\n${JSON_FILE}`
      );
    }

    const rawData = fs.readFileSync(JSON_FILE, "utf8");

    const questions = JSON.parse(rawData);

    console.log(`JSON questions: ${questions.length}`);


    /*
    |--------------------------------------------------------------------------
    | Validate Chapter 2
    |--------------------------------------------------------------------------
    */

    const allowedTopics = [
      "কমিউনিকেশন সিস্টেম (Communication System)",

      "ডেটা কমিউনিকেশন (Data Communication)",

      "ডেটা কমিউনিকেশনের উপাদান (Data Communication Components: Source, Transmitter, Media, Receiver, Destination)",

      "ডেটা ট্রান্সমিশন মোড (Data Transmission Mode: Serial/Parallel, Simplex/Half Duplex/Full Duplex)",

      "ব্যান্ডউইথ (Bandwidth)",

      "কমিউনিকেশন মিডিয়া: তারযুক্ত (Wired Media – Twisted Pair, Coaxial, Fiber Optic)",

      "কমিউনিকেশন মিডিয়া: তারবিহীন (Wireless Media – Radio Wave, Microwave, Satellite, Bluetooth, Infrared, Wi-Fi, WiMAX)",

      "মোবাইল কমিউনিকেশন সিস্টেম (Mobile Communication System)",

      "মোবাইল ফোনের বিভিন্ন প্রজন্ম (Generations of Mobile Phone: 1G–5G)",

      "কম্পিউটার নেটওয়ার্ক (Computer Network) ও নেটওয়ার্কের প্রকারভেদ (PAN, LAN, MAN, WAN)",

      "নেটওয়ার্ক টপোলজি (Network Topology: Bus, Ring, Star, Tree, Mesh, Hybrid)",

      "নেটওয়ার্কিং ডিভাইস (Networking Devices: Modem, Hub, Switch, Router, Gateway, Repeater)",

      "ক্লাউড কম্পিউটিং (Cloud Computing)"
    ];


    /*
    |--------------------------------------------------------------------------
    | Validate JSON topics
    |--------------------------------------------------------------------------
    */

    const invalidTopics = [
      ...new Set(
        questions
          .map(q => q.topic)
          .filter(topic => !allowedTopics.includes(topic))
      )
    ];

    if (invalidTopics.length > 0) {
      console.log("\n❌ Invalid topics found:");

      invalidTopics.forEach(topic => {
        console.log("-", topic);
      });

      throw new Error(
        "JSON file-এ অনুমোদিত 13 topic-এর বাইরে topic পাওয়া গেছে।"
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Create question map
    |--------------------------------------------------------------------------
    */

    const questionMap = new Map();

    for (const q of questions) {
      if (!q.question) continue;

      const key = q.question.trim();

      questionMap.set(key, {
        topic: q.topic,
        difficulty: q.difficulty
      });
    }


    /*
    |--------------------------------------------------------------------------
    | Find existing Chapter 2 questions
    |--------------------------------------------------------------------------
    */

    const dbQuestions = await Question.find({
      chapter: "Communication Systems"
    });

    console.log(
      `\nDatabase Chapter 2 questions: ${dbQuestions.length}`
    );


    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    let updated = 0;
    let notFound = 0;
    let alreadyCorrect = 0;

    const notFoundQuestions = [];


    for (const dbQuestion of dbQuestions) {

      const questionText =
        dbQuestion.question?.trim();

      if (!questionText) {
        continue;
      }


      const newData =
        questionMap.get(questionText);


      /*
      |--------------------------------------------------------------------------
      | Question not found in JSON
      |--------------------------------------------------------------------------
      */

      if (!newData) {
        notFound++;

        notFoundQuestions.push(questionText);

        continue;
      }


      /*
      |--------------------------------------------------------------------------
      | Check if already correct
      |--------------------------------------------------------------------------
      */

      if (
        dbQuestion.topic === newData.topic &&
        dbQuestion.difficulty === newData.difficulty
      ) {
        alreadyCorrect++;
        continue;
      }


      /*
      |--------------------------------------------------------------------------
      | Update ONLY topic + difficulty
      |--------------------------------------------------------------------------
      */

      dbQuestion.topic = newData.topic;

      dbQuestion.difficulty = newData.difficulty;

      await dbQuestion.save();

      updated++;

      console.log(
        `✓ Updated: ${questionText.substring(0, 60)}...`
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Final report
    |--------------------------------------------------------------------------
    */

    console.log("\n====================================");
    console.log("Chapter 2 Migration Complete");
    console.log("====================================");

    console.log("JSON questions :", questions.length);
    console.log("DB questions   :", dbQuestions.length);
    console.log("Updated        :", updated);
    console.log("Already correct:", alreadyCorrect);
    console.log("Not found      :", notFound);


    /*
    |--------------------------------------------------------------------------
    | Topic counts after update
    |--------------------------------------------------------------------------
    */

    console.log("\nTopic counts:");

    const topicCounts = {};

    for (const topic of allowedTopics) {
      topicCounts[topic] = await Question.countDocuments({
        chapter: "Communication Systems",
        topic
      });
    }

    for (const topic of allowedTopics) {
      console.log(
        `${topic} → ${topicCounts[topic]}`
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Close
    |--------------------------------------------------------------------------
    */

    await mongoose.disconnect();

    console.log("\nMongoDB disconnected.");
    console.log("Done.");
  }

  catch (error) {

    console.error("\n❌ ERROR:");
    console.error(error.message);

    try {
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
}


fixChapter2();