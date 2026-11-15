import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runAudit() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas');
  const db = mongoose.connection.db;
  const questionsColl = db.collection('questions');

  const total = await questionsColl.countDocuments();
  console.log(`Auditing all ${total} questions...`);

  // Keywords that definitely belong to Chemistry / Biology / Physics / Economics / English Literature
  // and NOT HSC ICT (HSC ICT Chapters: Ch 1: World & BD, Ch 2: Comm & Net, Ch 3: Numbers & Digital Devices, Ch 4: Web Design/HTML, Ch 5: C Programming, Ch 6: DBMS/SQL)
  const chemBioRegex = /(aerobic respiration|C6H12O6|photosynthesis|mitochondria|H2SO4|NaOH|HCl|NaCl|chlorine|sodium|ammonia|Haber process|সালোকসংশ্লেষণ|শ্বসন|অ্যালকেন|অ্যালকিন|অ্যালকাইন|জারণ-বিজারণ|পর্যায় সারণী|যোজনী|হাইড্রোজেন আয়ন|মোলার দ্রবণ|মাইটোকন্ড্রিয়া|রাইবোসোম|ক্লোরোপ্লাস্ট)/i;
  const physicsNonICTRegex = /(gravitation|refraction of light|focal length|prism|newton's|coulomb|মহাকর্ষ|অভিকর্ষ|আলোর প্রতিসরণ|লেন্স|ফোকাস দূরত্ব|প্রিজম|কিলোওয়াট ঘণ্টা)/i;
  const econNonICTRegex = /(মুদ্রাস্ফীতি|চাহিদা ও জোগান|জিডিপি|জিএনপি|মূলধন বাজার|বাণিজ্যিক ব্যাংক|মুদ্রা বাজার|মার্জিনাল কস্ট)/i;

  const allQuestions = await questionsColl.find({}).toArray();

  const flaggedMismatch = [];
  const duplicateMap = new Map();
  const duplicates = [];
  const missingOrGenericTopic = [];
  const malformedQuestions = [];
  const imageQuestions = [];

  for (const q of allQuestions) {
    const qId = q._id.toString();
    const qText = (q.question || q.questionText || q.text || '').trim();
    const chapter = (q.chapter || '').trim();
    const subject = (q.subject || 'ICT').trim();
    const options = Array.isArray(q.options)
      ? q.options.map(o => (typeof o === 'string' ? o : o.text || ''))
      : [];
    const explanation = q.explanation || '';
    const fullText = [qText, ...options, explanation].join(' ');

    // 1. Duplicates Detection
    const norm = qText.replace(/<[^>]*>/g, '').toLowerCase().replace(/[\s\p{P}]+/gu, '');
    if (norm.length > 20) {
      if (duplicateMap.has(norm)) {
        duplicates.push({
          duplicateId: qId,
          originalId: duplicateMap.get(norm),
          chapter,
          preview: qText.slice(0, 70)
        });
      } else {
        duplicateMap.set(norm, qId);
      }
    }

    // 2. Missing or Generic Topics
    if (!q.topic || q.topic.trim() === '' || q.topic.toLowerCase() === 'general' || q.topic === 'সাধারণ' || q.topic === 'কমিউনিকেশন ও নেটওয়ার্কিং') {
      missingOrGenericTopic.push({
        qId,
        chapter,
        topic: q.topic || 'EMPTY',
        preview: qText.slice(0, 60)
      });
    }

    // 3. Malformed Questions / Options
    if (!qText || options.length < 2 || !q.correctAnswer) {
      malformedQuestions.push({
        qId,
        qText: qText || '[EMPTY]',
        optionsCount: options.length,
        hasCorrectAnswer: Boolean(q.correctAnswer)
      });
    }

    // 4. Images in Question or Options
    const rawImage = q.image || q.imageUrl || (Array.isArray(q.images) && q.images[0]) || '';
    const htmlImgMatch = fullText.match(/<img[^>]+src=["']([^"']+)["']/i) || fullText.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg))/i);
    const resolvedImage = rawImage || (htmlImgMatch ? htmlImgMatch[1] : '');

    if (resolvedImage) {
      imageQuestions.push({
        qId,
        chapter,
        imgUrl: resolvedImage,
        preview: qText.slice(0, 50)
      });
    }

    // 5. Subject Mismatch
    let reason = null;
    let suggestedSubject = null;
    let suggestedChapter = null;

    if (chemBioRegex.test(fullText)) {
      const match = fullText.match(chemBioRegex)[0];
      reason = `Contains pure Chemistry/Biology concept or formula (${match}) inside ICT chapter`;
      suggestedSubject = 'Chemistry / Biology';
      suggestedChapter = 'Natural Sciences';
    } else if (physicsNonICTRegex.test(fullText)) {
      const match = fullText.match(physicsNonICTRegex)[0];
      reason = `Contains non-ICT Physics concept (${match}) inside ICT chapter`;
      suggestedSubject = 'Physics';
      suggestedChapter = 'General Physics';
    } else if (econNonICTRegex.test(fullText)) {
      const match = fullText.match(econNonICTRegex)[0];
      reason = `Contains Economics/Finance concept (${match}) inside ICT chapter`;
      suggestedSubject = 'Economics';
      suggestedChapter = 'Macro/Micro Economics';
    }

    if (reason) {
      flaggedMismatch.push({
        qId,
        question: qText,
        options,
        correctAnswer: q.correctAnswer,
        currentSubject: subject,
        currentChapter: chapter,
        currentTopic: q.topic,
        suggestedSubject,
        suggestedChapter,
        reason
      });
    }
  }

  // 6. Test Image URLs (Sample 20)
  console.log(`Found ${imageQuestions.length} questions with images. Testing sample URLs...`);
  const imageHealthSample = [];
  for (const imgItem of imageQuestions.slice(0, 20)) {
    let status = 'UNKNOWN';
    if (imgItem.imgUrl.startsWith('http')) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(imgItem.imgUrl, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(timeout);
        status = res.ok ? `ACTIVE (${res.status})` : `BROKEN (${res.status})`;
      } catch (e) {
        status = `BROKEN (${e.name === 'AbortError' ? 'TIMEOUT' : e.message})`;
      }
    } else if (imgItem.imgUrl.startsWith('data:image')) {
      status = 'ACTIVE (INLINE_BASE64)';
    } else {
      status = 'RELATIVE_PATH';
    }
    imageHealthSample.push({ ...imgItem, status });
  }

  const auditReport = {
    generatedAt: new Date().toISOString(),
    totalQuestions: total,
    summary: {
      totalQuestions: total,
      crossSubjectFlaggedCount: flaggedMismatch.length,
      duplicatesCount: duplicates.length,
      missingOrGenericTopicCount: missingOrGenericTopic.length,
      malformedQuestionsCount: malformedQuestions.length,
      questionsWithImagesCount: imageQuestions.length
    },
    crossSubjectMismatches: flaggedMismatch,
    duplicatesSample: duplicates.slice(0, 25),
    missingOrGenericTopicSample: missingOrGenericTopic.slice(0, 25),
    malformedQuestions,
    imageHealthSample
  };

  const outPath = path.join(__dirname, '../data_quality_audit_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(auditReport, null, 2), 'utf-8');
  console.log(`✅ Audit completed! Saved to ${outPath}`);

  await mongoose.disconnect();
}

runAudit().catch(console.error);
