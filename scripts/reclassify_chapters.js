
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root directory
const PROJECT_ROOT = path.resolve(__dirname, "..");

// JSON file and model paths
const filePath = path.join(PROJECT_ROOT, "ict_questions.json");
const modelPath = path.join(PROJECT_ROOT, "models", "Question.js");

const CHAPTER_RULES = [
  {
    chapter: "অধ্যায় ১: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
    defaultTopic: "বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
    regex: /রোবোটিক্স|robotics|ক্রায়োসার্জারি|cryosurgery|বায়োমেট্রিক্স|biometrics|কৃত্রিম বুদ্ধিমত্তা|ai|ভার্চুয়াল রিয়েলিটি|virtual reality|ন্যানোটেকনোলজি|nanotechnology|বায়োইনফরমেটিক্স|bioinformatics|জেনেটিক ইঞ্জিনিয়ারিং|genetic engineering|মহাকাশ অভিযান|ই-কমার্স|ই-লার্নিং|টেলিমেডিসিন|telemedicine|সাইবার|হ্যাকিং|হ্যাকার|প্লেজিয়ারিজম|স্মার্ট হোম/i
  },
  {
    chapter: "অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং",
    defaultTopic: "কমিউনিকেশন ও নেটওয়ার্কিং",
    regex: /কমিউনিকেশন|নেটওয়ার্ক|network|টপোলজি|topology|ক্লাউড|cloud|ওয়াইফাই|wifi|ব্লুটুথ|bluetooth|মডেম|modem|রাউটার|router|অপটিক্যাল ফাইবার|optical fiber|কোক্সিয়াল|টুইস্টেড পেয়ার|ব্যান্ডউইথ|bandwidth|সিনক্রোনাস|অ্যাসিঙ্ক্রোনাস|আইসোক্রোনাস|সিমপ্লেক্স|ডুপ্লেক্স|হাফ-ডুপ্লেক্স|ল্যান|lan|ম্যান|man|ওয়্যান|wan|প্যান|pan|গেটওয়ে|gateway|সুইচ|হাব|hub|মাইক্রোওয়েভ|স্যাটেলাইট|satellite|সেলুলার|মোবাইল প্রজন্ম|1g|2g|3g|4g|5g|ip address|আইপি অ্যাড্রেস/i
  },
  {
    chapter: "অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
    defaultTopic: "সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
    regex: /বাইনারি|binary|অক্টাল|octal|দশমিক|decimal|হেক্সাডেসিমেল|hexadecimal|২-এর পরিপূরক|পরিপূরক|কম্প্লিমেন্ট|লজিক গেইট|logic gate|and gate|or gate|not gate|nand|nor|x-or|xnor|বুলিয়ান|boolean|ডি-মরগান|এনকোডার|encoder|ডিকোডার|decoder|অ্যাডার|adder|হাফ অ্যাডার|ফুল অ্যাডার|রেজিস্টার|register|কাউন্টার|counter|ফ্লিপ-ফ্লপ|flip-flop|চিহ্নযুক্ত সংখ্যা|bcd|ascii|ebcdic|ইউনিকোড|unicode/i
  },
  {
    chapter: "অধ্যায় ৪: ওয়েব ডিজাইন পরিচিতি ও HTML",
    defaultTopic: "ওয়েব ডিজাইন ও HTML",
    regex: /html|ওয়েব|web|ওয়েবসাইট|website|ওয়েবপেজ|webpage|ট্যাগ|tag|হাইপারলিংক|hyperlink|ডোমেন|domain|হোস্টিং|hosting|ব্রাউজার|browser|সার্চ ইঞ্জিন|search engine|href|src|iframe|টেবিল|table|tr tag|td tag|th tag|font tag|img tag|anchor tag|লিংক|ul tag|ol tag|li tag|বডি ট্যাগ|body tag|হেড ট্যাগ|head tag|css|হোমপেজ|স্ট্যাটিক ওয়েবসাইট|ডায়নামিক ওয়েবসাইট|www|url/i
  },
  {
    chapter: "অধ্যায় ৫: প্রোগ্রামিং ভাষা (সি প্রোগ্রামিং)",
    defaultTopic: "সি প্রোগ্রামিং (C Language)",
    regex: /সি ভাষা|সি প্রোগ্রাম|c language|c program|চলক|variable|ধ্রুবক|constant|লুপ|loop|for loop|while loop|do-while|ফাংশন|function|main\(\)|printf|scanf|অ্যারে|array|অ্যালগরিদম|algorithm|ফ্লোচার্ট|flowchart|কম্পাইলার|compiler|ইন্টারপ্রেটার|interpreter|হেডার ফাইল|header file|stdio\.h|math\.h|ডাটা টাইপ|data type|int |float |char |double |কী-ওয়ার্ড|keyword|অপারেটর|operator|কন্ডিশন|condition|if-else|switch|case|break|continue|পয়েন্টার|সোর্স কোড|অবজেক্ট কোড/i
  },
  {
    chapter: "অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম",
    defaultTopic: "ডাটাবেজ ম্যানেজমেন্ট (DBMS)",
    regex: /ডাটাবেজ|database|dbms|rdbms|sql|ফিল্ড|field|রেকর্ড|record|প্রাইমারি কী|primary key|কম্পোজিট কী|ফরেন কী|foreign key|কুয়েরি|query|কোয়েরি|রিলেশন|relationship|ইনডেক্স|index|সর্টিং|sorting|সার্চিং|রিপোর্ট|report|ডাটাবেজ নিরাপত্তা|নর্মালাইজেশন|normalization|ddl|dml/i
  }
];

