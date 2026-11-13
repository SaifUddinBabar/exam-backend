import mongoose from "mongoose";
import config from "../config/env.js";
import Exam from "../models/Exam.js";
import Question from "../models/Question.js";

await mongoose.connect(config.mongoUri);

console.log("Seeding realistic exams using existing real questions in database...");

// 1. Communication Systems Exam (25 real questions)
const commQuestions = await Question.find({ chapter: "Communication Systems" }).limit(25);
if (commQuestions.length >= 20) {
  const code1 = "EXAM-ICT-01";
  await Exam.deleteOne({ examCode: code1 });
  const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future
  await Exam.create({
    title: "HSC 2027 ICT — Model Test 01 (Communication Systems)",
    description: "উচ্চমাধ্যমিক তথ্য ও যোগাযোগ প্রযুক্তি — অধ্যায় ২: কমিউনিকেশন সিস্টেম ও নেটওয়ার্কিং। ২৫টি বহুনির্বাচনী প্রশ্ন, প্রতিটি সঠিক উত্তরে ১ নম্বর, ভুল উত্তরে -০.২৫ নম্বর।",
    questions: commQuestions.map(q => q._id.toString()),
    examCode: code1,
    duration: 25,
    examType: "scheduled",
    negativeMarkPerWrong: 0.25,
    allowRetake: false,
    maxAttempts: 1,
    startTime: new Date(),
    endTime: futureEnd,
    isPublished: true,
  });
  console.log(`✓ Created ${code1} with ${commQuestions.length} real questions.`);
}

// 2. Number System & Digital Device Drill (15 real questions)
const numQuestions = await Question.find({ chapter: "Number System & Digital Device" }).limit(15);
if (numQuestions.length > 0) {
  const code2 = "EXAM-ICT-02";
  await Exam.deleteOne({ examCode: code2 });
  await Exam.create({
    title: "ICT — Number Systems & Digital Device Drill",
    description: "অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস — স্বচালিত প্র্যাকটিস সেট। আনলিমিটেড রিটেক সাপোর্ট।",
    questions: numQuestions.map(q => q._id.toString()),
    examCode: code2,
    duration: 15,
    examType: "practice",
    negativeMarkPerWrong: 0,
    allowRetake: true,
    maxAttempts: 5,
    startTime: new Date(),
    endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isPublished: true,
  });
  console.log(`✓ Created ${code2} with ${numQuestions.length} real questions.`);
}

// 3. Board Questions Comprehensive (30 real questions)
const boardQuestions = await Question.find({ chapter: "Board Questions" }).limit(30);
if (boardQuestions.length >= 20) {
  const code3 = "EXAM-ICT-03";
  await Exam.deleteOne({ examCode: code3 });
  await Exam.create({
    title: "HSC ICT — বিগত বোর্ড প্রশ্নমালা সমন্বিত টেস্ট",
    description: "ঢাকা, রাজশাহী, চট্টগ্রাম ও অন্যান্য শিক্ষা বোর্ডের এইচএসসি চূড়ান্ত পরীক্ষার সেরা প্রশ্নাবলি।",
    questions: boardQuestions.map(q => q._id.toString()),
    examCode: code3,
    duration: 30,
    examType: "practice",
    negativeMarkPerWrong: 0.25,
    allowRetake: true,
    maxAttempts: 3,
    startTime: new Date(),
    endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isPublished: true,
  });
  console.log(`✓ Created ${code3} with ${boardQuestions.length} real questions.`);
}

// 4. Introduction to ICT (20 real questions)
const introQuestions = await Question.find({ chapter: "Introduction to ICT" }).limit(20);
if (introQuestions.length >= 15) {
  const code4 = "EXAM-ICT-04";
  await Exam.deleteOne({ examCode: code4 });
  await Exam.create({
    title: "ICT — Introduction to ICT Weekly Test",
    description: "অধ্যায় ১: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত — সাপ্তাহিক পরীক্ষা।",
    questions: introQuestions.map(q => q._id.toString()),
    examCode: code4,
    duration: 20,
    examType: "scheduled",
    negativeMarkPerWrong: 0.25,
    allowRetake: false,
    maxAttempts: 1,
    startTime: new Date(),
    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    isPublished: true,
  });
  console.log(`✓ Created ${code4} with ${introQuestions.length} real questions.`);
}

const totalExams = await Exam.countDocuments({});
console.log(`Done! Total exams in database: ${totalExams}`);
await mongoose.disconnect();
