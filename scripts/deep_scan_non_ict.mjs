import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function deepScan() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas');

  const questions = await mongoose.connection.db.collection('questions').find({}).toArray();
  console.log(`Total questions in database: ${questions.length}`);

  // Define comprehensive non-ICT patterns
  // 1. Chemistry patterns
  const chemPatterns = [
    { name: 'Chemical Equation', regex: /(=>|→|⇌|\\rightleft|C6H12O6|H2SO4|NaOH|HCl|NaCl|NH3|KMnO4|CaCO3|CO2\s*\+|H2O\s*\+)/i },
    { name: 'Stoichiometry / Titration', regex: /(mol\s*dm-3|মোলার দ্রবণ|মোলারিটি|টাইট্রেশন|প্রশমন বিক্রিয়া|কস্টিক সোডা|সালফিউরিক এসিড|হাইড্রোক্লোরিক)/i },
    { name: 'Organic Chemistry', regex: /(অ্যালকেন|অ্যালকিন|অ্যালকাইন|বেঞ্জিন|অ্যালকোহল|পলিমারকরণ|কার্যকরী মূলক)/i },
    { name: 'Thermochemistry', regex: /(kJ\s*\/\s*mol|তাপনাল্পি|বিক্রিয়া তাপ|দহন তাপ|এনথালপি)/i },
    { name: 'General Chemistry', regex: /(যোজনী|ইলেকট্রন বিন্যাস|পর্যায় সারণি|লুইস এসিড|জারণ সংখ্যা|বিজারণ|আইসোটোপ|তেজস্ক্রিয়তা|হেবার পদ্ধতি)/i }
  ];

  // 2. Biology patterns (outside ICT Ch 1 biotechnology)
  const bioPatterns = [
    { name: 'Cellular Respiration / Photosynthesis', regex: /(aerobic respiration|anaerobic respiration|সালোকসংশ্লেষণ|শ্বসন প্রক্রিয়া|গ্লাইকোলাইসিস|ক্রেবস চক্র)/i },
    { name: 'Cell Biology', regex: /(মাইটোকন্ড্রিয়া|ক্লোরোপ্লাস্ট|রাইবোজোম|গলজি বস্তু|লাইসোজোম|কোষপ্রাচীর|প্লাস্টিড)/i },
    { name: 'Plant / Animal Physiology', regex: /(রক্ত সংবহন|হৃৎপিণ্ড|রক্তকণিকা|প্লাজমা|স্নায়ুতন্ত্র|হরমোন|এনজাইম)/i }
  ];

  // 3. Physics (Non-ICT) patterns
  const physicsPatterns = [
    { name: 'Geometrical Optics', regex: /(convex lens|concave lens|focal length|লেন্স|ফোকাস দূরত্ব|প্রিজম|আলোর প্রতিসরণ|দর্পণ|বিবর্ধন)/i },
    { name: 'Mechanics / Gravity', regex: /(মহাকর্ষ|অভিকর্ষজ ত্বরণ|গতির সমীকরণ|ভরবেগ|ঘর্ষণ বল|নিউটনের গতিসূত্র|কাজ ও ক্ষমতা|কিলোওয়াট ঘণ্টা)/i },
    { name: 'Electricity / Magnetism (Non-Digital)', regex: /(কুলম্বের সূত্র|ধারকত্ব|তড়িৎ ক্ষেত্র|চৌম্বক ক্ষেত্র|গ্যালভানোমিটার)/i }
  ];

  // 4. Economics & Banking
  const econPatterns = [
    { name: 'Banking / Finance', regex: /(বাণিজ্যিক ব্যাংক|কেন্দ্রীয় ব্যাংক|মুদ্রা বাজার|শেয়ার বাজার|মুনাফার হার)/i },
    { name: 'Economics', regex: /(মুদ্রাস্ফীতি|চাহিদা ও জোগান|জিডিপি|জিএনপি|ব্যষ্টিক অর্থনীতি|সমষ্টিক অর্থনীতি)/i }
  ];

  const flaggedList = [];
  const chapterCounts = {};

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const text = (q.question || q.questionBn || q.questionEn || '').trim();
    const opts = Array.isArray(q.options) ? q.options.join(' ') : '';
    const exp = q.explanation || '';
    const fullText = `${text} ${opts} ${exp}`;
    const chapter = (q.chapter || 'Unassigned').trim();

    // Check if it's a false positive in Chapter 1:
    // Ch 1 covers: Cryosurgery (uses Liquid Nitrogen/Argon, liver cancer), Genetic Engineering (GMO, DNA, genes), Biometrics, Nanotechnology
    const isCh1 = chapter.includes('অধ্যায় ১') || chapter.includes('বিশ্ব ও বাংলাদেশ') || chapter.includes('Introduction to ICT');

    let matchedDomain = null;
    let matchedReason = null;

    // Check Chemistry
    for (const p of chemPatterns) {
      if (p.regex.test(fullText)) {
        // Exclude Cryosurgery medical gases in Ch 1
        if (isCh1 && (fullText.includes('ক্রায়োসার্জারি') || fullText.includes('ক্রায়োজেনিক') || fullText.includes('আর্গন'))) {
          continue;
        }
        matchedDomain = 'Chemistry';
        matchedReason = p.name;
        break;
      }
    }

    // Check Biology
    if (!matchedDomain) {
      for (const p of bioPatterns) {
        if (p.regex.test(fullText)) {
          // Exclude Ch 1 Genetic Engineering (DNA, জিএমও)
          if (isCh1 && (fullText.includes('জেনেটিক ইঞ্জিনিয়ারিং') || fullText.includes('বায়োটেকনোলজি') || fullText.includes('বায়োমেট্রিক্স'))) {
            continue;
          }
          matchedDomain = 'Biology';
          matchedReason = p.name;
          break;
        }
      }
    }

    // Check Physics
    if (!matchedDomain) {
      for (const p of physicsPatterns) {
        if (p.regex.test(fullText)) {
          // Exclude Ch 1 Cryosurgery lens replacement if it's general surgery question
          matchedDomain = 'Physics';
          matchedReason = p.name;
          break;
        }
      }
    }

    // Check Economics
    if (!matchedDomain) {
      for (const p of econPatterns) {
        if (p.regex.test(fullText)) {
          // Exclude e-commerce / online banking in Ch 1 / Ch 2
          if (fullText.includes('ই-কমার্স') || fullText.includes('অনলাইন ব্যাংকিং') || fullText.includes('মোবাইল ব্যাংকিং')) {
            continue;
          }
          matchedDomain = 'Economics / Banking';
          matchedReason = p.name;
          break;
        }
      }
    }

    if (matchedDomain) {
      flaggedList.push({
        index: i + 1,
        id: q._id.toString(),
        chapter,
        topic: q.topic || '',
        matchedDomain,
        matchedReason,
        question: text.slice(0, 100),
        fullQuestion: text,
        correctAnswer: q.correctAnswer
      });

      chapterCounts[chapter] = (chapterCounts[chapter] || 0) + 1;
    }
  }

  console.log('\n======================================================');
  console.log(`SCAN COMPLETE: Found ${flaggedList.length} potential non-ICT questions.`);
  console.log('======================================================');
  console.log('Breakdown by Chapter:');
  console.log(JSON.stringify(chapterCounts, null, 2));

  fs.writeFileSync(path.join(__dirname, '../non_ict_questions_full_scan.json'), JSON.stringify({
    totalScanned: questions.length,
    totalFlagged: flaggedList.length,
    chapterCounts,
    flaggedList
  }, null, 2));

  await mongoose.disconnect();
}

deepScan().catch(console.error);