async function main() {
  let questions = [];

  // Check MongoDB configuration
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error(
      "MONGO_URI is not configured in environment variables."
    );
  }

  // Check required files
  if (!fs.existsSync(filePath)) {
    throw new Error(`Question JSON file not found: ${filePath}`);
  }

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Question model not found: ${modelPath}`);
  }

  // Read questions
  questions = JSON.parse(
    fs.readFileSync(filePath, "utf-8")
  );

  if (!Array.isArray(questions)) {
    throw new Error("Invalid question JSON format. Expected an array.");
  }

  console.log("Total questions in file:", questions.length);

  let reclassified = 0;
  const chapterCounts = {};

  for (const q of questions) {
    const questionText = q.question || "";

    for (const rule of CHAPTER_RULES) {
      if (rule.regex.test(questionText)) {
        if (q.chapter !== rule.chapter) {
          q.chapter = rule.chapter;
          q.topic = rule.defaultTopic;
          reclassified++;
        }
        break;
      }
    }

    chapterCounts[q.chapter] =
      (chapterCounts[q.chapter] || 0) + 1;
  }

  console.log("Reclassified questions:", reclassified);
  console.log("Updated Chapter Breakdown in JSON:");
  console.log(chapterCounts);

  // Save updated JSON
  fs.writeFileSync(
    filePath,
    JSON.stringify(questions, null, 2),
    "utf-8"
  );

  console.log("JSON file updated successfully.");

  // Connect to MongoDB
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(uri);

    console.log("MongoDB connected successfully.");

    const Question = (
      await import(modelPath)
    ).default;

    let updated = 0;

    // Update MongoDB questions
    for (const q of questions) {
      const result = await Question.updateOne(
        { question: q.question },
        {
          $set: {
            chapter: q.chapter,
            topic: q.topic
          }
        }
      );

      updated += result.modifiedCount || 0;
    }

    console.log(
      `MongoDB update completed. Modified questions: ${updated}`
    );

  } catch (error) {
    console.error("Reclassification error:", error.message);
    throw error;

  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("MongoDB disconnected.");
    }
  }
}

main().catch((error) => {
  console.error("Script failed:", error.message);
  process.exitCode = 1;
});
